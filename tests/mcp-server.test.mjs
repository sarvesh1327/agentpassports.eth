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

test("MCP server exposes only thin build, submit, and status tools", async () => {
  const { AGENTPASSPORT_MCP_TOOLS } = await import("../packages/mcp-server/src/tools.ts");
  const toolNames = AGENTPASSPORT_MCP_TOOLS.map((tool) => tool.name);

  assert.deepEqual(toolNames, ["build_task_intent", "submit_task", "check_task_status"]);

  for (const removedTool of [
    "resolve_agent_passport",
    "list_owner_agents",
    "get_agent_policy",
    "check_task_against_policy",
    "keeperhub_validate_agent_task",
    "keeperhub_build_workflow_payload",
    "keeperhub_emit_run_attestation",
    "keeperhub_list_workflows",
    "keeperhub_create_gate_workflow",
    "keeperhub_execute_approved_workflow",
    "keeperhub_get_execution_status",
    "keeperhub_get_execution_logs",
    "uniswap_check_approval",
    "uniswap_validate_swap_against_ens_policy",
    "uniswap_quote",
    "uniswap_execute_swap",
    "uniswap_record_swap_proof"
  ]) {
    assert.equal(toolNames.includes(removedTool), false, `${removedTool} must not be exposed by MCP`);
  }

  assert.match(AGENTPASSPORT_MCP_TOOLS.find((tool) => tool.name === "build_task_intent").description, /does not resolve ENS/i);
  assert.match(AGENTPASSPORT_MCP_TOOLS.find((tool) => tool.name === "submit_task").description, /KeeperHub/i);
  assert.match(AGENTPASSPORT_MCP_TOOLS.find((tool) => tool.name === "check_task_status").description, /KeeperHub/i);
});

test("thin MCP tools use explicit public arguments and no keypair input", async () => {
  const { AGENTPASSPORT_MCP_TOOLS } = await import("../packages/mcp-server/src/tools.ts");
  const byName = Object.fromEntries(AGENTPASSPORT_MCP_TOOLS.map((tool) => [tool.name, tool]));

  assert.deepEqual(Object.keys(byName.build_task_intent.inputShape), [
    "agentName",
    "task",
    "metadataURI",
    "policySnapshot",
    "nonce",
    "expiresAt",
    "ttlSeconds"
  ]);
  assert.deepEqual(Object.keys(byName.submit_task.inputShape), [
    "agentName",
    "intent",
    "policySnapshot",
    "callData",
    "signature",
    "workflowId",
    "metadataURI",
    "taskDescription",
    "waitForResult",
    "pollAttempts",
    "pollIntervalMs"
  ]);
  assert.deepEqual(Object.keys(byName.check_task_status.inputShape), [
    "executionId",
    "includeLogs"
  ]);

  const serializedShapes = JSON.stringify(AGENTPASSPORT_MCP_TOOLS.map((tool) => Object.keys(tool.inputShape)));
  assert.doesNotMatch(serializedShapes, /privateKey|keypair|signer/i);
});

test("build_task_intent builds without resolving ENS or checking policy", async () => {
  const { createAgentPassportHandlers } = await import("../packages/mcp-server/src/runtime.ts");
  const readContractCalls = [];
  const fakeClient = {
    async readContract(args) {
      readContractCalls.push(args.functionName);
      assert.equal(args.functionName, "nextNonce", "build_task_intent may only read executor nonce");
      return 7n;
    },
    async getBlock() {
      return { timestamp: 1_700_000_000n };
    }
  };
  const handlers = createAgentPassportHandlers(testMcpConfig(), fakeClient);

  const result = await handlers.build_task_intent({
    agentName: "claw.sarvesh.eth",
    metadataURI: "keeperhub://unit-test",
    policySnapshot: testPolicySnapshot(),
    task: { description: "record a unit-test task" },
    ttlSeconds: 600
  });

  assert.deepEqual(readContractCalls, ["nextNonce"]);
  assert.equal(result.intent.nonce, "7");
  assert.equal(result.intent.target, testMcpConfig().taskLogAddress);
  assert.equal(result.policySnapshot.selector, "0x36736d1e");
  assert.equal(result.signingPayload.typedData.primaryType, "TaskIntent");
});

