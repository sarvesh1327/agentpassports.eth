# AgentPassports MCP Server

This package exposes AgentPassports.eth as a Model Context Protocol server for autonomous agents.
It uses the current MCP TypeScript SDK with stdio transport so a local agent runtime can launch it as a subprocess without opening an HTTP port.

## Run

From the repo root:

```bash
pnpm mcp:start
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
AGENT_PRIVATE_KEY=0x... # only required for sign_task_intent
```

`AGENT_PRIVATE_KEY` is never sent to the browser or relayer. It is only used locally by `sign_task_intent` after the server re-resolves ENS and confirms the key matches `addr(agentName)`.

## Tools

- `resolve_agent_passport`: resolve live ENS node, resolver, signer address, gas budget, nonce, and AgentPassports text records.
- `list_owner_agents`: read `agentpassports.agents` from an owner ENS name and resolve every listed agent passport.
- `get_agent_policy`: load policy fields from ENS text records, require `agent.status` is exactly `active`, and verify the computed digest matches `agent.policy.digest`.
- `check_task_against_policy`: preflight task value, target, selector, and policy digest before any signing.
- `build_task_intent`: build `TaskLog.recordTask` calldata and an unsigned `AgentEnsExecutor.TaskIntent` from live ENS policy and nonce state.
- `sign_task_intent`: sign the prepared intent with the local agent key after re-checking live ENS signer and exact status.
- `submit_task`: send the signed payload to the AgentPassports relayer, which repeats ENS and signature checks before broadcasting.

## Safety flow

Never sign before the agent has resolved ENS live in the same flow.
Never sign if `agent.status` is not exactly `active`.
Never sign if the computed policy snapshot digest does not match the live ENS `agent.policy.digest`.
Never bypass `check_task_against_policy` for a natural-language task.
