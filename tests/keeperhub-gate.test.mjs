import assert from "node:assert/strict";
import test from "node:test";

const ACTIVE_PASSPORT = {
  agentAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  agentName: "assistant.agentpassports.eth",
  agentNode: "0x" + "11".repeat(32),
  gasBudgetWei: "10000000000000000",
  resolverAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  textRecords: {
    "agent_status": "active"
  }
};

const POLICY = {
  agentName: ACTIVE_PASSPORT.agentName,
  agentNode: ACTIVE_PASSPORT.agentNode,
  policyDigest: "0x" + "22".repeat(32),
  policySnapshot: {
    enabled: true,
    expiresAt: "1790000000",
    maxGasReimbursementWei: "1000000000000000",
    maxValueWei: "1000000000000000",
    selector: "0x36736d1e",
    target: "0xcccccccccccccccccccccccccccccccccccccccc"
  },
  policyUri: "ipfs://policy",
  status: "active"
};

const TASK_CHECK_ALLOWED = {
  allowed: true,
  selectorAllowed: true,
  targetAllowed: true,
  valueAllowed: true
};

const BUILD_INTENT_RESULT = {
  callData: "0x1234",
  chainId: "11155111",
  executorAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
  intent: {
    agentNode: ACTIVE_PASSPORT.agentNode,
    callDataHash: "0x" + "33".repeat(32),
    expiresAt: "1770000000",
    nonce: "0",
    policyDigest: POLICY.policyDigest,
    target: POLICY.policySnapshot.target,
    value: "0"
  },
  metadataURI: "ipfs://metadata",
  ownerName: "agentpassports.eth",
  ownerNode: "0x" + "44".repeat(32),
  policySnapshot: POLICY.policySnapshot,
  signingPayload: {
    chainId: "11155111",
    executorAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
    intent: {
      agentNode: ACTIVE_PASSPORT.agentNode,
      callDataHash: "0x" + "33".repeat(32),
      expiresAt: "1770000000",
      nonce: "0",
      policyDigest: POLICY.policyDigest,
      target: POLICY.policySnapshot.target,
      value: "0"
    },
    typedData: { domain: {}, message: {}, primaryType: "TaskIntent", types: {} }
  },
  taskHash: "0x" + "55".repeat(32)
};

test("KeeperHub-specific MCP preflight tools are removed from the thin MCP surface", async () => {
  const { AGENTPASSPORT_MCP_TOOLS } = await import("../packages/mcp-server/src/tools.ts");
  const byName = Object.fromEntries(AGENTPASSPORT_MCP_TOOLS.map((tool) => [tool.name, tool]));

  assert.deepEqual(Object.keys(byName).sort(), ["build_task_intent", "check_task_status", "submit_task"]);
  for (const removed of ["keeperhub_validate_agent_task", "keeperhub_build_workflow_payload", "keeperhub_emit_run_attestation"]) {
    assert.equal(byName[removed], undefined, `${removed} should not be registered as an MCP tool`);
  }
  assert.match(byName.build_task_intent.description, /KeeperHub performs Passport\/Visa validation/i);
  assert.match(byName.submit_task.description, /check_task_status/i);
  assert.match(byName.check_task_status.description, /execution id/i);
});

