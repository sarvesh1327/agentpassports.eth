import assert from "node:assert/strict";
import test from "node:test";

const EXECUTOR_ADDRESS = "0x3B42d507E1B13eE164cAb0FbA4EA66f8a1B653f1";
const TASK_LOG_ADDRESS = "0x3AB718580b476D64fdD3CE6a9Ab63491B15767d9";
const POLICY_SNAPSHOT = {
  enabled: true,
  expiresAt: 1_800_001_000n,
  maxGasReimbursementWei: 200_000_000_000_000n,
  maxValueWei: 0n,
  selector: "0x36736d1e",
  target: TASK_LOG_ADDRESS
};

test("task demo draft builds recordTask calldata and viem-ready typed data", async () => {
  const { buildTaskRunDraft, serializeRelayerExecutePayload } = await import("../apps/web/lib/taskDemo.ts");
  const { taskLogRecordTaskSelector } = await import("../packages/config/src/index.ts");

  const draft = buildTaskRunDraft({
    agentName: "assistant.agentpassports.eth",
    chainId: 11155111n,
    executorAddress: EXECUTOR_ADDRESS,
    expiresAt: 1_800_000_000n,
    metadataURI: "ipfs://task-proof",
    nonce: 7n,
    ownerName: "agentpassports.eth",
    policySnapshot: POLICY_SNAPSHOT,
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const payload = serializeRelayerExecutePayload({
    callData: draft.callData,
    intent: draft.intent,
    policySnapshot: draft.policySnapshot,
    signature: `0x${"11".repeat(65)}`
  });

  assert.equal(draft.callData.slice(0, 10), taskLogRecordTaskSelector());
  assert.equal(draft.intent.callDataHash.length, 66);
  assert.equal(draft.intent.policyDigest.length, 66);
  assert.deepEqual(payload.policySnapshot, {
    enabled: true,
    expiresAt: "1800001000",
    maxGasReimbursementWei: "200000000000000",
    maxValueWei: "0",
    selector: "0x36736d1e",
    target: TASK_LOG_ADDRESS
  });
  assert.equal(draft.typedData.primaryType, "TaskIntent");
  assert.equal(draft.typedData.domain.name, "AgentEnsExecutor");
  assert.equal(draft.typedData.domain.verifyingContract, EXECUTOR_ADDRESS);
  assert.equal(payload.intent.nonce, "7");
  assert.equal(payload.intent.expiresAt, "1800000000");
});

test("task demo draft allows blank metadata URI for tasks without offchain proof", async () => {
  const { decodeFunctionData } = await import("../apps/web/node_modules/viem/_esm/index.js");
  const { buildTaskRunDraft } = await import("../apps/web/lib/taskDemo.ts");
  const { TASK_LOG_ABI } = await import("../apps/web/lib/contracts.ts");

  const draft = buildTaskRunDraft({
    agentName: "assistant.agentpassports.eth",
    chainId: 11155111n,
    executorAddress: EXECUTOR_ADDRESS,
    expiresAt: 1_800_000_000n,
    metadataURI: "   ",
    nonce: 7n,
    ownerName: "agentpassports.eth",
    policySnapshot: POLICY_SNAPSHOT,
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const decoded = decodeFunctionData({ abi: TASK_LOG_ABI, data: draft.callData });

  assert.equal(decoded.functionName, "recordTask");
  assert.equal(decoded.args[3], "");
});

test("task demo draft requires owner ENS to match the agent immediate parent", async () => {
  const { buildTaskRunDraft } = await import("../apps/web/lib/taskDemo.ts");

  assert.throws(
    () =>
      buildTaskRunDraft({
        agentName: "assistant.team.agentpassports.eth",
        chainId: 11155111n,
        executorAddress: EXECUTOR_ADDRESS,
        expiresAt: 1_800_000_000n,
        metadataURI: "ipfs://task-proof",
        nonce: 7n,
        ownerName: "agentpassports.eth",
        policySnapshot: POLICY_SNAPSHOT,
        taskDescription: "Record wallet health check",
        taskLogAddress: TASK_LOG_ADDRESS
      }),
    /immediate parent/
  );
});

test("task demo fresh draft derives expiry from the current signing time", async () => {
  const { buildFreshTaskRunDraft } = await import("../apps/web/lib/taskDemo.ts");

  const draft = buildFreshTaskRunDraft({
    agentName: "assistant.agentpassports.eth",
    chainId: 11155111n,
    executorAddress: EXECUTOR_ADDRESS,
    metadataURI: "ipfs://task-proof",
    nonce: 7n,
    nowSeconds: 1_800_000_000n,
    ownerName: "agentpassports.eth",
    policySnapshot: POLICY_SNAPSHOT,
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS,
    ttlSeconds: 600n
  });

  assert.equal(draft.intent.expiresAt, 1_800_000_600n);
});

test("task authorization proof requires matching signer and enabled policy", async () => {
  const { taskAuthorizationResult } = await import("../apps/web/lib/taskDemo.ts");
  const signer = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const sameSignerDifferentCase = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const otherSigner = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  assert.deepEqual(
    taskAuthorizationResult({
      liveAgentAddress: sameSignerDifferentCase,
      policyEnabled: true,
      recoveredSigner: signer
    }),
    { status: "pass" }
  );
  assert.deepEqual(
    taskAuthorizationResult({
      liveAgentAddress: otherSigner,
      policyEnabled: true,
      recoveredSigner: signer
    }),
    {
      failureReason: "Recovered signer does not match ENS addr(agent)",
      status: "fail"
    }
  );
  assert.deepEqual(
    taskAuthorizationResult({
      liveAgentAddress: signer,
      policyEnabled: false,
      recoveredSigner: signer
    }),
    {
      failureReason: "Policy is disabled",
      status: "fail"
    }
  );
  assert.deepEqual(
    taskAuthorizationResult({
      liveAgentAddress: signer,
      policyEnabled: undefined,
      recoveredSigner: signer
    }),
    { status: "unknown" }
  );
  assert.deepEqual(
    taskAuthorizationResult({
      liveAgentAddress: null,
      policyEnabled: true,
      recoveredSigner: signer
    }),
    { status: "unknown" }
  );
});

test("task gas budget status treats reimbursement cap as a ceiling, not a required balance", async () => {
  const { taskGasBudgetStatus } = await import("../apps/web/lib/taskDemo.ts");

  assert.deepEqual(
    taskGasBudgetStatus({
      gasBudgetWei: 110100000000000n,
      maxGasReimbursementWei: 1000000000000000n,
      maxValueWei: 0n
    }),
    {
      blocker: null,
      requiredWei: 0n
    }
  );
  assert.deepEqual(
    taskGasBudgetStatus({
      gasBudgetWei: 0n,
      maxGasReimbursementWei: 1000000000000000n,
      maxValueWei: 0n
    }),
    {
      blocker: "Gas budget is empty",
      requiredWei: 1n
    }
  );
});

test("stored signed payload hashes the normalized owner ENS name", async () => {
  const { buildStoredSignedTaskPayload, buildTaskRunDraft } = await import("../apps/web/lib/taskDemo.ts");
  const { namehashEnsName } = await import("../packages/config/src/index.ts");
  const draft = buildTaskRunDraft({
    agentName: "assistant.agentpassports.eth",
    chainId: 11155111n,
    executorAddress: EXECUTOR_ADDRESS,
    expiresAt: 1_800_000_000n,
    metadataURI: "ipfs://task-proof",
    nonce: 7n,
    ownerName: "agentpassports.eth",
    policySnapshot: POLICY_SNAPSHOT,
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  const stored = buildStoredSignedTaskPayload({
    agentName: "assistant.agentpassports.eth ",
    callData: draft.callData,
    digest: draft.digest,
    intent: draft.intent,
    ownerName: "agentpassports.eth ",
    policySnapshot: draft.policySnapshot,
    recoveredSigner: null,
    signature: `0x${"11".repeat(65)}`,
    taskHash: draft.taskHash,
    typedData: draft.typedData
  });

  assert.equal(stored.ownerName, "agentpassports.eth");
  assert.equal(stored.ownerNode, namehashEnsName("agentpassports.eth"));
});

test("signed payload storage is best-effort when browser storage is unavailable", async () => {
  const { storeSignedTaskPayload } = await import("../apps/web/lib/taskDemo.ts");
  const payload = {
    agentName: "assistant.agentpassports.eth",
    agentNode: `0x${"11".repeat(32)}`,
    callData: "0x1234",
    digest: `0x${"22".repeat(32)}`,
    intent: {
      agentNode: `0x${"11".repeat(32)}`,
      callDataHash: `0x${"33".repeat(32)}`,
      expiresAt: "1800000000",
      nonce: "7",
      target: TASK_LOG_ADDRESS,
      value: "0"
    },
    ownerName: "agentpassports.eth",
    ownerNode: `0x${"44".repeat(32)}`,
    recoveredSigner: null,
    signature: `0x${"55".repeat(65)}`,
    taskHash: `0x${"66".repeat(32)}`,
    typedData: {
      domain: {
        chainId: "11155111",
        name: "AgentEnsExecutor",
        verifyingContract: EXECUTOR_ADDRESS,
        version: "1"
      },
      message: {
        agentNode: `0x${"11".repeat(32)}`,
        callDataHash: `0x${"33".repeat(32)}`,
        expiresAt: "1800000000",
        nonce: "7",
        policyDigest: `0x${"77".repeat(32)}`,
        target: TASK_LOG_ADDRESS,
        value: "0"
      },
      primaryType: "TaskIntent",
      types: { TaskIntent: [] }
    }
  };

  const stored = storeSignedTaskPayload({
    payload,
    storage: {
      setItem() {
        throw new Error("storage unavailable");
      }
    }
  });

  assert.equal(stored, false);
});

test("stored payload matching rejects signatures from another agent node", async () => {
  const { storedPayloadMatchesAgentNode } = await import("../apps/web/lib/taskDemo.ts");
  const payload = {
    intent: {
      agentNode: `0x${"11".repeat(32)}`
    }
  };

  assert.equal(storedPayloadMatchesAgentNode(payload, `0x${"11".repeat(32)}`), true);
  assert.equal(storedPayloadMatchesAgentNode(payload, `0x${"22".repeat(32)}`), false);
});

test("stored payload matching rejects malformed saved payloads", async () => {
  const { storedPayloadMatchesAgentNode } = await import("../apps/web/lib/taskDemo.ts");

  assert.equal(storedPayloadMatchesAgentNode({}, `0x${"11".repeat(32)}`), false);
  assert.equal(storedPayloadMatchesAgentNode({ intent: {} }, `0x${"11".repeat(32)}`), false);
});
