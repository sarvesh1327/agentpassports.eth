import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const removedMcpNames = [
  "resolve_agent_passport",
  "get_agent_policy",
  "check_task_against_policy",
  "keeperhub_validate_agent_task",
  "keeperhub_build_workflow_payload"
];

test("V1 MCP server registers thin KeeperHub resources and prompt", async () => {
  const serverSource = await readText("packages/mcp-server/src/server.ts");
  const resourcesSource = await readText("packages/mcp-server/src/resources.ts");
  const promptsSource = await readText("packages/mcp-server/src/prompts.ts");

  assert.match(serverSource, /registerAgentPassportResources/);
  assert.match(serverSource, /registerAgentPassportPrompts/);
  assert.match(resourcesSource, /ResourceTemplate/);
  assert.match(resourcesSource, /agentpassport:\/\/tasks\/\{agentName\}/);
  assert.match(resourcesSource, /agentpassport:\/\/keeperhub\/\{agentName\}/);
  assert.match(promptsSource, /agentpassport_keeperhub_gate/);
  assert.match(promptsSource, /build_task_intent/);
  assert.match(promptsSource, /sign-intent\.ts/);
  assert.match(promptsSource, /submit_task/);
  assert.match(promptsSource, /check_task_status/);
  assert.match(promptsSource, /MCP must not resolve ENS/i);
  assert.match(promptsSource, /KeeperHub as the Passport\/Visa validator/i);

  for (const removed of removedMcpNames) {
    assert.doesNotMatch(resourcesSource, new RegExp(`\\b${removed}\\b`));
    assert.doesNotMatch(promptsSource, new RegExp(`\\b${removed}\\b`));
  }
});

test("V1 docs describe local skill signing and thin KeeperHub MCP flow", async () => {
  const spec = await readText("docs/agentpassports-next-versions/V1_ENS_POLICY_ONLY_MULTI_AGENT_MCP.md");

  assert.match(spec, /MCP server \| Thin agent-facing interface/i);
  assert.match(spec, /skill-provided signing script/i);
  assert.match(spec, /\.agentPassports\/keys\.txt/);
  assert.match(spec, /MCP server never reads or stores the agent private key/i);
  assert.match(spec, /build_task_intent/);
  assert.match(spec, /submit_task/);
  assert.match(spec, /check_task_status/);
  assert.match(spec, /agentpassport_keeperhub_gate/);
  assert.match(spec, /V1 acceptance checklist/i);
  for (const removed of removedMcpNames) {
    assert.doesNotMatch(spec, new RegExp(`\\b${removed}\\b`));
  }
});

test("web app exposes thin MCP instructions and repurposes /run away from browser agent signing", async () => {
  const mcpPage = await readText("apps/web/app/mcp/page.tsx");
  const runPage = await readText("apps/web/app/run/page.tsx");

  assert.match(mcpPage, /AgentPassports MCP/);
  assert.match(mcpPage, /http:\/\/localhost:3333\/mcp/);
  assert.match(mcpPage, /agentpassport_keeperhub_gate/);
  assert.match(mcpPage, /build_task_intent/);
  assert.match(mcpPage, /submit_task/);
  assert.match(mcpPage, /check_task_status/);
  assert.match(mcpPage, /sign-intent\.ts/);
  assert.match(mcpPage, /KeeperHub.*Passport\/Visa/i);
  assert.match(mcpPage, /Policy authority: KeeperHub/);
  for (const removed of removedMcpNames) {
    assert.doesNotMatch(mcpPage, new RegExp(`\\b${removed}\\b`));
  }

  assert.match(runPage, /MCP demo/i);
  assert.match(runPage, /\/mcp/);
  assert.doesNotMatch(runPage, /RunTaskDemo/);
  assert.doesNotMatch(runPage, /buildDemoAgentProfile/);
});

test("UI surfaces the exact V1 Policy source: ENS label", async () => {
  const proofPanel = await readText("apps/web/components/EnsProofPanel.tsx");

  assert.match(proofPanel, /Policy source: ENS/);
});
