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

type TaskHistoryResponse = {
  tasks?: TaskHistoryItem[];
};

type TaskHistoryFetcher = (input: string) => Promise<{
  json(): Promise<unknown>;
  ok: boolean;
}>;

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

/**
 * Loads the backend-indexed task history for one agent node.
 */
export async function fetchTaskHistory(agentNode: Hex, fetcher: TaskHistoryFetcher = fetch): Promise<TaskHistoryItem[]> {
  const response = await fetcher(`/api/tasks?agentNode=${encodeURIComponent(agentNode)}`);
  if (!response.ok) {
    throw new Error("Task history request failed");
  }

  const body = (await response.json()) as TaskHistoryResponse;
  return Array.isArray(body.tasks) ? body.tasks.map(normalizeTaskHistoryItem) : [];
}

/**
 * Keeps API history rows renderable even if the local DB contains an older shape.
 */
function normalizeTaskHistoryItem(item: TaskHistoryItem): TaskHistoryItem {
  return {
    id: String(item.id ?? `${item.txHash}-${item.taskHash}`),
    metadataURI: String(item.metadataURI ?? ""),
    taskHash: item.taskHash,
    timestamp: String(item.timestamp ?? "Unknown time"),
    txHash: item.txHash
  };
}
