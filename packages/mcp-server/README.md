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
```

The MCP server does not read or store agent private keys. Signing happens outside the MCP server using the AgentPassports skill-provided signing script or another wallet flow controlled by the agent/user environment.

## Tools

- `resolve_agent_passport`: resolve live ENS node, resolver, signer address, gas budget, nonce, and AgentPassports text records.
- `list_owner_agents`: read `agentpassports.agents` from an owner ENS name and resolve every listed agent passport.
- `get_agent_policy`: load policy fields from ENS text records, require `agent.status` is exactly `active`, and verify the computed digest matches `agent.policy.digest`.
- `check_task_against_policy`: preflight task value, target, selector, and policy digest before any signing.
- `build_task_intent`: build `TaskLog.recordTask` calldata and unsigned intent JSON from live ENS policy and nonce state.
- `submit_task`: send the externally signed payload to the AgentPassports relayer, which repeats ENS and signature checks before broadcasting.

## Signing script

`build_task_intent` returns intent JSON plus signing metadata. The MCP server does not own agent private keys and does not provide the signing script as a package command. Agents should download or copy the skill-provided signing script from `skills/agentpassports/sign-intent.ts` into the agent/user-controlled signing environment, sign the exact intent JSON there, and return only the signature to `submit_task`.

## Safety flow

Never sign before the agent has resolved ENS live in the same flow.
Never sign if `agent.status` is not exactly `active`.
Never sign if the computed policy snapshot digest does not match the live ENS `agent.policy.digest`.
Never bypass `check_task_against_policy` for a natural-language task.
