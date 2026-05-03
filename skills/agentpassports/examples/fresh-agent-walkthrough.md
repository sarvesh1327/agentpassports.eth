# Fresh Agent Walkthrough

This walkthrough shows the complete first-run AgentPassports flow for an agent with no prior setup in the thin MCP / KeeperHub-authoritative architecture.

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

Please register this address as the agent signer in the AgentPassports UI. After setup, I will build unsigned intents through MCP, sign locally, and submit signed payloads to KeeperHub for Passport/Visa validation and execution.
```

## 3. Connect to the MCP server

Use the hosted MCP server at:

```text
https://mcp.agentpassports.xyz/mcp
```

List tools before acting. The expected AgentPassports task tools are only:

```text
build_task_intent
submit_task
check_task_status
```

The agent should only call MCP tools. Do not configure RPC URLs, ENS registry addresses, executor addresses, task log addresses, relayer URLs, KeeperHub API keys, wallet secrets, or private keys in the agent prompt.

## 4. Build the intent JSON

Call:

```text
build_task_intent
```

Provide explicit task, metadata URI, and policy snapshot inputs. Save the full MCP response as:

```text
build-task-intent.json
```

The response must include the intent JSON, calldata, policy snapshot, and `signingPayload.typedData`. MCP may read an executor nonce if no nonce was supplied, but it does not decide whether the task is allowed.

## 5. Sign the intent locally

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

## 6. Submit through MCP

Call:

```text
submit_task
```

Provide the intent JSON, policy snapshot, calldata, and signature returned by the signing script. MCP submits the signed payload to KeeperHub as `{ input: payload }`.

By default, `submit_task` should return quickly with KeeperHub's execution id/handle. It should not wait for final status inside the submit call.

## 7. Check KeeperHub status through MCP

Call:

```text
check_task_status
```

Provide the KeeperHub execution id returned by `submit_task`. KeeperHub performs Passport/Visa validation and execution. MCP should return KeeperHub's current/final status, logs, tx hash, or error without inventing a local policy decision.

## 8. Report the result

If status check succeeds, return KeeperHub output and any onchain tx hash.

If submission or status check fails, report KeeperHub's error/status directly and the local step where the failure happened. Local stop conditions are limited to MCP unavailable, missing build/submit/status tools, missing/unsafe key file, signing failure, or missing KeeperHub runtime configuration.
