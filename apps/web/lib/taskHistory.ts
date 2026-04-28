import type { Hex } from "@agentpassport/config";
import { TASK_RECORDED_EVENT } from "./contracts.ts";

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

type TaskHistoryPublicClient = {
  getLogs(input: {
    address: Hex;
    args: { agentNode: Hex };
    event: typeof TASK_RECORDED_EVENT;
    fromBlock: bigint;
    toBlock: "latest";
  }): Promise<TaskRecordedLog[]>;
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
 * Loads task history from both the local relayer index and live TaskLog events.
 */
export async function loadTaskHistory(input: {
  agentNode: Hex;
  fetcher?: TaskHistoryFetcher;
  fromBlock?: bigint;
  publicClient?: TaskHistoryPublicClient | null;
  taskLogAddress?: Hex | null;
}): Promise<TaskHistoryItem[]> {
  const [indexedTasks, chainTasks] = await Promise.all([
    fetchTaskHistory(input.agentNode, input.fetcher).catch(() => []),
    fetchChainTaskHistory(input).catch(() => [])
  ]);

  return mergeTaskHistory(indexedTasks, chainTasks);
}

/**
 * Reads TaskRecorded logs directly so history is not limited to this browser session or relayer process.
 */
async function fetchChainTaskHistory(input: {
  agentNode: Hex;
  fromBlock?: bigint;
  publicClient?: TaskHistoryPublicClient | null;
  taskLogAddress?: Hex | null;
}): Promise<TaskHistoryItem[]> {
  if (!input.publicClient || !input.taskLogAddress) {
    return [];
  }

  const logs = await input.publicClient.getLogs({
    address: input.taskLogAddress,
    args: { agentNode: input.agentNode },
    event: TASK_RECORDED_EVENT,
    fromBlock: input.fromBlock ?? TASK_HISTORY_FROM_BLOCK,
    toBlock: "latest"
  });

  return logs.map(taskFromLog);
}

/**
 * De-duplicates chain and DB rows while keeping newest visible tasks first.
 */
function mergeTaskHistory(indexedTasks: TaskHistoryItem[], chainTasks: TaskHistoryItem[]): TaskHistoryItem[] {
  const tasksById = new Map<string, TaskHistoryItem>();
  for (const task of [...chainTasks, ...indexedTasks]) {
    tasksById.set(task.id, task);
  }

  return [...tasksById.values()].sort((left, right) => timestampSortValue(right) - timestampSortValue(left));
}

/**
 * Converts unknown timestamps into stable sort values without throwing during partial indexing.
 */
function timestampSortValue(item: TaskHistoryItem): number {
  const timestamp = Date.parse(item.timestamp);
  return Number.isNaN(timestamp) ? 0 : timestamp;
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
