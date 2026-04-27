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
