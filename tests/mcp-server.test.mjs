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
    "submit_task"
  ]);

  for (const tool of AGENTPASSPORT_MCP_TOOLS) {
    assert.ok(tool.description.length >= 120, `${tool.name} should explain when and why to use it`);
    assert.match(tool.description, /ENS/i, `${tool.name} should mention ENS`);
  }

  assert.match(AGENTPASSPORT_MCP_TOOLS.find((tool) => tool.name === "build_task_intent").description, /does not sign/i);
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

test("MCP package exposes stdio and localhost HTTP entrypoints", async () => {
  const rootPackage = JSON.parse(await readText("package.json"));
  const packageJson = JSON.parse(await readText("packages/mcp-server/package.json"));
  const httpSource = await readText("packages/mcp-server/src/http.ts");

  assert.equal(rootPackage.scripts["mcp:start"], "pnpm --filter @agentpassport/mcp-server start");
  assert.equal(rootPackage.scripts["mcp:http"], "pnpm --filter @agentpassport/mcp-server http");
  assert.equal(packageJson.scripts.start, "tsx src/index.ts");
  assert.equal(packageJson.scripts.http, "tsx src/http.ts");
  assert.match(httpSource, /StreamableHTTPServerTransport/);
  assert.match(httpSource, /127\.0\.0\.1/);
  assert.match(httpSource, /3333/);
  assert.match(httpSource, /\/mcp/);
});

test("MCP package does not own agent private-key signing scripts", async () => {
  const packageJson = JSON.parse(await readText("packages/mcp-server/package.json"));
  const readme = await readText("packages/mcp-server/README.md");

  assert.equal(packageJson.scripts["sign:intent"], undefined);
  assert.doesNotMatch(readme, /AGENTPASSPORT_SIGNER_PRIVATE_KEY/);
  assert.doesNotMatch(readme, /sign:intent/);
  assert.match(readme, /skill-provided signing script/i);
});

test("MCP entrypoint uses stdio transport and shared registration registers all tool definitions", async () => {
  const entrypoint = await readText("packages/mcp-server/src/index.ts");
  const serverFactory = await readText("packages/mcp-server/src/server.ts");

  assert.match(entrypoint, /StdioServerTransport/);
  assert.match(entrypoint, /createAgentPassportsMcpServer/);
  assert.match(serverFactory, /McpServer/);
  assert.match(serverFactory, /AGENTPASSPORT_MCP_TOOLS/);
  assert.match(serverFactory, /server\.tool/);
});

test("MCP package documents setup, environment, and tool safety flow", async () => {
  const readme = await readText("packages/mcp-server/README.md");

  assert.match(readme, /AgentPassports MCP Server/);
  assert.match(readme, /mcp:start/);
  assert.doesNotMatch(readme, /AGENT_PRIVATE_KEY/);
  assert.match(readme, /resolve_agent_passport/);
  assert.match(readme, /skill-provided signing script/i);
  assert.match(readme, /Never sign/i);
  assert.match(readme, /agent\.status.*exactly.*active/i);
});

