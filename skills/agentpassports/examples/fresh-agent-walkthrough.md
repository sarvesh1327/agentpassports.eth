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

## Optional: KeeperHub V3 live execution

If the user wants KeeperHub V3 live execution, remember the product model:

```text
AgentPassports = ENS trust firewall / policy gate
KeeperHub = execution runner
Run attestation = approved/blocked proof
```

Operator/server setup may use:

```text
keeperhub_list_workflows
keeperhub_create_gate_workflow
KEEPERHUB_WORKFLOW_ID
```

Do not ask the agent user to paste `KEEPERHUB_API_KEY`, `KEEPERHUB_API_BASE_URL`, wallet secrets, `.env` files, or `.agentPassports/keys.txt`. These are operator/server env vars, not agent prompt config.

For each KeeperHub task, use:

```text
resolve_agent_passport
keeperhub_validate_agent_task
keeperhub_execute_approved_workflow
keeperhub_get_execution_status
keeperhub_get_execution_logs
keeperhub_emit_run_attestation
```

`keeperhub_build_workflow_payload` is the lower-level unsigned payload builder used by the live flow.

If the gate blocks because the agent is inactive, has a missing signer, has a missing policy digest, or violates policy, do not call KeeperHub. Return a blocked attestation.

The KeeperHub MCP flow never signs private keys and does not submit the onchain AgentPassports relayer transaction by itself. If full onchain proof is required after KeeperHub approval, build unsigned intent, sign locally with `sign-intent.ts` or a wallet, call `submit_task`, and include the tx hash in the run attestation.

The simple manual trigger workflow may not preserve arbitrary execution body in logs, so do not claim KeeperHub logs contain the full AgentPassports payload unless a consuming KeeperHub node proves it.

## Optional: V2 Swapper flow

If the user registers this agent as a `Swapper`, the passport should include the `uniswap-swap` capability and ENS records such as:

```text
agent_policy_uniswap_allowed_token_in
agent_policy_uniswap_allowed_token_out
agent_policy_uniswap_max_input_amount
agent_policy_uniswap_max_slippage_bps
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
