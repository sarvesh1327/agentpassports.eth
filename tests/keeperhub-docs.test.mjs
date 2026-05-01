import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const removedMcpTools = [
  "resolve_agent_passport",
  "get_agent_policy",
  "check_task_against_policy",
  "keeperhub_validate_agent_task",
  "keeperhub_build_workflow_payload",
  "keeperhub_emit_run_attestation",
  "keeperhub_create_gate_workflow",
  "keeperhub_execute_approved_workflow",
  "keeperhub_get_execution_status",
  "keeperhub_get_execution_logs"
];

test("MCP README documents the thin KeeperHub-authoritative flow", async () => {
  const readme = await readText("packages/mcp-server/README.md");

  assert.match(readme, /AgentPassports MCP Server/);
  assert.match(readme, /thin/i);
  assert.match(readme, /KeeperHub is authoritative/i);
  assert.match(readme, /build_task_intent/);
  assert.match(readme, /submit_task/);
  assert.match(readme, /check_task_status/);
  assert.match(readme, /returns.*execution id/i);
  assert.match(readme, /final status/i);
  assert.match(readme, /external signing/i);
  assert.match(readme, /skill-provided signing script/i);
  assert.match(readme, /does not read or store agent private keys/i);
  assert.match(readme, /Passport\/Visa/i);
  assert.match(readme, /policy validation/i);
  assert.match(readme, /tx hash/i);
  assert.match(readme, /agentpassport_keeperhub_gate/);
  assert.match(readme, /agentpassport:\/\/keeperhub\/\{agentName\}/);
  assert.match(readme, /packages\/mcp-server\/keeperhub\/action-pack\.md/);
  assert.match(readme, /KEEPERHUB_API_KEY/);
  assert.match(readme, /KEEPERHUB_WORKFLOW_ID/);

  for (const removed of removedMcpTools) {
    assert.doesNotMatch(readme, new RegExp(`\\b${removed}\\b`), `${removed} should not appear in thin MCP README`);
  }
  assert.doesNotMatch(readme, /Never sign before the agent has resolved ENS live/i);
  assert.doesNotMatch(readme, /kh_[A-Za-z0-9]/);
});

test("root env example documents KeeperHub live variables without secrets", async () => {
  const envExample = await readText(".env.example");

  assert.match(envExample, /KEEPERHUB_API_KEY=/);
  assert.match(envExample, /KEEPERHUB_API_BASE_URL=https:\/\/app\.keeperhub\.com/);
  assert.match(envExample, /KEEPERHUB_WORKFLOW_ID=/);
  assert.doesNotMatch(envExample, /kh_[A-Za-z0-9]/);
});

test("KeeperHub action-pack docs describe MCP build-submit-status order", async () => {
  const actionPack = await readText("packages/mcp-server/keeperhub/action-pack.md");

  assert.match(actionPack, /build_task_intent/);
  assert.match(actionPack, /submit_task/);
  assert.match(actionPack, /check_task_status/);
  assert.match(actionPack, /KeeperHub.*Passport\/Visa/i);
  assert.match(actionPack, /execution id/i);
  assert.match(actionPack, /tx hash/i);
  for (const removed of removedMcpTools) {
    assert.doesNotMatch(actionPack, new RegExp(`\\b${removed}\\b`), `${removed} should not appear in action-pack docs`);
  }
  assert.doesNotMatch(actionPack, /kh_[A-Za-z0-9]/);
});

test("MCP docs keep Uniswap out of the main KeeperHub demo path", async () => {
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
