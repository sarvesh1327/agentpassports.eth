import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("V1 MCP server registers AgentPassport resources and execute prompt", async () => {
  const serverSource = await readText("packages/mcp-server/src/server.ts");
  const resourcesSource = await readText("packages/mcp-server/src/resources.ts");
  const promptsSource = await readText("packages/mcp-server/src/prompts.ts");

  assert.match(serverSource, /registerAgentPassportResources/);
  assert.match(serverSource, /registerAgentPassportPrompts/);
  assert.match(resourcesSource, /ResourceTemplate/);
  for (const uri of [
    "agentpassport://agent/{agentName}",
    "agentpassport://owner/{ownerName}/agents",
    "agentpassport://policy/{agentName}",
    "agentpassport://tasks/{agentName}"
  ]) {
    assert.match(resourcesSource, new RegExp(uri.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^}]+\\\}/g, "\\{[^}]+\\}")));
  }
  assert.match(promptsSource, /agentpassport_execute_task/);
  assert.match(promptsSource, /resolve_agent_passport/);
  assert.match(promptsSource, /check_task_against_policy/);
  assert.match(promptsSource, /build_task_intent/);
  assert.match(promptsSource, /sign-intent\.ts/);
  assert.match(promptsSource, /submit_task/);
  assert.match(promptsSource, /Never sign/i);
});

test("V1 docs describe local skill signing instead of MCP-side private keys", async () => {
  const spec = await readText("docs/agentpassports-next-versions/V1_ENS_POLICY_ONLY_MULTI_AGENT_MCP.md");

  assert.match(spec, /MCP server \| Agent-facing interface for resolving policy, building unsigned intents, and submitting signed execution/i);
  assert.match(spec, /skill-provided signing script/i);
  assert.match(spec, /\.agentPassports\/keys\.txt/);
  assert.match(spec, /MCP server never reads or stores the agent private key/i);
  assert.doesNotMatch(spec, /sign_task_intent/);
  assert.match(spec, /agentpassport_execute_task/);
  assert.match(spec, /V1 acceptance checklist/i);
});

test("web app exposes MCP instructions and repurposes /run away from browser agent signing", async () => {
  const mcpPage = await readText("apps/web/app/mcp/page.tsx");
  const runPage = await readText("apps/web/app/run/page.tsx");

  assert.match(mcpPage, /AgentPassports MCP/);
  assert.match(mcpPage, /http:\/\/localhost:3333\/mcp/);
  assert.match(mcpPage, /agentpassport_execute_task/);
  assert.match(mcpPage, /resolve_agent_passport/);
  assert.match(mcpPage, /sign-intent\.ts/);
  assert.match(mcpPage, /Policy source: ENS/);

  assert.match(runPage, /MCP demo/i);
  assert.match(runPage, /\/mcp/);
  assert.doesNotMatch(runPage, /RunTaskDemo/);
  assert.doesNotMatch(runPage, /buildDemoAgentProfile/);
});

test("UI surfaces the exact V1 Policy source: ENS label", async () => {
  const proofPanel = await readText("apps/web/components/EnsProofPanel.tsx");

  assert.match(proofPanel, /Policy source: ENS/);
});
