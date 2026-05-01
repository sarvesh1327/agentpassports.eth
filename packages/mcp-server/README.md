# AgentPassports MCP Server

This package exposes AgentPassports.eth as a Model Context Protocol server for autonomous agents.
It supports stdio transport for subprocess-based MCP clients and a local Streamable HTTP endpoint for agents that connect to an already-running server at `http://localhost:3333/mcp`.

The MCP server is intentionally **thin**. It builds unsigned task intents from explicit public inputs, submits externally signed payloads to KeeperHub, and checks KeeperHub execution status. KeeperHub is authoritative for Passport/Visa identity, policy validation, workflow routing, and execution.

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
pnpm --filter @agentpassport/mcp-server http
```

When running from the package through pnpm and using a repo-root `.env`, pass the dotenv path explicitly if needed:

```bash
DOTENV_CONFIG_PATH=/absolute/path/to/agentpassports.eth/.env pnpm --filter @agentpassport/mcp-server http
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
KEEPERHUB_API_KEY=[local only]
KEEPERHUB_API_BASE_URL=https://app.keeperhub.com
KEEPERHUB_WORKFLOW_ID=optional_existing_workflow_id
```

Keep KeeperHub credentials in the local runtime environment only. Do not paste them into prompts, docs, tests, commits, or workflow payloads.

The MCP server does not read or store agent private keys. External signing happens outside the MCP server using the AgentPassports skill-provided signing script or another wallet flow controlled by the agent/user environment.

## Tools

The public MCP tool surface is exactly:

1. `build_task_intent`
   - Builds `TaskLog.recordTask` calldata and unsigned EIP-712 intent JSON from explicit public arguments.
   - May read only the executor nonce when a nonce is not supplied.
   - Does not resolve ENS, read Passport/Visa records, or decide whether the task is allowed.
2. `submit_task`
   - Sends the externally signed payload to the configured KeeperHub workflow.
   - Returns a KeeperHub execution id quickly by default.
   - Does not wait for final workflow completion unless the caller explicitly opts into bounded waiting.
3. `check_task_status`
   - Fetches KeeperHub status/logs for a submitted execution id.
   - Returns final status, KeeperHub errors, node evidence, and any tx hash found in KeeperHub logs/status.

No MCP tool creates keys, receives private keys, resolves ENS Passport state, performs policy validation, or locally preflights KeeperHub authorization. Those checks belong to KeeperHub.

## Thin KeeperHub flow

Use this order for autonomous execution:

1. Prepare explicit public task/policy inputs approved by the user or local agent environment.
2. Call `build_task_intent` and save the exact returned JSON.
3. Sign locally outside MCP with the skill-provided signing script from `skills/agentpassports/sign-intent.ts`, or with a user-controlled wallet.
4. Call `submit_task` with the signed payload. The default response returns the KeeperHub execution id and initial submission response.
5. Call `check_task_status` with the execution id until KeeperHub reaches a terminal state.
6. Report the KeeperHub execution id, final status, node evidence, tx hash if present, and any KeeperHub error.

KeeperHub remains the Passport/Visa validator and executor. The MCP server is a transport/build helper, not an authorization oracle.

## KeeperHub action-pack notes

The tracked action-pack docs describe the same build-submit-status flow and the live KeeperHub evidence model:

- `packages/mcp-server/keeperhub/action-pack.md`
- `packages/mcp-server/keeperhub/workflow-template.json`
- `packages/mcp-server/keeperhub/run-attestation-schema.json`

Treat KeeperHub execution id, status, logs, and tx hash evidence as the source of truth for a run. If KeeperHub returns `running`, keep polling with `check_task_status`. If KeeperHub returns `error` or blocked workflow evidence, report that output directly instead of converting it into a local MCP decision.

## MCP discoverability

- Prompt: `agentpassport_keeperhub_gate` guides agents through the thin KeeperHub flow.
- Resource: `agentpassport://keeperhub/{agentName}` returns JSON guidance for tool order, safety boundaries, signing script location, and KeeperHub status checks.

## Uniswap experimental module

Uniswap remains an experimental policy-gated action module, not the main KeeperHub demo path. Quote and policy-validation helpers can stay useful as proof metadata, but full gasless sponsored swaps are frozen because the current flow hits the initial ERC20 approval / Permit2 setup problem while the agent holds no gas token.

Do not present Uniswap as a completed sponsored-swap path until the initial approval/delegation architecture is proven separately.

## Safety flow

- Never put private keys, API keys, RPC credentials, or KeeperHub secrets in MCP prompts, docs, tests, commits, or tool arguments.
- Never alter the `build_task_intent` output between build and signing.
- Never pass a private key into MCP.
- Use `submit_task` to hand the signed payload to KeeperHub.
- Use `check_task_status` to fetch final status/logs/tx evidence from KeeperHub.
- Report KeeperHub output as authoritative for Passport/Visa checks, policy validation, execution status, and errors.
