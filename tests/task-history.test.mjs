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

test("task history merges backend rows with onchain TaskLog events", async () => {
  const { loadTaskHistory } = await import("../apps/web/lib/taskHistory.ts");
  const agentNode = `0x${"11".repeat(32)}`;
  const taskLogAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const dbTask = {
    id: "db-task",
    metadataURI: "ipfs://db",
    taskHash: `0x${"22".repeat(32)}`,
    timestamp: "2027-01-15T08:00:00.000Z",
    txHash: `0x${"33".repeat(32)}`
  };
  const chainTxHash = `0x${"44".repeat(32)}`;
  const chainTaskHash = `0x${"55".repeat(32)}`;
  const publicClient = {
    getLogs: async (request) => {
      assert.equal(request.address, taskLogAddress);
      assert.equal(request.args.agentNode, agentNode);
      return [
        {
          args: {
            metadataURI: "ipfs://chain",
            taskHash: chainTaskHash,
            taskId: 3n,
            timestamp: 1_800_000_100n
          },
          transactionHash: chainTxHash
        }
      ];
    }
  };

  const tasks = await loadTaskHistory({
    agentNode,
    fetcher: async () => ({
      ok: true,
      json: async () => ({ tasks: [dbTask] })
    }),
    publicClient,
    taskLogAddress
  });

  assert.deepEqual(tasks, [
    {
      id: `${chainTxHash}-3`,
      metadataURI: "ipfs://chain",
      taskHash: chainTaskHash,
      timestamp: "2027-01-15T08:01:40.000Z",
      txHash: chainTxHash
    },
    dbTask
  ]);
});
