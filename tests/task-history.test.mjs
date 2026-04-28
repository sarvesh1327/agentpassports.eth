import assert from "node:assert/strict";
import test from "node:test";

test("task history converts TaskRecorded logs into stable display rows", async () => {
  const { taskFromLog } = await import("../apps/web/lib/taskHistory.ts");
  const txHash = `0x${"aa".repeat(32)}`;
  const taskHash = `0x${"bb".repeat(32)}`;

  assert.deepEqual(
    taskFromLog({
      args: {
        metadataURI: "ipfs://task-proof",
        taskHash,
        taskId: 7n,
        timestamp: 1_800_000_000n
      },
      transactionHash: txHash
    }),
    {
      id: `${txHash}-7`,
      metadataURI: "ipfs://task-proof",
      taskHash,
      timestamp: "2027-01-15T08:00:00.000Z",
      txHash
    }
  );
});

test("task history tolerates incomplete logs while keeping rows renderable", async () => {
  const { taskFromLog } = await import("../apps/web/lib/taskHistory.ts");
  const txHash = `0x${"cc".repeat(32)}`;

  assert.deepEqual(
    taskFromLog({
      args: {},
      transactionHash: txHash
    }),
    {
      id: `${txHash}-${txHash}`,
      metadataURI: "",
      taskHash: "0x",
      timestamp: "Unknown time",
      txHash
    }
  );
});
