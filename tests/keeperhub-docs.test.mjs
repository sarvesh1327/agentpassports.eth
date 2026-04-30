import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("MCP README documents the KeeperHub Gate action-pack workflow", async () => {
  const readme = await readText("packages/mcp-server/README.md");

  assert.match(readme, /KeeperHub Gate/i);
  assert.match(readme, /AgentPassports is the ENS trust firewall/i);
  assert.match(readme, /keeperhub_validate_agent_task/);
  assert.match(readme, /keeperhub_build_workflow_payload/);
  assert.match(readme, /keeperhub_emit_run_attestation/);
  assert.match(readme, /approved/i);
  assert.match(readme, /blocked/i);
  assert.match(readme, /run attestation/i);
  assert.match(readme, /external signing/i);
  assert.match(readme, /does not read or store agent private keys/i);
  assert.match(readme, /agentpassport_keeperhub_gate/);
  assert.match(readme, /agentpassport:\/\/keeperhub\/\{agentName\}/);
  assert.match(readme, /packages\/mcp-server\/keeperhub\/action-pack\.md/);
  assert.match(readme, /packages\/mcp-server\/keeperhub\/workflow-template\.json/);
  assert.match(readme, /packages\/mcp-server\/keeperhub\/run-attestation-schema\.json/);
  assert.match(readme, /keeperhub_create_gate_workflow/);
  assert.match(readme, /keeperhub_execute_approved_workflow/);
  assert.match(readme, /keeperhub_get_execution_status/);
  assert.match(readme, /keeperhub_get_execution_logs/);
  assert.match(readme, /KEEPERHUB_API_KEY/);
  assert.match(readme, /KEEPERHUB_WORKFLOW_ID/);
  assert.match(readme, /arbitrary body persistence was not proven/i);
  assert.doesNotMatch(readme, /kh_[A-Za-z0-9]/);
  assert.doesNotMatch(readme, /keeperhub_submit_execution/);
});

test("root env example documents KeeperHub live variables without secrets", async () => {
  const envExample = await readText(".env.example");

  assert.match(envExample, /KEEPERHUB_API_KEY=/);
  assert.match(envExample, /KEEPERHUB_API_BASE_URL=https:\/\/app\.keeperhub\.com/);
  assert.match(envExample, /KEEPERHUB_WORKFLOW_ID=/);
  assert.doesNotMatch(envExample, /kh_[A-Za-z0-9]/);
});

test("MCP README keeps Uniswap out of the main KeeperHub demo path", async () => {
  const readme = await readText("packages/mcp-server/README.md");

  assert.match(readme, /Uniswap/i);
  assert.match(readme, /experimental policy-gated action module/i);
  assert.match(readme, /full gasless sponsored swaps are frozen/i);
  assert.match(readme, /ERC20 approval/i);
  assert.match(readme, /Permit2/i);
  assert.match(readme, /agent holds no gas token/i);
});

test("Uniswap feedback records the live approval blocker and frozen scope", async () => {
  const feedback = await readText("FEEDBACK.md");

  assert.match(feedback, /live \/quote/i);
  assert.match(feedback, /TRANSFER_FROM_FAILED/);
  assert.match(feedback, /WETH/i);
  assert.match(feedback, /approve Permit2/i);
  assert.match(feedback, /agent wallet holds no gas token/i);
  assert.match(feedback, /full gasless sponsored swap execution is frozen/i);
  assert.doesNotMatch(feedback, /Pending real API testing/i);
});
