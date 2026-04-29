import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("MCP workspace package is registered with a start script", async () => {
  const workspace = await readText("pnpm-workspace.yaml");
  const rootPackage = JSON.parse(await readText("package.json"));
  const packageJson = JSON.parse(await readText("packages/mcp-server/package.json"));

  assert.match(workspace, /packages\/mcp-server/);
  assert.equal(rootPackage.scripts["mcp:start"], "pnpm --filter @agentpassport/mcp-server start");
  assert.equal(packageJson.name, "@agentpassport/mcp-server");
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.scripts.start, "tsx src/index.ts");
  assert.ok(packageJson.dependencies["@modelcontextprotocol/sdk"], "MCP SDK dependency should be explicit");
});

test("MCP server exposes the required AgentPassports tools with descriptive safety text", async () => {
  const { AGENTPASSPORT_MCP_TOOLS } = await import("../packages/mcp-server/src/tools.ts");
  const toolNames = AGENTPASSPORT_MCP_TOOLS.map((tool) => tool.name);

  assert.deepEqual(toolNames, [
    "resolve_agent_passport",
    "list_owner_agents",
    "get_agent_policy",
    "check_task_against_policy",
    "build_task_intent",
    "sign_task_intent",
    "submit_task"
  ]);

  for (const tool of AGENTPASSPORT_MCP_TOOLS) {
    assert.ok(tool.description.length >= 120, `${tool.name} should explain when and why to use it`);
    assert.match(tool.description, /ENS/i, `${tool.name} should mention ENS`);
  }

  assert.match(AGENTPASSPORT_MCP_TOOLS.find((tool) => tool.name === "sign_task_intent").description, /never sign/i);
  assert.match(AGENTPASSPORT_MCP_TOOLS.find((tool) => tool.name === "check_task_against_policy").description, /policy digest/i);
  assert.match(AGENTPASSPORT_MCP_TOOLS.find((tool) => tool.name === "submit_task").description, /relayer/i);
});

test("MCP tools use zod schemas with the required public arguments", async () => {
  const { AGENTPASSPORT_MCP_TOOLS } = await import("../packages/mcp-server/src/tools.ts");
  const byName = Object.fromEntries(AGENTPASSPORT_MCP_TOOLS.map((tool) => [tool.name, tool]));

  assert.deepEqual(Object.keys(byName.resolve_agent_passport.inputShape), ["agentName"]);
  assert.deepEqual(Object.keys(byName.list_owner_agents.inputShape), ["ownerName"]);
  assert.deepEqual(Object.keys(byName.get_agent_policy.inputShape), ["agentName"]);
  assert.deepEqual(Object.keys(byName.check_task_against_policy.inputShape), ["agentName", "task"]);
  assert.deepEqual(Object.keys(byName.build_task_intent.inputShape), ["agentName", "task", "metadataURI", "ttlSeconds"]);
  assert.deepEqual(Object.keys(byName.sign_task_intent.inputShape), ["agentName", "intent"]);
  assert.deepEqual(Object.keys(byName.submit_task.inputShape), ["agentName", "intent", "policySnapshot", "callData", "signature"]);
});

test("MCP safety helpers reject missing or non-exact ENS active status before signing", async () => {
  const { assertExactActiveStatus, assertPolicyDigestMatches } = await import("../packages/mcp-server/src/safety.ts");

  assert.doesNotThrow(() => assertExactActiveStatus("active"));
  assert.throws(() => assertExactActiveStatus("Active"), /exactly active/);
  assert.throws(() => assertExactActiveStatus("active "), /exactly active/);
  assert.throws(() => assertExactActiveStatus(""), /exactly active/);

  assert.doesNotThrow(() => assertPolicyDigestMatches("0x" + "11".repeat(32), "0x" + "11".repeat(32)));
  assert.throws(
    () => assertPolicyDigestMatches("0x" + "11".repeat(32), "0x" + "22".repeat(32)),
    /does not match live ENS policy digest/
  );
});

test("MCP entrypoint uses stdio transport and registers all tool definitions", async () => {
  const source = await readText("packages/mcp-server/src/index.ts");

  assert.match(source, /StdioServerTransport/);
  assert.match(source, /McpServer/);
  assert.match(source, /AGENTPASSPORT_MCP_TOOLS/);
  assert.match(source, /server\.tool/);
});

test("MCP package documents setup, environment, and tool safety flow", async () => {
  const readme = await readText("packages/mcp-server/README.md");

  assert.match(readme, /AgentPassports MCP Server/);
  assert.match(readme, /mcp:start/);
  assert.match(readme, /AGENT_PRIVATE_KEY/);
  assert.match(readme, /resolve_agent_passport/);
  assert.match(readme, /sign_task_intent/);
  assert.match(readme, /Never sign/i);
  assert.match(readme, /agent\.status.*exactly.*active/i);
});

