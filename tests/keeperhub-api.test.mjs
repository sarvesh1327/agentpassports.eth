import assert from "node:assert/strict";
import test from "node:test";

const API_KEY = "kh_test_secret_should_not_leak";
const BASE_URL = "https://app.keeperhub.com";

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" }
  });
}

test("KeeperHub API config reads env safely with defaults", async () => {
  const { loadKeeperHubApiConfig } = await import("../packages/mcp-server/src/keeperhubApi.ts");

  const config = loadKeeperHubApiConfig({ KEEPERHUB_API_KEY: API_KEY, KEEPERHUB_WORKFLOW_ID: "wf_default" });

  assert.equal(config.apiBaseUrl, BASE_URL);
  assert.equal(config.apiKey, API_KEY);
  assert.equal(config.defaultWorkflowId, "wf_default");
});

test("KeeperHub workflow definition uses verified name/nodes/edges shape", async () => {
  const { buildAgentPassportsKeeperHubWorkflowDefinition } = await import("../packages/mcp-server/src/keeperhubApi.ts");

  const definition = buildAgentPassportsKeeperHubWorkflowDefinition({ name: "AgentPassports V3 KeeperHub Gate Test" });

  assert.equal(definition.name, "AgentPassports V3 KeeperHub Gate Test");
  assert.match(definition.description, /AgentPassports direct ENS KeeperHub gate/i);
  assert.ok(Array.isArray(definition.nodes));
  assert.ok(Array.isArray(definition.edges));
  assert.equal(definition.nodes[0].id, "agentpassports_trigger");
  assert.equal(definition.nodes[0].type, "trigger");
  assert.equal(definition.nodes[0].data.config.triggerType, "Manual");
  assert.ok(definition.edges.length > 0);
  assert.equal(JSON.stringify(definition).includes(API_KEY), false);
});

test("KeeperHub workflow definition is a direct-ENS-first multi-node Passport/Visa gate", async () => {
  const { buildAgentPassportsKeeperHubWorkflowDefinition } = await import("../packages/mcp-server/src/keeperhubApi.ts");

  const definition = buildAgentPassportsKeeperHubWorkflowDefinition({ name: "AgentPassports Direct ENS Gate Test" });
  const nodeIds = definition.nodes.map((node) => node.id);
  const nodeById = Object.fromEntries(definition.nodes.map((node) => [node.id, node]));
  const edgePairs = definition.edges.map((edge) => `${edge.source}->${edge.target}:${edge.label ?? edge.data?.label ?? ""}`);

  assert.equal(definition.gateMode, "direct-ens-first");
  assert.equal(definition.capabilityStatus.directEnsReads, "template-not-live-import-proven");
  assert.equal(definition.capabilityStatus.conditionBranches, "template-not-live-import-proven");

  for (const id of [
    "agentpassports_trigger",
    "ens_resolve_passport",
    "check_agent_exists",
    "check_status_active",
    "check_policy_digest",
    "check_action_allowed",
    "agentens_execute",
    "stamp_blocked_agent_missing",
    "stamp_blocked_status_inactive",
    "stamp_blocked_policy_invalid",
    "stamp_blocked_action_disallowed"
  ]) {
    assert.ok(nodeIds.includes(id), `${id} should be present`);
  }

  assert.match(JSON.stringify(nodeById.ens_resolve_passport), /eth_call/);
  assert.match(JSON.stringify(nodeById.ens_resolve_passport), /agent_status/);
  assert.match(JSON.stringify(nodeById.ens_resolve_passport), /agent_policy_digest/);
  assert.match(JSON.stringify(nodeById.ens_resolve_passport), /resolver\(bytes32\)|addr\(bytes32\)|text\(bytes32,string\)/);

  for (const id of ["check_agent_exists", "check_status_active", "check_policy_digest", "check_action_allowed"]) {
    assert.equal(nodeById[id].type, "condition", `${id} should be a visible KeeperHub condition node`);
  }

  assert.ok(edgePairs.some((edge) => edge.startsWith("check_agent_exists->stamp_blocked_agent_missing:false")));
  assert.ok(edgePairs.some((edge) => edge.startsWith("check_status_active->stamp_blocked_status_inactive:false")));
  assert.ok(edgePairs.some((edge) => edge.startsWith("check_policy_digest->stamp_blocked_policy_invalid:false")));
  assert.ok(edgePairs.some((edge) => edge.startsWith("check_action_allowed->stamp_blocked_action_disallowed:false")));
  assert.ok(edgePairs.some((edge) => edge.startsWith("check_action_allowed->agentens_execute:true")));

  const executionIncoming = definition.edges.filter((edge) => edge.target === "agentens_execute");
  assert.deepEqual(executionIncoming.map((edge) => edge.source), ["check_action_allowed"]);
  assert.equal(JSON.stringify(definition).includes(API_KEY), false);
  assert.doesNotMatch(JSON.stringify(definition), /privateKey|KEEPERHUB_API_KEY|kh_[A-Za-z0-9]/);
});

