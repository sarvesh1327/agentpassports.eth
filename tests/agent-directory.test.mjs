import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const AGENT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("agent directory records normalize address and derive owner ENS", async () => {
  const { buildAgentDirectoryRecord } = await import("../apps/web/lib/agentDirectory.ts");

  const record = buildAgentDirectoryRecord({
    agentAddress: ` ${AGENT_ADDRESS.toUpperCase()} `,
    agentName: "Assistant.AgentPassports.eth",
    updatedAt: 1_000
  });

  assert.deepEqual(record, {
    agentAddress: AGENT_ADDRESS,
    agentName: "assistant.agentpassports.eth",
    agentNode: "0x6cd55e90d0685b97e945c48f13be83342b2f8959550fd8f255da0c8c3d10351a",
    ownerName: "agentpassports.eth",
    updatedAt: 1_000
  });
});

test("agent directory rejects invalid records before they reach sqlite", async () => {
  const { buildAgentDirectoryRecord } = await import("../apps/web/lib/agentDirectory.ts");

  assert.throws(
    () => buildAgentDirectoryRecord({ agentAddress: "0x1234", agentName: "assistant.agentpassports.eth" }),
    /valid agent address/
  );
  assert.throws(
    () => buildAgentDirectoryRecord({ agentAddress: AGENT_ADDRESS, agentName: "agentpassports" }),
    /complete agent ENS/
  );
});

test("agent directory returns only entries still verified by forward ENS", async () => {
  const { buildAgentDirectoryRecord, resolveVerifiedAgentDirectoryRecord } = await import("../apps/web/lib/agentDirectory.ts");
  const stale = buildAgentDirectoryRecord({
    agentAddress: AGENT_ADDRESS,
    agentName: "stale.agentpassports.eth",
    updatedAt: 2_000
  });
  const fresh = buildAgentDirectoryRecord({
    agentAddress: AGENT_ADDRESS,
    agentName: "assistant.agentpassports.eth",
    updatedAt: 1_000
  });
  const store = {
    listByAgentAddress: () => [stale, fresh],
    upsert: () => undefined
  };

  const verified = await resolveVerifiedAgentDirectoryRecord({
    agentAddress: AGENT_ADDRESS,
    readForwardAgentAddress: async (record) => (record.agentName === fresh.agentName ? AGENT_ADDRESS : OTHER_ADDRESS),
    store
  });

  assert.deepEqual(verified, fresh);
});

test("agent directory returns verified agents for an owner ENS name", async () => {
  const {
    buildAgentDirectoryRecord,
    resolveVerifiedAgentDirectoryRecordsByOwner
  } = await import("../apps/web/lib/agentDirectory.ts");
  const assistant = buildAgentDirectoryRecord({
    agentAddress: AGENT_ADDRESS,
    agentName: "assistant.agentpassports.eth",
    updatedAt: 1_000
  });
  const helper = buildAgentDirectoryRecord({
    agentAddress: OTHER_ADDRESS,
    agentName: "helper.agentpassports.eth",
    updatedAt: 2_000
  });
  const stale = buildAgentDirectoryRecord({
    agentAddress: OTHER_ADDRESS,
    agentName: "stale.agentpassports.eth",
    updatedAt: 3_000
  });
  const store = {
    listByAgentAddress: () => [],
    listByOwnerName: () => [stale, helper, assistant],
    upsert: () => undefined
  };

  const verified = await resolveVerifiedAgentDirectoryRecordsByOwner({
    ownerName: " AgentPassports.eth ",
    readForwardAgentAddress: async (record) => (record.agentName === stale.agentName ? AGENT_ADDRESS : record.agentAddress),
    store
  });

  assert.deepEqual(verified, [helper, assistant]);
});

test("sqlite agent directory persists address keyed records", async () => {
  const { buildAgentDirectoryRecord } = await import("../apps/web/lib/agentDirectory.ts");
  const { createSqliteAgentDirectoryStore } = await import("../apps/web/lib/agentDirectorySqlite.ts");
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-directory-"));
  const databasePath = path.join(directory, "agents.sqlite");
  const record = buildAgentDirectoryRecord({
    agentAddress: AGENT_ADDRESS,
    agentName: "assistant.agentpassports.eth",
    updatedAt: 1_000
  });

  const store = createSqliteAgentDirectoryStore({ databasePath });
  store.upsert(record);
  store.close();

  const reopened = createSqliteAgentDirectoryStore({ databasePath });
  assert.deepEqual(reopened.listByAgentAddress(AGENT_ADDRESS), [record]);
  reopened.close();
});

test("sqlite agent directory persists owner keyed records", async () => {
  const { buildAgentDirectoryRecord } = await import("../apps/web/lib/agentDirectory.ts");
  const { createSqliteAgentDirectoryStore } = await import("../apps/web/lib/agentDirectorySqlite.ts");
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-directory-owner-"));
  const databasePath = path.join(directory, "agents.sqlite");
  const assistant = buildAgentDirectoryRecord({
    agentAddress: AGENT_ADDRESS,
    agentName: "assistant.agentpassports.eth",
    updatedAt: 1_000
  });
  const helper = buildAgentDirectoryRecord({
    agentAddress: OTHER_ADDRESS,
    agentName: "helper.agentpassports.eth",
    updatedAt: 2_000
  });

  const store = createSqliteAgentDirectoryStore({ databasePath });
  store.upsert(assistant);
  store.upsert(helper);
  store.close();

  const reopened = createSqliteAgentDirectoryStore({ databasePath });
  assert.deepEqual(reopened.listByOwnerName(" AgentPassports.eth "), [helper, assistant]);
  reopened.close();
});

test("agent directory API verifies names through forward ENS before serving them", async () => {
  const routeSource = await readText("apps/web/app/api/agents/route.ts");

  assert.match(routeSource, /buildAgentDirectoryRecord/);
  assert.match(routeSource, /resolveVerifiedAgentDirectoryRecord/);
  assert.match(routeSource, /resolveVerifiedAgentDirectoryRecordsByOwner/);
  assert.match(routeSource, /ownerName/);
  assert.match(routeSource, /agents/);
  assert.match(routeSource, /getResolverAddress/);
  assert.match(routeSource, /getAgentAddress/);
  assert.match(routeSource, /createSqliteAgentDirectoryStore/);
});
