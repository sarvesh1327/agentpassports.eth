# Fresh Agent Walkthrough

This walkthrough shows the complete first-run AgentPassports flow for an agent with no prior setup.

## 1. Prepare a local Ethereum key

AgentPassports requires an Ethereum ECDSA secp256k1 private key/public key pair. The private key stays local in `.agentPassports/keys.txt`; only the public address is shown to the user.

If `.agentPassports/keys.txt` already exists, derive the public address from it and continue. If it does not exist, copy or download the key helper from this skill:

```text
skills/agentpassports/create-key.ts
```

Install the helper dependencies in the agent signing directory:

```bash
npm install viem tsx
```

Generate the key:

```bash
npx tsx create-key.ts
```

The helper creates:

```text
.agentPassports/keys.txt
```

It protects the file with `chmod 600` and prints the public address. Do not paste the private key in chat. Do not commit `.agentPassports/keys.txt`.

## 2. Ask the user to complete UI setup

Show the user only the public address from the key helper and ask them to register it in the AgentPassports UI.

Example response:

```text
Your AgentPassports agent public address is: 0x...

Please register this address as the agent signer in the AgentPassports UI. After the UI publishes the ENS passport and policy, I will verify the passport through MCP before signing any task.
```

## 3. Connect to the MCP server

For local development, the MCP server should be hosted at:

```text
http://localhost:3333/mcp
```

The agent should only call MCP tools. Do not configure RPC URLs, ENS registry addresses, executor addresses, task log addresses, or relayer URLs in the agent prompt.

Verify that the MCP server exposes `resolve_agent_passport` before continuing.

## 4. Resolve and verify the passport

For every task, call the tools in this order:

1. `resolve_agent_passport`
   - Confirms the agent ENS name resolves and exposes the live ENS signer.
2. `get_agent_policy`
   - Requires `agent.status` exactly `active`.
   - Computes the policy digest and verifies it matches the live ENS policy digest.
3. `check_task_against_policy`
   - Confirms the requested task is allowed by the owner policy.

Stop if `agent.status` is not exactly `active`, if the policy digest does not match, or if the task is outside policy.

## 5. Build the intent JSON

After the policy check passes, call:

```text
build_task_intent
```

Save the full MCP response as:

```text
build-task-intent.json
```

The response must include the intent JSON and `signingPayload.typedData`.

## 6. Sign the intent locally

Copy or download the signing script from this skill:

```text
skills/agentpassports/sign-intent.ts
```

Install dependencies if not already installed:

```bash
npm install viem tsx
```

Sign the exact intent JSON:

```bash
npx tsx sign-intent.ts --input build-task-intent.json
```

The script reads the private key from `.agentPassports/keys.txt` and outputs the signer, digest, signature, typed data, and original intent. Do not modify the intent JSON before signing.

## 7. Submit through MCP

Call:

```text
submit_task
```

Provide the intent JSON, policy snapshot, calldata, and signature returned by the signing script. The relayer should re-check ENS policy and signer state before broadcasting.

## 8. Report the result

If submission succeeds, report the relayer result or transaction hash to the user.

If any step fails, explain the exact failed condition and safe next step, such as:

- `agent.status` is not exactly `active`; ask the user to activate the agent in the UI.
- Policy digest mismatch; ask the user to republish or refresh the ENS policy.
- Local signer does not match ENS signer; ask the user to register the correct public address in the UI or switch `.agentPassports/keys.txt`.
- Task is outside policy; ask the user to update the request or policy.

## Optional: V2 Swapper flow

If the user registers this agent as a `Swapper`, the passport should include the `uniswap-swap` capability and ENS records such as:

```text
agent.policy.uniswap.allowedTokenIn
agent.policy.uniswap.allowedTokenOut
agent.policy.uniswap.maxInputAmount
agent.policy.uniswap.maxSlippageBps
```

For a swap request, do not use the generic `check_task_against_policy` flow alone. Use the Swapper-specific MCP order:

```text
resolve_agent_passport
get_agent_policy
uniswap_validate_swap_against_ens_policy
uniswap_check_approval
uniswap_quote
uniswap_execute_swap
uniswap_record_swap_proof
```

Stop if the requested chain, token pair, amount, or slippage is outside the ENS Uniswap policy, or if the policy digest changes before execution.