test("KeeperHub gate decision approves valid ENS passport and policy facts", async () => {
  const { buildKeeperHubGateDecision } = await import("../packages/mcp-server/src/keeperhub.ts");

  const decision = buildKeeperHubGateDecision({
    passport: ACTIVE_PASSPORT,
    policy: POLICY,
    taskCheck: TASK_CHECK_ALLOWED,
    trustThreshold: 70
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.decision, "approved");
  assert.equal(decision.score >= decision.threshold, true);
  assert.deepEqual(decision.blockers, []);
  assert.equal(decision.agentName, ACTIVE_PASSPORT.agentName);
  assert.equal(decision.liveSigner, ACTIVE_PASSPORT.agentAddress);
  assert.equal(decision.policyDigest, POLICY.policyDigest);
  assert.match(decision.reasons.join("\n"), /ENS status is active/);
  assert.match(decision.reasons.join("\n"), /policy digest verified/);
});

test("KeeperHub gate decision blocks deterministic ENS and policy failures", async () => {
  const { buildKeeperHubGateDecision } = await import("../packages/mcp-server/src/keeperhub.ts");

  const inactive = buildKeeperHubGateDecision({
    passport: { ...ACTIVE_PASSPORT, textRecords: { "agent_status": "disabled" } },
    policy: { ...POLICY, status: "disabled" },
    taskCheck: TASK_CHECK_ALLOWED,
    trustThreshold: 70
  });
  assert.equal(inactive.allowed, false);
  assert.equal(inactive.decision, "blocked");
  assert.match(inactive.blockers.join("\n"), /agent_status must be exactly active/);

  const missingSigner = buildKeeperHubGateDecision({
    passport: { ...ACTIVE_PASSPORT, agentAddress: null },
    policy: POLICY,
    taskCheck: TASK_CHECK_ALLOWED,
    trustThreshold: 70
  });
  assert.equal(missingSigner.allowed, false);
  assert.match(missingSigner.blockers.join("\n"), /live ENS addr\(\) signer is missing/);

  const disallowedTask = buildKeeperHubGateDecision({
    passport: ACTIVE_PASSPORT,
    policy: POLICY,
    taskCheck: { allowed: false, selectorAllowed: false, targetAllowed: true, valueAllowed: false },
    trustThreshold: 70
  });
  assert.equal(disallowedTask.allowed, false);
  assert.match(disallowedTask.blockers.join("\n"), /task is outside ENS policy/);
  assert.match(disallowedTask.blockers.join("\n"), /selector is not allowed/);
  assert.match(disallowedTask.blockers.join("\n"), /value exceeds policy/);
});

test("KeeperHub gate decision converts controlled policy errors into blocked decisions", async () => {
  const { buildKeeperHubGateDecision } = await import("../packages/mcp-server/src/keeperhub.ts");

  const decision = buildKeeperHubGateDecision({
    passport: { ...ACTIVE_PASSPORT, textRecords: { "agent_status": "disabled", "agent_policy_digest": POLICY.policyDigest } },
    policyError: new Error("agent_status must be exactly active"),
    trustThreshold: 70
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.decision, "blocked");
  assert.equal(decision.policyDigest, POLICY.policyDigest);
  assert.match(decision.blockers.join("\n"), /agent_status must be exactly active/);
  assert.match(decision.blockers.join("\n"), /policy preflight failed/);
});

test("blocked KeeperHub run attestation includes failed node, blocked code, and workflow context", async () => {
  const { buildRunAttestation } = await import("../packages/mcp-server/src/keeperhub.ts");

  const attestation = buildRunAttestation({
    agentName: ACTIVE_PASSPORT.agentName,
    agentNode: ACTIVE_PASSPORT.agentNode,
    blockedCode: "STATUS_NOT_ACTIVE",
    createdAt: "2026-05-01T00:00:00.000Z",
    decision: "blocked",
    failedNodeId: "check_status_active",
    keeperhubExecutionId: "exec_direct_ens_1",
    keeperhubRunId: "wrun_direct_ens_1",
    policyDigest: POLICY.policyDigest,
    reasons: [],
    blockers: ["agent_status must be exactly active"],
    taskDescription: "blocked task"
  });

  assert.equal(attestation.failedNodeId, "check_status_active");
  assert.equal(attestation.blockedCode, "STATUS_NOT_ACTIVE");
  assert.equal(attestation.agentNode, ACTIVE_PASSPORT.agentNode);
  assert.equal(attestation.keeperhubExecutionId, "exec_direct_ens_1");
  assert.equal(attestation.keeperhubRunId, "wrun_direct_ens_1");
  assert.equal(attestation.policyDigest, POLICY.policyDigest);
});
test("KeeperHub workflow payload wraps unsigned intent data without private key material", async () => {
  const { buildKeeperHubGateDecision, buildKeeperHubWorkflowPayload } = await import("../packages/mcp-server/src/keeperhub.ts");
  const gateDecision = buildKeeperHubGateDecision({
    passport: ACTIVE_PASSPORT,
    policy: POLICY,
    taskCheck: TASK_CHECK_ALLOWED,
    trustThreshold: 70
  });

  const payload = buildKeeperHubWorkflowPayload({
    buildIntentResult: BUILD_INTENT_RESULT,
    gateDecision,
    passport: ACTIVE_PASSPORT
  });

  assert.equal(payload.workflowName, "AgentPassports Execute ENS-Verified Task");
  assert.equal(payload.gateDecision.decision, "approved");
  assert.equal(payload.workflowPayload.agentName, ACTIVE_PASSPORT.agentName);
  assert.equal(payload.workflowPayload.agentNode, ACTIVE_PASSPORT.agentNode);
  assert.equal(payload.workflowPayload.callData, BUILD_INTENT_RESULT.callData);
  assert.equal(payload.workflowPayload.unsignedIntent, BUILD_INTENT_RESULT.intent);
  assert.equal(payload.workflowPayload.signingPayload, BUILD_INTENT_RESULT.signingPayload);
  assert.equal(JSON.stringify(payload).includes("PRIVATE_KEY"), false);
  assert.equal(JSON.stringify(payload).includes("privateKey"), false);
});

test("KeeperHub run attestation has stable schema and hashes task text", async () => {
  const { buildRunAttestation } = await import("../packages/mcp-server/src/keeperhub.ts");

  const attestation = buildRunAttestation({
    agentName: ACTIVE_PASSPORT.agentName,
    blockers: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    decision: "approved",
    keeperhubRunId: "kh_run_123",
    policyDigest: POLICY.policyDigest,
    reasons: ["ENS status is active"],
    taskDescription: "Record keeperhub-gated task",
    txHash: "0x" + "66".repeat(32)
  });

  assert.equal(attestation.schema, "agentpassport.keeperhubRunAttestation.v1");
  assert.equal(attestation.agentName, ACTIVE_PASSPORT.agentName);
  assert.equal(attestation.decision, "approved");
  assert.equal(attestation.taskHash.length, 66);
  assert.equal(attestation.policyDigest, POLICY.policyDigest);
  assert.equal(attestation.keeperhubRunId, "kh_run_123");
  assert.equal(attestation.createdAt, "2026-05-01T00:00:00.000Z");
  assert.deepEqual(attestation.blockers, []);
});
