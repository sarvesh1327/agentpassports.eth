import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const AGENT_NODE = `0x${"11".repeat(32)}`;
const OWNER_NODE = `0x${"22".repeat(32)}`;
const TASK_HASH = `0x${"33".repeat(32)}`;
const TX_HASH = `0x${"44".repeat(32)}`;

test("task records normalize TaskLog event data for database storage", async () => {
  const { buildTaskRecord } = await import("../apps/web/lib/taskStore.ts");

  assert.deepEqual(
    buildTaskRecord({
      agentNode: AGENT_NODE.toUpperCase(),
      metadataURI: " ipfs://task ",
      ownerNode: OWNER_NODE.toUpperCase(),
      taskHash: TASK_HASH.toUpperCase(),
      taskId: 7n,
      timestamp: 1_800_000_000n,
      txHash: TX_HASH.toUpperCase()
    }),
    {
      agentNode: AGENT_NODE,
      metadataURI: "ipfs://task",
      ownerNode: OWNER_NODE,
      taskHash: TASK_HASH,
      taskId: "7",
      timestamp: "2027-01-15T08:00:00.000Z",
      timestampSeconds: "1800000000",
      txHash: TX_HASH,
      updatedAt: 1_800_000_000_000
    }
  );
});

test("task records reject malformed onchain identifiers before reaching sqlite", async () => {
  const { buildTaskRecord } = await import("../apps/web/lib/taskStore.ts");

  assert.throws(
    () =>
      buildTaskRecord({
        agentNode: "0x1234",
        ownerNode: OWNER_NODE,
        taskHash: TASK_HASH,
        taskId: 1n,
        timestamp: 1n,
        txHash: TX_HASH
      }),
    /agentNode must be a bytes32 value/
  );
  assert.throws(
    () =>
      buildTaskRecord({
        agentNode: AGENT_NODE,
        ownerNode: OWNER_NODE,
        taskHash: TASK_HASH,
        taskId: -1n,
        timestamp: 1n,
        txHash: TX_HASH
      }),
    /taskId must be nonnegative/
  );
});

test("sqlite task store persists TaskLog records by agent node", async () => {
  const { buildTaskRecord } = await import("../apps/web/lib/taskStore.ts");
  const { createSqliteTaskStore } = await import("../apps/web/lib/taskStoreSqlite.ts");
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-tasks-"));
  const databasePath = path.join(directory, "agentpassports.sqlite");
  const older = buildTaskRecord({
    agentNode: AGENT_NODE,
    metadataURI: "",
    ownerNode: OWNER_NODE,
    taskHash: TASK_HASH,
    taskId: 1n,
    timestamp: 1_700_000_000n,
    txHash: TX_HASH
  });
  const newer = buildTaskRecord({
    agentNode: AGENT_NODE,
    metadataURI: "ipfs://newer",
    ownerNode: OWNER_NODE,
    taskHash: `0x${"55".repeat(32)}`,
    taskId: 2n,
    timestamp: 1_800_000_000n,
    txHash: `0x${"66".repeat(32)}`
  });

  const store = createSqliteTaskStore({ databasePath });
  store.upsert(older);
  store.upsert(newer);
  store.close();

  const reopened = createSqliteTaskStore({ databasePath });
  assert.deepEqual(reopened.listByAgentNode(AGENT_NODE), [newer, older]);
  reopened.close();
});
