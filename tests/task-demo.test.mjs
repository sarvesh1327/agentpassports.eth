import assert from "node:assert/strict";
import test from "node:test";

const EXECUTOR_ADDRESS = "0x3B42d507E1B13eE164cAb0FbA4EA66f8a1B653f1";
const TASK_LOG_ADDRESS = "0x3AB718580b476D64fdD3CE6a9Ab63491B15767d9";

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
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS
  });
  const payload = serializeRelayerExecutePayload({
    callData: draft.callData,
    intent: draft.intent,
    signature: `0x${"11".repeat(65)}`
  });

  assert.equal(draft.callData.slice(0, 10), taskLogRecordTaskSelector());
  assert.equal(draft.intent.callDataHash.length, 66);
  assert.equal(draft.typedData.primaryType, "TaskIntent");
  assert.equal(draft.typedData.domain.verifyingContract, EXECUTOR_ADDRESS);
  assert.equal(payload.intent.nonce, "7");
  assert.equal(payload.intent.expiresAt, "1800000000");
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
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS,
    ttlSeconds: 600n
  });

  assert.equal(draft.intent.expiresAt, 1_800_000_600n);
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
    taskDescription: "Record wallet health check",
    taskLogAddress: TASK_LOG_ADDRESS
  });

  const stored = buildStoredSignedTaskPayload({
    agentName: "assistant.agentpassports.eth ",
    callData: draft.callData,
    digest: draft.digest,
    intent: draft.intent,
    ownerName: "agentpassports.eth ",
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
        name: "AgentPolicyExecutor",
        verifyingContract: EXECUTOR_ADDRESS,
        version: "1"
      },
      message: {
        agentNode: `0x${"11".repeat(32)}`,
        callDataHash: `0x${"33".repeat(32)}`,
        expiresAt: "1800000000",
        nonce: "7",
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
