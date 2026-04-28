import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Hex } from "@agentpassport/config";
import type { TaskRecord, TaskStore } from "./taskStore.ts";

type SqliteValue = string | number | bigint | null;

type SqliteStatement = {
  all(...values: SqliteValue[]): unknown[];
  run(...values: SqliteValue[]): void;
};

type SqliteDatabase = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
};

type SqliteConstructor = new (filename: string) => SqliteDatabase;

export type SqliteTaskStore = TaskStore & {
  close(): void;
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: SqliteConstructor };

/**
 * Opens the local SQLite task index populated after TaskLog emits successful records.
 */
export function createSqliteTaskStore(options: {
  databasePath?: string;
} = {}): SqliteTaskStore {
  const databasePath = options.databasePath ?? defaultAgentPassportDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS task_records (
      tx_hash TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_node TEXT NOT NULL,
      owner_node TEXT NOT NULL,
      task_hash TEXT NOT NULL,
      metadata_uri TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      timestamp_seconds TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (tx_hash, task_id)
    );

    CREATE INDEX IF NOT EXISTS task_records_agent_node_updated_at
      ON task_records (agent_node, updated_at DESC);
  `);

  const upsertStatement = database.prepare(`
    INSERT INTO task_records (
      tx_hash,
      task_id,
      agent_node,
      owner_node,
      task_hash,
      metadata_uri,
      timestamp,
      timestamp_seconds,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tx_hash, task_id) DO UPDATE SET
      agent_node = excluded.agent_node,
      owner_node = excluded.owner_node,
      task_hash = excluded.task_hash,
      metadata_uri = excluded.metadata_uri,
      timestamp = excluded.timestamp,
      timestamp_seconds = excluded.timestamp_seconds,
      updated_at = excluded.updated_at;
  `);
  const listByAgentNodeStatement = database.prepare(`
    SELECT
      agent_node AS agentNode,
      metadata_uri AS metadataURI,
      owner_node AS ownerNode,
      task_hash AS taskHash,
      task_id AS taskId,
      timestamp,
      timestamp_seconds AS timestampSeconds,
      tx_hash AS txHash,
      updated_at AS updatedAt
    FROM task_records
    WHERE agent_node = ?
    ORDER BY updated_at DESC, task_id DESC;
  `);

  return {
    close: () => database.close(),
    listByAgentNode: (agentNode) =>
      listByAgentNodeStatement.all(agentNode.toLowerCase()).map(readTaskRecordRow),
    upsert: (record) =>
      upsertStatement.run(
        record.txHash,
        record.taskId,
        record.agentNode,
        record.ownerNode,
        record.taskHash,
        record.metadataURI,
        record.timestamp,
        record.timestampSeconds,
        record.updatedAt
      )
  };
}

/**
 * Uses one app-local database for directory and task indexes unless an env override is provided.
 */
function defaultAgentPassportDatabasePath(): string {
  const configuredPath = process.env.AGENTPASSPORT_DB_PATH?.trim() || process.env.AGENT_DIRECTORY_DB_PATH?.trim();
  return configuredPath || path.resolve(process.cwd(), ".data/agent-directory.sqlite");
}

/**
 * Converts SQLite rows into typed task records used by API serialization.
 */
function readTaskRecordRow(row: unknown): TaskRecord {
  const value = row as {
    agentNode: string;
    metadataURI: string;
    ownerNode: string;
    taskHash: string;
    taskId: string;
    timestamp: string;
    timestampSeconds: string;
    txHash: string;
    updatedAt: number;
  };

  return {
    agentNode: value.agentNode as Hex,
    metadataURI: value.metadataURI,
    ownerNode: value.ownerNode as Hex,
    taskHash: value.taskHash as Hex,
    taskId: value.taskId,
    timestamp: value.timestamp,
    timestampSeconds: value.timestampSeconds,
    txHash: value.txHash as Hex,
    updatedAt: value.updatedAt
  };
}
