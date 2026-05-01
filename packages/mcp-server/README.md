# AgentPassports MCP Server

This package exposes AgentPassports.eth as a Model Context Protocol server for autonomous agents.
It supports stdio transport for subprocess-based MCP clients and a local Streamable HTTP endpoint for agents that connect to an already-running server at `http://localhost:3333/mcp`.

## Run

From the repo root:

```bash
pnpm mcp:start
```

For a local hosted MCP server, run:

```bash
pnpm mcp:http
```

The Streamable HTTP endpoint is:

```text
http://localhost:3333/mcp
```

Or directly:

```bash
pnpm --filter @agentpassport/mcp-server start
```

## Environment

The server reads operational values from local environment variables:

```txt
CHAIN_ID=11155111
RPC_URL=https://...
ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
EXECUTOR_ADDRESS=0xAgentEnsExecutor
TASK_LOG_ADDRESS=0xTaskLog
RELAYER_URL=http://localhost:3000/api/relayer/execute
KEEPERHUB_API_KEY=...
KEEPERHUB_API_BASE_URL=https://app.keeperhub.com
KEEPERHUB_WORKFLOW_ID=optional_existing_workflow_id
```

Keep KeeperHub credentials in the local runtime environment only. Do not paste them into prompts, docs, tests, or workflow payloads.

The MCP server does not read or store agent private keys. Signing happens outside the MCP server using the AgentPassports skill-provided signing script or another wallet flow controlled by the agent/user environment.

## Tools

- `resolve_agent_passport`: resolve live ENS node, resolver, signer address, gas budget, nonce, and AgentPassports text records.
- `list_owner_agents`: read `agentpasspports_agents` from an owner ENS name and resolve every listed agent passport.
- `get_agent_policy`: load policy fields from ENS text records, require `agent.status` is exactly `active`, and verify the computed digest matches `agent.policy.digest`.
- `check_task_against_policy`: preflight task value, target, selector, and policy digest before any signing.
- `build_task_intent`: build `TaskLog.recordTask` calldata and unsigned intent JSON from live ENS policy and nonce state.
- `submit_task`: send the externally signed payload to the AgentPassports relayer, which repeats ENS and signature checks before broadcasting.
- `keeperhub_validate_agent_task`: resolve the ENS passport, check live status and policy, and return a deterministic KeeperHub Gate decision as `approved` or `blocked`.
- `keeperhub_build_workflow_payload`: build an unsigned KeeperHub workflow payload only after the gate has approved the task.
- `keeperhub_emit_run_attestation`: emit run attestation JSON for either approved or blocked KeeperHub execution paths.
- `keeperhub_list_workflows`: list live KeeperHub workflows using runtime credentials without returning secrets.
- `keeperhub_create_gate_workflow`: create the verified AgentPassports V3 gate workflow shape with required `name`, `nodes`, and `edges`.
- `keeperhub_execute_approved_workflow`: run the full live V3 path: validate ENS gate, skip KeeperHub if blocked, build unsigned payload if approved, execute KeeperHub, fetch status/logs, and return an attestation.
- `keeperhub_get_execution_status`: fetch live KeeperHub execution status.
- `keeperhub_get_execution_logs`: fetch live KeeperHub execution logs and `runId` when available.

## KeeperHub Gate action-pack workflow

AgentPassports is the ENS trust firewall in front of KeeperHub execution. The KeeperHub Gate action pack is intentionally small and auditable:

1. Resolve the agent ENS passport and current policy.
2. Produce a deterministic `approved` or `blocked` gate decision with `keeperhub_validate_agent_task`.
3. Build an unsigned KeeperHub workflow payload with `keeperhub_build_workflow_payload` only for approved work.
4. Use external signing outside MCP. The MCP server does not read or store agent private keys.
5. Use `keeperhub_create_gate_workflow` once to create the verified live KeeperHub workflow shape, or reuse `KEEPERHUB_WORKFLOW_ID`.
6. Use `keeperhub_execute_approved_workflow` for the live path. It validates the ENS gate first, does not call KeeperHub if blocked, executes KeeperHub only when approved, then fetches `keeperhub_get_execution_status` and `keeperhub_get_execution_logs` evidence.
7. Emit or return a run attestation with `keeperhub_emit_run_attestation` so approved and blocked autonomous runs have auditable proof.

The simple verified manual-trigger workflow accepted an execution body, but arbitrary body persistence was not proven in KeeperHub logs for that workflow shape. Treat KeeperHub status, execution id, and logs `runId` as live execution evidence; treat AgentPassports workflow payload as the local audit payload until a consuming KeeperHub node is proven.

Safety boundaries for this iteration:

- No private keys in MCP tools, docs, or runtime state.
- Live KeeperHub API calls require `KEEPERHUB_API_KEY` in runtime env and must never expose that secret.
- No contract changes are required for the KeeperHub Gate skeleton.

MCP discoverability:

- Prompt: `agentpassport_keeperhub_gate` guides agents through the V3 KeeperHub Gate flow.
- Resource: `agentpassport://keeperhub/{agentName}` returns JSON guidance for tool order, safety boundaries, workflow artifacts, and run attestation schema.

Tracked action-pack artifacts:

- `packages/mcp-server/keeperhub/action-pack.md`
- `packages/mcp-server/keeperhub/workflow-template.json`
- `packages/mcp-server/keeperhub/run-attestation-schema.json`

## Uniswap experimental module

Uniswap remains an experimental policy-gated action module, not the main KeeperHub demo path. Quote and policy-validation helpers can stay useful as proof metadata, but full gasless sponsored swaps are frozen because the current flow hits the initial ERC20 approval / Permit2 setup problem while the agent holds no gas token.

Do not present Uniswap as a completed sponsored-swap path until the initial approval/delegation architecture is proven separately.

## Signing script

`build_task_intent` returns intent JSON plus signing metadata. The MCP server does not own agent private keys and does not provide the signing script as a package command. Agents should download or copy the skill-provided signing script from `skills/agentpassports/sign-intent.ts` into the agent/user-controlled signing environment, sign the exact intent JSON there, and return only the signature to `submit_task`.

## Safety flow

Never sign before the agent has resolved ENS live in the same flow.
Never sign if `agent.status` is not exactly `active`.
Never sign if the computed policy snapshot digest does not match the live ENS `agent.policy.digest`.
Never bypass `check_task_against_policy` for a natural-language task.