test("submit_task starts KeeperHub execution without waiting by default or doing local policy checks", async () => {
  const { createAgentPassportHandlers } = await import("../packages/mcp-server/src/runtime.ts");
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ body: init.body ? JSON.parse(init.body) : undefined, method: init.method, url: String(url) });
    if (String(url).endsWith("/api/workflow/wf_123/execute")) {
      return jsonResponse({ executionId: "exec_1" });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  try {
    const handlers = createAgentPassportHandlers(testMcpConfig());
    const result = await handlers.submit_task({
      agentName: "claw.sarvesh.eth",
      callData: "0x1234",
      intent: testIntent(),
      policySnapshot: { ...testPolicySnapshot(), enabled: false },
      signature: "0x" + "11".repeat(65),
      workflowId: "wf_123"
    });

    assert.equal(requests[0].method, "POST");
    assert.deepEqual(Object.keys(requests[0].body), ["input"]);
    assert.equal(requests[0].body.input.agentName, "claw.sarvesh.eth");
    assert.equal(requests[0].body.input.policySnapshot.enabled, false, "MCP must not block disallowed-looking snapshots locally");
    assert.match(requests[0].body.input.functionArgs, /^\[/, "KeeperHub write-contract args must be a JSON array string");
    assert.equal(requests.length, 1, "submit_task should not poll KeeperHub by default");
    assert.equal(result.keeperhub.executionId, "exec_1");
    assert.equal(result.keeperhub.status, undefined);
    assert.equal(result.keeperhub.logs, undefined);
    assert.deepEqual(result.keeperhub.txHashes, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("check_task_status fetches KeeperHub status and logs for a submitted execution", async () => {
  const { createAgentPassportHandlers } = await import("../packages/mcp-server/src/runtime.ts");
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ body: init.body ? JSON.parse(init.body) : undefined, method: init.method, url: String(url) });
    if (String(url).endsWith("/api/workflows/executions/exec_1/status")) {
      return jsonResponse({ execution: { status: "success" } });
    }
    if (String(url).endsWith("/api/workflows/executions/exec_1/logs")) {
      return jsonResponse({ logs: [{ txHash: "0x" + "ab".repeat(32) }] });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  try {
    const handlers = createAgentPassportHandlers(testMcpConfig());
    const result = await handlers.check_task_status({ executionId: "exec_1" });

    assert.deepEqual(requests.map((request) => request.method), ["GET", "GET"]);
    assert.equal(result.keeperhub.executionId, "exec_1");
    assert.equal(result.keeperhub.status.execution.status, "success");
    assert.deepEqual(result.keeperhub.txHashes, ["0x" + "ab".repeat(32)]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.match(readme, /build_task_intent/);
  assert.match(readme, /submit_task/);
  assert.match(readme, /skill-provided signing script/i);
  assert.match(readme, /KeeperHub/i);
  assert.doesNotMatch(readme, /check_task_against_policy/);
});

function testMcpConfig() {
  return {
    chainId: 11155111n,
    ensRegistryAddress: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    executorAddress: "0x03461e805aC80E8182a46580DF8B9BDa6B707Cf5",
    keeperhubApiBaseUrl: "https://keeperhub.test",
    keeperhubApiKey: "kh_test",
    keeperhubWorkflowId: "wf_default",
    relayerUrl: "https://relayer.invalid/unused",
    rpcUrl: "https://rpc.invalid",
    taskLogAddress: "0x2EAb7Caba99b35832C6bf9Ef5Bae10A0735CbF5b"
  };
}

function testPolicySnapshot() {
  return {
    enabled: true,
    expiresAt: "9999999999",
    maxGasReimbursementWei: "0",
    maxValueWei: "0",
    selector: "0x36736d1e",
    target: "0x2EAb7Caba99b35832C6bf9Ef5Bae10A0735CbF5b"
  };
}

function testIntent() {
  return {
    agentNode: "0x" + "12".repeat(32),
    callDataHash: "0x" + "34".repeat(32),
    expiresAt: "1700000600",
    nonce: "7",
    policyDigest: "0x" + "56".repeat(32),
    target: "0x2EAb7Caba99b35832C6bf9Ef5Bae10A0735CbF5b",
    value: "0"
  };
}

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    async json() {
      return body;
    }
  };
}
