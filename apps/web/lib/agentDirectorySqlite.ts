import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { AgentDirectoryRecord, AgentDirectoryStore } from "./agentDirectory.ts";
import type { Hex } from "@agentpassport/config";

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

export type SqliteAgentDirectoryStore = AgentDirectoryStore & {
  close(): void;
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: SqliteConstructor };

/**
 * Opens the local SQLite store used as a discovery index for agent wallet addresses.
 */
export function createSqliteAgentDirectoryStore(options: {
  databasePath?: string;
} = {}): SqliteAgentDirectoryStore {
  const databasePath = options.databasePath ?? defaultAgentDirectoryDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_directory (
      agent_address TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      agent_node TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (agent_address, agent_name)
    );

    CREATE INDEX IF NOT EXISTS agent_directory_agent_address_updated_at
      ON agent_directory (agent_address, updated_at DESC);

    CREATE INDEX IF NOT EXISTS agent_directory_owner_name_updated_at
      ON agent_directory (owner_name, updated_at DESC);
  `);

  const upsertStatement = database.prepare(`
    INSERT INTO agent_directory (
      agent_address,
      agent_name,
      agent_node,
      owner_name,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(agent_address, agent_name) DO UPDATE SET
      agent_node = excluded.agent_node,
      owner_name = excluded.owner_name,
      updated_at = excluded.updated_at;
  `);
  const listStatement = database.prepare(`
    SELECT
      agent_address AS agentAddress,
      agent_name AS agentName,
      agent_node AS agentNode,
      owner_name AS ownerName,
      updated_at AS updatedAt
    FROM agent_directory
    WHERE agent_address = ?
    ORDER BY updated_at DESC;
  `);
  const listByOwnerNameStatement = database.prepare(`
    SELECT
      agent_address AS agentAddress,
      agent_name AS agentName,
      agent_node AS agentNode,
      owner_name AS ownerName,
      updated_at AS updatedAt
    FROM agent_directory
    WHERE owner_name = ?
    ORDER BY updated_at DESC;
  `);

  return {
    close: () => database.close(),
    listByAgentAddress: (agentAddress) =>
      listStatement.all(agentAddress.toLowerCase()).map(readAgentDirectoryRow),
    listByOwnerName: (ownerName) =>
      listByOwnerNameStatement.all(ownerName.trim().toLowerCase()).map(readAgentDirectoryRow),
    upsert: (record) =>
      upsertStatement.run(
        record.agentAddress.toLowerCase(),
        record.agentName,
        record.agentNode,
        record.ownerName,
        record.updatedAt
      )
  };
}

/**
 * Chooses the shared app database path used by agent and task indexes.
 */
function defaultAgentDirectoryDatabasePath(): string {
  const configuredPath = process.env.AGENTPASSPORT_DB_PATH?.trim() || process.env.AGENT_DIRECTORY_DB_PATH?.trim();
  return configuredPath || path.resolve(process.cwd(), ".data/agent-directory.sqlite");
}

/**
 * Converts SQLite's untyped row object into the typed directory record used by the app.
 */
function readAgentDirectoryRow(row: unknown): AgentDirectoryRecord {
  const value = row as {
    agentAddress: string;
    agentName: string;
    agentNode: string;
    ownerName: string;
    updatedAt: number;
  };

  return {
    agentAddress: value.agentAddress as Hex,
    agentName: value.agentName,
    agentNode: value.agentNode as Hex,
    ownerName: value.ownerName,
    updatedAt: value.updatedAt
  };
}
