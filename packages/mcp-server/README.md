# AgentPassports MCP Server

The AgentPassports MCP Server exposes AgentPassports.eth to autonomous agents as a thin runtime bridge.

It does **not** authorize tasks locally. MCP builds unsigned task intents from explicit public inputs, accepts externally signed payloads, submits them to KeeperHub, and checks KeeperHub execution status. **KeeperHub is authoritative** for Passport/Visa reads, policy validation, workflow routing, execution, and KeeperHub Stamps.

## Endpoint and transports

From the repo root:

```bash
pnpm mcp:start
```

Hosted local Streamable HTTP server:

```bash
pnpm mcp:http
```

Endpoint:

```txt
http://localhost:3333/mcp
```

Package-local commands:

```bash
pnpm --filter @agentpassport/mcp-server start
pnpm --filter @agentpassport/mcp-server http
```

If the package command needs the repo root env file explicitly:

```bash
DOTENV_CONFIG_PATH=/absolute/path/to/agentpassports.eth/.env pnpm --filter @agentpassport/mcp-server http
```

## Current Sepolia runtime

```txt
CHAIN_ID=11155111
ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
EXECUTOR_ADDRESS=0xce3e365214568E96d4186464089438a89331941F
TASK_LOG_ADDRESS=0x9f384B659da5F24994BC5c2a10B4243F07aA889b
KEEPERHUB_API_BASE_URL=https://app.keeperhub.com
KEEPERHUB_WORKFLOW_ID=<your_keeperhub_workflow_id>
```

Secret/local-only values:

```txt
RPC_URL=
KEEPERHUB_API_KEY=
```

Keep KeeperHub credentials, RPC URLs, private keys, and API keys in local environment files only. Do not paste them into prompts, tool arguments, docs, tests, or commits.

The MCP server does not read or store agent private keys. External signing happens outside MCP through the AgentPassports skill-provided signing script or a user/agent-controlled wallet.

## Public tool surface

The public MCP tool surface is intentionally small:

### `build_task_intent`

Builds unsigned EIP-712 task intent JSON from explicit public inputs.

- Default path: builds `TaskLog.recordTask` calldata.
- Advanced path: binds exact caller-provided `callData` for a Visa-approved target such as Uniswap `SwapRouter02.exactInputSingle`.
- May read only the executor nonce when the caller does not provide one.
- Does **not** resolve ENS, inspect Passport/Visa records, check policy status, or decide whether a task is allowed.

### `submit_task`

Submits an externally signed payload to the configured KeeperHub workflow.

- Returns a KeeperHub execution id quickly by default.
- Can optionally wait for bounded completion when requested.
- For owner-funded ERC20 swaps, forwards public `ownerFundedErc20` and `swapContext` fields to KeeperHub and builds function args for `AgentEnsExecutor.executeOwnerFundedERC20`.
- Does **not** validate Passport/Visa state locally.

### `check_task_status`

Polls KeeperHub for a submitted execution id.

- Returns final status when terminal.
- Returns KeeperHub errors, failed node evidence, blocked stamp evidence, and tx hash evidence when present.
- Treats KeeperHub logs/status as the source of truth.

No MCP tool creates keys, receives private keys, resolves ENS Passport state, performs policy validation, or locally preflights KeeperHub authorization.

## Thin Passport/Visa flow

1. Prepare explicit public task and Visa inputs approved by the owner or agent runtime.
2. Call `build_task_intent` and save the exact returned JSON.
3. Sign locally outside MCP with the skill-provided signing script from `skills/agentpassports/sign-intent.ts`, or with a user-controlled wallet.
4. Call `submit_task` with the signed payload.
5. Call `check_task_status` with the returned execution id until KeeperHub reaches a final status.
6. Report the execution id, final status, KeeperHub Stamp, failed node when present, tx hash when present, and any redacted KeeperHub error.

KeeperHub remains the Passport/Visa validator and executor. MCP is a transport/build helper, not an authorization oracle.

## MCP discoverability

- Prompt: `agentpassport_keeperhub_gate`
- Resource: `agentpassport://keeperhub/{agentName}`

The resource describes the same thin build → local sign → submit → status order, plus safety boundaries and KeeperHub status-check guidance.

## KeeperHub action-pack artifacts

Tracked artifacts for the KeeperHub integration live under:

- `packages/mcp-server/keeperhub/action-pack.md`
- `packages/mcp-server/keeperhub/workflow-template.json`
- `packages/mcp-server/keeperhub/run-attestation-schema.json`

Treat KeeperHub execution id, status, logs, tx hash, blocked stamps, and failed nodes as the evidence model for a run. If KeeperHub returns `running`, keep polling with `check_task_status`. If KeeperHub returns `error` or blocked workflow evidence, report that output directly instead of converting it into a local MCP decision.

## Owner-funded Uniswap swaps

The current proven swap path is owner-funded Uniswap on Sepolia.

Safety model:

- Owner wallet holds `tokenIn` and approves `AgentEnsExecutor` outside MCP.
- Agent wallet signs only the exact task intent.
- Agent wallet signs without the agent wallet holding gas token or user funds for this path.
- No docs or helpers should require the agent wallet to approve Permit2.
- No vault funding is required.
- KeeperHub validates the Passport, Visa Scope, token gates, amount limits, recipient, deadline/slippage context, and workflow path before execution.

Public Sepolia constants:

```txt
SwapRouter02=0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E
exactInputSingle selector=0x04e45aaf
WETH=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
UNI=0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
```

High-level swap flow:

1. Owner registers an AgentPassports Uniswap Visa whose target is `SwapRouter02` and selector is `0x04e45aaf`.
2. Owner approves `AgentEnsExecutor` for the exact `tokenIn` spend budget outside MCP.
3. Caller builds `SwapRouter02.exactInputSingle` calldata for the approved token pair, amount, recipient, deadline, and slippage.
4. Call `build_task_intent` with the exact router `callData` and a policy snapshot whose target/selector match the router call.
5. Sign the returned intent locally; never send a private key to MCP.
6. Call `submit_task` with the signed payload plus public swap context:

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

MCP forwards those public fields to KeeperHub and prepares function arguments for:

```txt
AgentEnsExecutor.executeOwnerFundedERC20(serializedIntent, serializedPolicy, callData, signature, tokenIn, amount)
```

Then call `check_task_status`. A disallowed token should stop with a blocked stamp such as `UNISWAP_TOKEN_IN_BLOCKED`; a missing owner approval should fail safely at `agentens_execute`; a successful workflow should return a tx hash.

## Safety rules

- Never pass a private key into MCP.
- Never alter the `build_task_intent` output between build and signing.
- Never put KeeperHub credentials, RPC URLs, API keys, or private keys in prompts, docs, tests, commits, or tool arguments.
- Use `submit_task` only for signed payloads.
- Use `check_task_status` for final status, KeeperHub Stamp evidence, errors, and tx hash proof.
- Report KeeperHub output as authoritative for Passport/Visa checks, policy validation, execution status, and errors.
