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
    "submit_task",
    "uniswap_check_approval",
    "uniswap_validate_swap_against_ens_policy",
    "uniswap_quote",
    "uniswap_execute_swap",
    "uniswap_record_swap_proof"
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
  assert.deepEqual(Object.keys(byName.uniswap_check_approval.inputShape), ["agentName", "amount", "chainId", "token"]);
  assert.deepEqual(Object.keys(byName.uniswap_validate_swap_against_ens_policy.inputShape), ["agentName", "amount", "chainId", "slippageBps", "tokenIn", "tokenOut", "type"]);
  assert.deepEqual(Object.keys(byName.uniswap_quote.inputShape), ["agentName", "amount", "chainId", "slippageBps", "tokenIn", "tokenOut", "type"]);
  assert.deepEqual(Object.keys(byName.uniswap_execute_swap.inputShape), ["agentName", "amount", "chainId", "slippageBps", "tokenIn", "tokenOut", "type", "permit2Signature", "quote", "quoteId"]);
  assert.deepEqual(Object.keys(byName.uniswap_record_swap_proof.inputShape), ["agentName", "amount", "chainId", "policyDigest", "quoteId", "requestId", "routing", "tokenIn", "tokenOut", "txHashOrOrderId"]);
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
  assert.match(httpSource, /readJsonBody/);
  assert.match(httpSource, /handleRequest\(req, res, parsedBody\)/);
  assert.match(httpSource, /fresh transport per[\s\S]*request/i);
});

test("MCP JSON tool formatter serializes BigInt values instead of throwing", async () => {
  const { jsonToolResult } = await import("../packages/mcp-server/src/server.ts");

  const result = jsonToolResult({
    nested: {
      expiresAt: 123n,
      nonce: 7n
    }
  });

  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /"expiresAt": "123"/);
  assert.match(result.content[0].text, /"nonce": "7"/);
});

test("Uniswap MCP helpers build documented quote and approval payloads", async () => {
  const { buildUniswapApprovalPayload, buildUniswapQuotePayload, normalizeUniswapQuoteResponse } = await import("../packages/mcp-server/src/uniswap.ts");
  const agent = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  assert.deepEqual(
    buildUniswapApprovalPayload(agent, {
      amount: "1000000",
      chainId: "1",
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    }),
    {
      amount: "1000000",
      chainId: 1,
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      walletAddress: agent
    }
  );

  assert.deepEqual(
    buildUniswapQuotePayload(agent, {
      amount: "1000000",
      chainId: "1",
      slippageBps: "50",
      tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      tokenOut: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    }),
    {
      amount: "1000000",
      autoSlippage: undefined,
      generatePermitAsTransaction: false,
      permitAmount: "FULL",
      protocols: ["UNISWAPX_V2", "V4", "V3", "V2"],
      routingPreference: "BEST_PRICE",
      slippageTolerance: 0.5,
      spreadOptimization: "EXECUTION",
      swapper: agent,
      tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      tokenInChainId: 1,
      tokenOut: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      tokenOutChainId: 1,
      type: "EXACT_INPUT",
      urgency: "normal"
    }
  );

  assert.deepEqual(
    normalizeUniswapQuoteResponse({ requestId: "req", routing: "CLASSIC", quote: { quoteId: "qid", gasFee: "1", routeString: "USDC/WETH" } }),
    { gasFee: "1", quoteId: "qid", requestId: "req", routeString: "USDC/WETH", routing: "CLASSIC" }
  );
});

test("Uniswap swap proof metadata is canonical and records policy context", async () => {
  const { buildSwapProofMetadata } = await import("../packages/mcp-server/src/uniswap.ts");

  assert.deepEqual(buildSwapProofMetadata({
    agentName: "swapper.alice.eth",
    agentNode: "0x" + "11".repeat(32),
    amount: "1000000",
    chainId: "1",
    policyDigest: "0x" + "22".repeat(32),
    quoteId: "qid",
    requestId: "req",
    routing: "CLASSIC",
    tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    tokenOut: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    txHashOrOrderId: "0x" + "33".repeat(32)
  }), {
    agentName: "swapper.alice.eth",
    agentNode: "0x" + "11".repeat(32),
    amount: "1000000",
    chainId: "1",
    policyDigest: "0x" + "22".repeat(32),
    quoteId: "qid",
    requestId: "req",
    routing: "CLASSIC",
    schema: "agentpassport.uniswapSwapProof.v2",
    tokenIn: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    tokenOut: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    txHashOrOrderId: "0x" + "33".repeat(32)
  });
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
