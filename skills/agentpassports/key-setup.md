# AgentPassports Key Setup Skill

Use this skill when an agent needs to prepare or verify the signing key it will use for AgentPassports. AgentPassports requires an Ethereum private key/public key pair, meaning an ECDSA secp256k1 key pair whose public key derives to an EVM address. The agent owns its private key locally, stores it in `.agentPassports/keys.txt`, and only shares the derived public address with the user for UI setup.

## Brief protocol context

AgentPassports.eth lets an ENS owner authorize an agent by publishing the agent public address and owner-defined policy in ENS text records. In the current KeeperHub flow, the AgentPassports MCP server only builds unsigned task intents and submits signed payloads to KeeperHub. KeeperHub performs Passport/Visa validation and returns success or error.

## Required key setup flow

1. Check whether `.agentPassports/keys.txt` exists in the agent's local working directory.
2. If it exists, read it locally, derive the public address, and show only the public address to the user.
3. If it does not exist, ask the user whether to provide an existing private key or create a new key pair.
4. If creating a new key pair, use the skill-provided `create-key.ts` helper. Key creation is not an MCP tool; the MCP server does not create or receive private keys.
5. If creating a new key pair, create `.agentPassports/`, write the private key to `.agentPassports/keys.txt`, and set owner-only permissions such as `chmod 600 .agentPassports/keys.txt`.
6. Ensure `.agentPassports/` is ignored by git. The key file must not commit, upload, or appear in logs.
7. Give the user the public address and ask the user to complete setup in the AgentPassports UI by registering that address as the agent signer.
8. After the UI setup is complete, continue with the MCP thin intent flow to build, locally sign, submit tasks to KeeperHub, and check final KeeperHub status.

## Agent rules

- Keep the private key local in `.agentPassports/keys.txt` or a stricter user-approved local secure store.
- Do not paste the private key in chat.
- Do not send the private key to the MCP server.
- Do not ask for RPC URLs, ENS registry addresses, executor addresses, task log addresses, or relayer URLs. Those are MCP server/operator configuration.
- Only show the public address to the user for UI setup.

## User-facing response template

```text
I will keep the AgentPassports private key locally at .agentPassports/keys.txt and will not send it to the MCP server or paste it in chat.

The agent public address to register in the AgentPassports UI is: 0x...

After the UI publishes the passport/policy data, I will build unsigned intents through MCP, sign locally, and submit the signed payload to KeeperHub for validation/execution.
```

## Stop conditions

Do not continue if:

- The key file would be committed, uploaded, or logged.
- `.agentPassports/keys.txt` cannot be protected with owner-only permissions or an equivalent local secret-store control.
- The user refuses to complete setup in the UI but still asks the agent to act as an AgentPassport.