test("KeeperHub API client calls verified endpoints with bearer auth", async () => {
  const {
    createKeeperHubWorkflow,
    executeKeeperHubWorkflow,
    getKeeperHubExecutionLogs,
    getKeeperHubExecutionStatus,
    listKeeperHubWorkflows
  } = await import("../packages/mcp-server/src/keeperhubApi.ts");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/workflows") && (!init.method || init.method === "GET")) return createJsonResponse([{ id: "wf_1" }]);
    if (String(url).endsWith("/api/workflows/create")) return createJsonResponse({ workflowId: "wf_created" });
    if (String(url).endsWith("/api/workflow/wf_created/execute")) return createJsonResponse({ executionId: "exec_1", status: "running" });
    if (String(url).endsWith("/api/workflows/executions/exec_1/status")) return createJsonResponse({ status: "success" });
    if (String(url).endsWith("/api/workflows/executions/exec_1/logs")) return createJsonResponse({ runId: "wrun_1", status: "success" });
    return createJsonResponse({ error: "unexpected" }, { status: 404 });
  };

  const config = { apiBaseUrl: BASE_URL, apiKey: API_KEY };
  assert.deepEqual(await listKeeperHubWorkflows(config, fetchImpl), [{ id: "wf_1" }]);
  assert.deepEqual(await createKeeperHubWorkflow(config, { name: "wf", nodes: [], edges: [] }, fetchImpl), { workflowId: "wf_created" });
  assert.deepEqual(await executeKeeperHubWorkflow(config, "wf_created", { hello: "world" }, fetchImpl), { executionId: "exec_1", status: "running" });
  assert.deepEqual(await getKeeperHubExecutionStatus(config, "exec_1", fetchImpl), { status: "success" });
  assert.deepEqual(await getKeeperHubExecutionLogs(config, "exec_1", fetchImpl), { runId: "wrun_1", status: "success" });

  assert.deepEqual(calls.map((call) => call.url), [
    `${BASE_URL}/api/workflows`,
    `${BASE_URL}/api/workflows/create`,
    `${BASE_URL}/api/workflow/wf_created/execute`,
    `${BASE_URL}/api/workflows/executions/exec_1/status`,
    `${BASE_URL}/api/workflows/executions/exec_1/logs`
  ]);
  for (const call of calls) {
    assert.equal(call.init.headers.authorization, `Bearer ${API_KEY}`);
  }
  assert.equal(JSON.stringify(calls.map((call) => call.init.body ?? "")).includes(API_KEY), false);
});

test("KeeperHub API errors are redacted", async () => {
  const { listKeeperHubWorkflows } = await import("../packages/mcp-server/src/keeperhubApi.ts");
  const fetchImpl = async () => createJsonResponse({ error: `bad key ${API_KEY}` }, { status: 401 });

  await assert.rejects(
    () => listKeeperHubWorkflows({ apiBaseUrl: BASE_URL, apiKey: API_KEY }, fetchImpl),
    (error) => {
      assert.match(error.message, /KeeperHub API GET \/api\/workflows failed with HTTP 401/);
      assert.equal(error.message.includes(API_KEY), false);
      return true;
    }
  );
});

test("KeeperHub helpers extract nested run ids from real logs shape", async () => {
  const { extractKeeperHubExecutionId, extractKeeperHubRunId } = await import("../packages/mcp-server/src/keeperhubApi.ts");

  assert.equal(extractKeeperHubExecutionId({ executionId: "exec_top" }), "exec_top");
  assert.equal(extractKeeperHubRunId({ runId: "wrun_top" }), "wrun_top");
  assert.equal(
    extractKeeperHubRunId({ execution: { id: "exec_nested", runId: "wrun_nested", status: "success" }, logs: [] }),
    "wrun_nested"
  );
});

test("KeeperHub gated execution helper skips live execution when gate is blocked", async () => {
  const { executeKeeperHubApprovedFlow } = await import("../packages/mcp-server/src/keeperhubApi.ts");
  let executeCalls = 0;
  const gateDecision = {
    agentName: "assistant.agentpassports.eth",
    agentNode: "0x" + "11".repeat(32),
    allowed: false,
    blockers: ["agent_status must be exactly active"],
    decision: "blocked",
    gasBudgetWei: "0",
    liveSigner: null,
    policyDigest: "0x" + "22".repeat(32),
    policySnapshot: {},
    reasons: [],
    resolverAddress: null,
    score: 0,
    threshold: 70
  };

  const result = await executeKeeperHubApprovedFlow({
    executeApproved: async () => {
      executeCalls += 1;
      throw new Error("KeeperHub fetch should not be called");
    },
    gateDecision,
    taskDescription: "blocked task"
  });

  assert.equal(executeCalls, 0);
  assert.equal(result.gateDecision.decision, "blocked");
  assert.equal(result.keeperhub.skipped, true);
  assert.equal(result.attestation.decision, "blocked");
  assert.deepEqual(result.attestation.blockers, ["agent_status must be exactly active"]);
});
