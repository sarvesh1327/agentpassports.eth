import type { Hex } from "@agentpassport/config";

export const TASK_HISTORY_FROM_BLOCK = 0n;

export type TaskHistoryItem = {
  id: string;
  metadataURI: string;
  taskHash: Hex;
  timestamp: string;
  txHash: Hex;
};

export type TaskRecordedLog = {
  args: {
    metadataURI?: string;
    taskHash?: Hex;
    taskId?: bigint;
    timestamp?: bigint;
  };
  transactionHash: Hex;
};

/**
 * Converts one TaskRecorded log into a compact row shared by the agent and run pages.
 */
export function taskFromLog(log: TaskRecordedLog): TaskHistoryItem {
  const taskId = log.args.taskId?.toString() ?? log.transactionHash;
  const timestamp = log.args.timestamp ? new Date(Number(log.args.timestamp) * 1000).toISOString() : "Unknown time";
  return {
    id: `${log.transactionHash}-${taskId}`,
    metadataURI: log.args.metadataURI ?? "",
    taskHash: log.args.taskHash ?? "0x",
    timestamp,
    txHash: log.transactionHash
  };
}
