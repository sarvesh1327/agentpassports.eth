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
RPC_URL=[REDACTED_RPC_URL]
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
   - Builds `TaskLog.recordTask` calldata by default, or binds exact caller-provided `callData` for a policy-approved target such as Uniswap `SwapRouter02.exactInputSingle`.
   - Builds unsigned EIP-712 intent JSON from explicit public arguments.
   - May read only the executor nonce when a nonce is not supplied.
   - Does not resolve ENS, read Passport/Visa records, or decide whether the task is allowed.
2. `submit_task`
   - Sends the externally signed payload to the configured KeeperHub workflow.
   - For owner-funded ERC20 swaps, callers may include `ownerFundedErc20` (`tokenIn`, `amount`) and `swapContext` (`tokenOut`, recipient/slippage/deadline/chain context); MCP forwards these fields to KeeperHub and appends `tokenIn`/`amount` to `functionArgs` for `AgentEnsExecutor.executeOwnerFundedERC20`.
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

## Owner-funded Uniswap swaps

The proven Sepolia swap path is owner-funded Uniswap, still through the same thin MCP tools. MCP does **not** quote, check allowance, resolve ENS, or decide whether the swap is allowed. KeeperHub validates Passport/Visa and Uniswap policy gates, then executes only after every gate passes.

Safety model:

- Owner wallet holds `tokenIn` and approves `AgentEnsExecutor`; registration and MCP never grant token approval.
- The agent wallet signs the exact intent only, without the agent wallet holding gas token or user funds for this path.
- No docs or helpers should require the agent wallet to approve Permit2.
- No vault funding is required in this pass.
- KeeperHub execution evidence is authoritative: `check_task_status` should show the execution id, final status, tx hash when present, blocked stamp such as `UNISWAP_TOKEN_IN_BLOCKED`, or failed node such as `agentens_execute`.

Public Sepolia constants for the current live workflow:

```txt
KEEPERHUB_WORKFLOW_ID=kah3xyaxk2uskluggff4q
AgentEnsExecutor=0xce3e365214568E96d4186464089438a89331941F
TaskLog=0x9f384B659da5F24994BC5c2a10B4243F07aA889b
SwapRouter02=0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E
exactInputSingle selector=0x04e45aaf
WETH=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
UNI=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
```

High-level flow:

1. Owner registers an AgentPassports Uniswap policy whose target is `SwapRouter02` and selector is `0x04e45aaf`.
2. Owner approves `AgentEnsExecutor` for the exact `tokenIn` spend budget outside MCP.
3. Caller builds `SwapRouter02.exactInputSingle` calldata for the approved token pair, amount, recipient, deadline, and slippage.
4. Call `build_task_intent` with the exact router `callData` and a policy snapshot whose target/selector match the router call. The returned typed data binds the router calldata hash.
5. Sign the returned intent locally with `skills/agentpassports/sign-intent.ts`; never send a private key to MCP.
6. Call `submit_task` with the signed payload plus:

```json
{
  "ownerFundedErc20": {
    "tokenIn": "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    "amount": "10000000000000"
  },
  "swapContext": {
    "chainId": "11155111",
    "tokenOut": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    "recipient": "0xOwnerWallet",
    "slippageBps": "50",
    "deadlineSeconds": "1200"
  }
}
```

MCP forwards those public fields to KeeperHub and builds `functionArgs` for:

```txt
AgentEnsExecutor.executeOwnerFundedERC20(serializedIntent, serializedPolicy, callData, signature, tokenIn, amount)
```

Then call `check_task_status` for the execution id. A missing owner approval should fail safely at `agentens_execute` without a tx hash; a disallowed token should stop earlier with a blocked stamp like `UNISWAP_TOKEN_IN_BLOCKED`.

## Safety flow

- Never put private keys, API keys, RPC credentials, or KeeperHub secrets in MCP prompts, docs, tests, commits, or tool arguments.
- Never alter the `build_task_intent` output between build and signing.
- Never pass a private key into MCP.
- Use `submit_task` to hand the signed payload to KeeperHub.
- Use `check_task_status` to fetch final status/logs/tx evidence from KeeperHub.
- Report KeeperHub output as authoritative for Passport/Visa checks, policy validation, execution status, and errors.
