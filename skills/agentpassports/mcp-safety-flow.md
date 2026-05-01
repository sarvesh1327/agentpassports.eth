# AgentPassports MCP Thin Intent Flow

Use this skill after key setup when the user asks the agent to build and submit an AgentPassports task through MCP.

The current architecture is **KeeperHub-authoritative**:

- MCP does **not** resolve ENS names.
- MCP does **not** read or validate policy.
- MCP does **not** check active status, signer match, policy freshness, target, selector, value, spend limits, or action authorization.
- MCP does **not** create keypairs and does **not** sign.
- KeeperHub performs Passport/Visa validation and execution, then returns success/error to the agent.

## Connect to the MCP server

For local development in this repo, use the hosted MCP server / system MCP server endpoint:

```text
http://localhost:3333/mcp
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
   - The tool builds `TaskLog.recordTask` calldata, unsigned intent JSON, and EIP-712 typed data.
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
