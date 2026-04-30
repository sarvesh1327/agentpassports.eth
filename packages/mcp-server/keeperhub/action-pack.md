# KeeperHub Gate Action Pack

AgentPassports is the ENS trust firewall for KeeperHub execution. KeeperHub gets an executable workflow only after AgentPassports proves the ENS agent is live, policy-compliant, and allowed to run the requested task.

## Live workflow tools

1. `keeperhub_create_gate_workflow` creates the verified live KeeperHub workflow shape. KeeperHub currently requires `name`, `nodes`, and `edges`.
2. `keeperhub_execute_approved_workflow` performs the full V3 live path and internally follows the same safety order as `keeperhub_validate_agent_task` plus `keeperhub_build_workflow_payload`:
   - resolve live ENS AgentPassport,
   - validate exact active status and policy digest,
   - block without calling KeeperHub if the gate fails,
   - build unsigned AgentPassports workflow payload if approved,
   - execute the configured KeeperHub workflow,
   - fetch execution status and logs,
   - return approved/blocked run attestation JSON.
3. `keeperhub_get_execution_status` fetches live KeeperHub execution status.
4. `keeperhub_get_execution_logs` fetches live KeeperHub logs and `runId` when available.
5. `keeperhub_emit_run_attestation` can also be called explicitly to persist an approved or blocked audit record.

## Safety boundaries

- This action pack does not include secrets.
- Runtime KeeperHub calls require `KEEPERHUB_API_KEY`, but the key must stay in local env only.
- This action pack does not sign payloads and never asks for private keys. External signing remains outside MCP.
- `keeperhub_execute_approved_workflow` must not call KeeperHub when AgentPassports returns `blocked`.
- Blocked ENS status, policy digest mismatch, policy preflight failure, or low trust score must never be converted into approval.
- The simple verified manual-trigger workflow accepted an execution body, but arbitrary body persistence was not proven in logs. Treat KeeperHub execution id/status/log `runId` as live execution evidence and AgentPassports workflow payload as the local audit payload until a consuming KeeperHub node is proven.
- Uniswap remains an experimental policy-gated module; full gasless sponsored swaps are frozen until the ERC20 approval / Permit2 gasless setup is proven.

## Demo narrative

```txt
Agent reasoning
→ AgentPassports ENS passport resolution
→ KeeperHub Gate approved/blocked decision
→ if blocked: no KeeperHub API call + blocked run attestation
→ if approved: unsigned workflow payload + live KeeperHub execution
→ status/logs/runId evidence
→ run attestation JSON
```
