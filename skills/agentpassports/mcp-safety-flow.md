# AgentPassports MCP Thin Intent Flow

Use this skill after key setup when the user asks the agent to build and submit an AgentPassports task through MCP.

The current architecture is **KeeperHub-authoritative**:

- MCP does **not** resolve ENS names.
- MCP does **not** read or validate policy.
- MCP does **not** check active status, signer match, policy freshness, target, selector, value, spend limits, or action authorization.
- MCP does **not** create keypairs and does **not** sign.
- KeeperHub performs Passport/Visa validation and execution, then returns success/error to the agent.

## Connect to the MCP server

Use the hosted MCP server / system MCP server endpoint:

```text
https://mcp.agentpassports.xyz/mcp
```

List tools before acting. The only task tools expected from AgentPassports MCP are:

```text
build_task_intent
submit_task
check_task_status
```

Only call tools exposed by the hosted server. Do not configure RPC URLs, chain contracts, executor addresses, TaskLog addresses, relayers, or private keys in the agent prompt; those are operator/server runtime details.

## Required task order

1. `build_task_intent`
   - Provide explicit task, metadata URI, and policy snapshot inputs.
   - The tool builds `TaskLog.recordTask` calldata by default, or binds exact caller-provided `callData` for an already-prepared policy-approved router call.
   - It may read `AgentEnsExecutor.nextNonce(agentNode)` if no nonce is supplied. This is a nonce read, not an authorization check.
   - It does not verify that the policy snapshot is live or allowed.

2. Sign locally outside MCP
   - Download or copy the signing script from `skills/agentpassports/sign-intent.ts`.
   - Install local signing dependencies with `npm install viem tsx` if needed.
   - Input is the exact intent JSON returned by `build_task_intent`.
   - Private key stays in `.agentPassports/keys.txt` and never goes to MCP or chat; do not paste the private key in chat.
   - Key creation, if needed, uses `skills/agentpassports/create-key.ts`; it is not an MCP tool.

3. `submit_task` via MCP
   - Submit `intent`, `policySnapshot`, `callData`, and `signature` to KeeperHub.
   - MCP sends KeeperHub the payload as `{ input: payload }`.
   - MCP does not block locally if the payload looks invalid.
   - By default, `submit_task` returns a KeeperHub execution id/handle without waiting for final status.

4. `check_task_status` via MCP
   - Provide the KeeperHub execution id returned by `submit_task`.
   - The tool reads KeeperHub status/logs and returns current or final status plus tx hashes when available.
   - Return KeeperHub execution id, status/logs, tx hash, or KeeperHub error to the user.

## Owner-funded Uniswap branch

Use this branch only when the user has explicitly approved a swap test or production swap. It still uses the same three MCP tools; there are no separate Uniswap-prefixed MCP tools in the thin flow.

1. Preconditions
   - Owner wallet holds `tokenIn` and approves `AgentEnsExecutor` for the intended spend.
   - The agent wallet does not need gas token or user funds. Do not request Permit2 approval from the agent wallet.
   - The registered policy target is `SwapRouter02` and the selector is `exactInputSingle` (`0x04e45aaf`) for the current Sepolia path.
2. Build
   - Build the router calldata outside MCP, then call `build_task_intent` with that exact `callData` and a policy snapshot for the router target/selector.
   - The returned intent binds the calldata hash; do not edit the build output before signing.
3. Sign
   - Use `skills/agentpassports/sign-intent.ts` locally. The script signs any valid `build_task_intent` output, including owner-funded Uniswap calldata, but it does not submit or execute swaps.
4. Submit
   - Call `submit_task` with `intent`, `policySnapshot`, `callData`, `signature`, and public swap context:
     - `ownerFundedErc20.tokenIn`
     - `ownerFundedErc20.amount`
     - `swapContext.tokenOut`
     - optional `swapContext.recipient`, `swapContext.slippageBps`, `swapContext.deadlineSeconds`, and `swapContext.chainId`
   - MCP forwards these fields to KeeperHub and constructs `functionArgs` for `AgentEnsExecutor.executeOwnerFundedERC20(serializedIntent, serializedPolicy, callData, signature, tokenIn, amount)`.
5. Check status
   - Use `check_task_status` and report KeeperHub evidence. Disallowed tokens should show the token-in-blocked stamp; missing allowance should fail safely at `agentens_execute`; success should include a tx hash.

## Stop conditions

Stop only for local operational failures:

- MCP server is unavailable.
- `build_task_intent`, `submit_task`, or `check_task_status` is missing.
- The local signing key file is missing or unsafe.
- The signing script fails to produce a signature.
- KeeperHub API configuration is missing from the MCP server runtime.
- Do not paste `KEEPERHUB_API_KEY`, wallet secrets, `.env` contents, or `.agentPassports/keys.txt` into prompts or chat.

Do **not** stop because MCP thinks ENS status/policy/action is invalid. MCP should not make that decision in this architecture; KeeperHub should.

## Happy path summary

```text
build_task_intent -> sign-intent.ts locally -> submit_task -> check_task_status -> KeeperHub validates/executes -> report KeeperHub output
```
