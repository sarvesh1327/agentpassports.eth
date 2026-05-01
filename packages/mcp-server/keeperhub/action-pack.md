# KeeperHub Gate Action Pack

AgentPassports MCP is a thin build/submit/status bridge for KeeperHub execution. KeeperHub performs Passport/Visa validation, policy validation, workflow routing, and onchain execution; MCP does not make local authorization decisions.

## Live MCP tool order

1. `build_task_intent`
   - Build `TaskLog.recordTask` calldata and unsigned intent JSON from explicit public inputs.
   - Save the exact JSON returned by the tool.
2. External signing outside MCP
   - Sign the exact intent locally with the skill-provided `skills/agentpassports/sign-intent.ts` script or a user-controlled wallet.
   - Never send a private key through MCP or KeeperHub payloads.
3. `submit_task`
   - Submit the signed payload to the configured KeeperHub workflow.
   - Return the KeeperHub execution id quickly; final completion is not required in this request.
4. `check_task_status`
   - Fetch status/logs for the KeeperHub execution id.
   - Use this evidence to report final state, KeeperHub errors, node statuses, and tx hash values.

## Safety boundaries

- This action pack does not include secrets.
- Runtime KeeperHub calls require `KEEPERHUB_API_KEY`, but the key must stay in local env only.
- This action pack does not sign payloads and never asks for private keys. External signing remains outside MCP.
- MCP must not resolve ENS, read Visa policy, check active status, validate spend limits, verify Passport/Visa identity, or preflight KeeperHub decisions.
- KeeperHub output is authoritative for approved, blocked, error, running, and success states.
- If `submit_task` returns `running`, continue with `check_task_status` until a terminal KeeperHub state or an explicit caller timeout.
- Uniswap remains an experimental policy-gated module; full gasless sponsored swaps are frozen until the ERC20 approval / Permit2 gasless setup is proven.

## Demo narrative

```txt
Agent reasoning
→ build_task_intent creates unsigned intent JSON
→ local external signing
→ submit_task starts KeeperHub workflow and returns execution id
→ KeeperHub Passport/Visa checks and policy validation
→ KeeperHub execution node runs or KeeperHub returns blocked/error evidence
→ check_task_status returns final status/logs/tx hash evidence
→ agent reports KeeperHub output
```
