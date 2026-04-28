import type { Hex } from "@agentpassport/config";
import type { TaskHistoryItem } from "./taskHistory.ts";

export type TaskRecord = {
  agentNode: Hex;
  metadataURI: string;
  ownerNode: Hex;
  taskHash: Hex;
  taskId: string;
  timestamp: string;
  timestampSeconds: string;
  txHash: Hex;
  updatedAt: number;
};

export type TaskStore = {
  listByAgentNode(agentNode: Hex): TaskRecord[];
  upsert(record: TaskRecord): void;
};

/**
 * Normalizes a TaskLog event into the durable task row stored by the backend.
 */
export function buildTaskRecord(input: {
  agentNode: string;
  metadataURI?: string;
  ownerNode: string;
  taskHash: string;
  taskId: bigint;
  timestamp: bigint;
  txHash: string;
  updatedAt?: number;
}): TaskRecord {
  assertNonnegative(input.taskId, "taskId");
  assertNonnegative(input.timestamp, "timestamp");

  return {
    agentNode: normalizeBytes32(input.agentNode, "agentNode"),
    metadataURI: input.metadataURI?.trim() ?? "",
    ownerNode: normalizeBytes32(input.ownerNode, "ownerNode"),
    taskHash: normalizeBytes32(input.taskHash, "taskHash"),
    taskId: input.taskId.toString(),
    timestamp: new Date(Number(input.timestamp) * 1000).toISOString(),
    timestampSeconds: input.timestamp.toString(),
    txHash: normalizeBytes32(input.txHash, "txHash"),
    updatedAt: input.updatedAt ?? Number(input.timestamp) * 1000
  };
}

/**
 * Converts a stored task row into the compact presentation model shared by task history panels.
 */
export function taskHistoryItemFromRecord(record: TaskRecord): TaskHistoryItem {
  return {
    id: `${record.txHash}-${record.taskId}`,
    metadataURI: record.metadataURI,
    taskHash: record.taskHash,
    timestamp: record.timestamp,
    txHash: record.txHash
  };
}

/**
 * Normalizes query input so invalid agent nodes never reach SQLite statements.
 */
export function normalizeTaskAgentNode(value: string): Hex {
  return normalizeBytes32(value, "agentNode");
}

/**
 * Accepts only bytes32 values emitted by TaskLog or derived from ENS namehashes.
 */
function normalizeBytes32(value: string, label: string): Hex {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a bytes32 value`);
  }

  return normalized as Hex;
}

/**
 * Rejects impossible unsigned integer values before stringifying them for SQLite.
 */
function assertNonnegative(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`${label} must be nonnegative`);
  }
}
