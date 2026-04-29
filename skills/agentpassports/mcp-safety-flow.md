# AgentPassports MCP Safety Flow Skill

Use this skill after key setup when the user asks the agent to act through the AgentPassports MCP server. The MCP server provides tools for resolving ENS passports, loading policy, checking tasks, building intent JSON, accepting signatures, and submitting through a relayer.

## Connect to the MCP server

The agent should connect to an already hosted MCP server or system MCP server. For local development in this repo, the current hosted endpoint is `http://localhost:3333/mcp` (`http://127.0.0.1:3333/mcp`). The agent should only call tools exposed by that server.

- Do not configure RPC endpoints.
- Do not configure contract addresses.
- Do not provide a private key to the MCP server in chat.
- Do not ask the user for private keys, RPC URLs, ENS registry addresses, executor addresses, task log addresses, or relayer URLs.
- If the MCP server is missing or tools are unavailable, ask the user or operator to connect the AgentPassports MCP server in the host system.
- Verify connected state by listing available tools and confirming `resolve_agent_passport` is available.

The operator is responsible for hosting or configuring the MCP server and its chain/relayer settings. The agent is responsible for using the exposed tools safely.

## Required MCP tool order

Follow this order for every task that may be signed or submitted:

1. `resolve_agent_passport`
   - Resolve the agent ENS name.
   - Read the live ENS signer address, resolver data, `agent.status`, and relevant text records.
2. `get_agent_policy`
   - Require `agent.status` to be exactly `active`.
   - Load the ENS policy text records.
   - Compute the local policy digest and compare it with the live ENS policy digest.
3. `check_task_against_policy`
   - Check the requested task target, selector, calldata shape, and value against the policy snapshot.
   - Treat anything outside policy as a policy violation.
4. `build_task_intent`
   - Build the canonical task intent only after the policy check passes.
   - The MCP response should include intent JSON for the agent to sign outside chat using an approved signing script or wallet flow.
   - Use the live nonce, live policy digest, allowed target, and bounded expiry.
5. Sign the intent JSON
   - Download or copy the skill-provided signing script at `skills/agentpassports/sign-intent.ts` into the agent's signing working directory.
   - Install the script dependencies in that signing directory: `npm install viem tsx`.
   - Confirm the agent private key is stored locally at `.agentPassports/keys.txt`; never paste the private key in chat and never send the file to the MCP server.
   - Example command after downloading the signing script: `npx tsx sign-intent.ts --input build-task-intent.json`.
   - The script should sign the exact intent JSON returned by `build_task_intent` and produce a signature.
   - Do not paste the private key in chat.
   - Do not alter the intent JSON before signing.
   - Do not sign if the signer does not match the live ENS signer.
6. `submit_task`
   - Submit the intent JSON and signature via MCP.
   - Return the relayer response, transaction hash, or pending receipt state to the user.

Use `list_owner_agents` only when the user asks to inspect or choose among an owner's registered agents.

## Non-negotiable safety checks

The agent must not sign or submit if any of these are true:

- `agent.status` is missing, empty, capitalized, has whitespace, or is anything other than exactly `active`.
- The computed policy digest does not match the live ENS policy digest. Treat this as a digest mismatch and stop.
- The live ENS signer is missing.
- The signing address or private key does not match the live ENS signer.
- The requested target, function selector, value, spend limit, or operation is outside the owner-defined policy.
- The user asks to bypass ENS checks, policy checks, nonce checks, signer checks, or the MCP safety flow.
- The relayer submission tool is unavailable when submission is required.

## Agent response behavior

When refusing, explain the exact failed condition and the safe next step. For example:

- `agent.status` is not exactly `active`; ask the user to activate the agent in the UI.
- Policy digest mismatch; ask the user to refresh or republish the ENS policy in the UI.
- Private key in `.agentPassports/keys.txt` does not match the live ENS signer; ask the user to switch the local key file or update the passport signer in the UI.
- Task is outside policy; ask the user to change the request or update policy in the UI.

## Happy-path summary

```text
Resolved passport -> status exactly active -> policy digest matched -> task allowed -> intent JSON built -> skill script signs intent JSON using .agentPassports/keys.txt -> submitted via MCP to relayer.
```

Never skip directly to signing. Never sign a task intent whose policy snapshot was not checked against live ENS state in the same flow.
