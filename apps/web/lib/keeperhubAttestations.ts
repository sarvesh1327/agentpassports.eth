export type KeeperHubDecision = "executed" | "blocked" | "failed" | "running" | "unknown";

export type KeeperHubAttestation = {
  amount: string | null;
  agentName: string | null;
  agentNode: string | null;
  blockedCode: string | null;
  completedAt: string | null;
  decision: KeeperHubDecision;
  durationMs: string | null;
  executionId: string;
  failedNodeId: string | null;
  failureReason: string | null;
  gasUsedUnits: string | null;
  lastSuccessfulNodeId: string | null;
  lastSuccessfulNodeName: string | null;
  metadataURI: string | null;
  policyDigest: string | null;
  recipient: string | null;
  requestedSelector: string | null;
  requestedTarget: string | null;
  stampReason: string | null;
  startedAt: string | null;
  status: string;
  taskDescription: string | null;
  tokenIn: string | null;
  tokenOut: string | null;
  trace: string[];
  txHash: string | null;
  workflowId: string | null;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<{
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
}>;

export type KeeperHubAttestationFilter = {
  agentName?: string | null;
  agentNode?: string | null;
  limit?: number | null;
};

export type FetchKeeperHubAttestationsInput = KeeperHubAttestationFilter & {
  apiBaseUrl: string;
  apiKey: string;
  fetcher?: FetchLike;
  workflowId: string;
};

const BLOCKED_STAMP_SCHEMA = "agentpassport.blockedStamp.v1";
const DEFAULT_LIMIT = 25;
const LONG_HEX_PATTERN = /0x[0-9a-fA-F]{96,}/gu;

/**
 * Loads sanitized KeeperHub executions for the Agent page. Raw KeeperHub inputs can
 * contain signature, functionArgs, and callData; only normalized public proof facts
 * leave this helper.
 */
export async function fetchKeeperHubAttestations(input: FetchKeeperHubAttestationsInput): Promise<KeeperHubAttestation[]> {
  const fetcher = input.fetcher ?? fetch;
  const endpoint = `${normalizeBaseUrl(input.apiBaseUrl)}/api/workflows/${encodeURIComponent(input.workflowId)}/executions`;
  const response = await fetcher(endpoint, {
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json"
    },
    method: "GET"
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`KeeperHub executions request failed with HTTP ${response.status}`);
  }

  return normalizeKeeperHubExecutionsResponse(body, input);
}

/** Normalizes any KeeperHub executions response shape into render-safe rows. */
export function normalizeKeeperHubExecutionsResponse(value: unknown, filter: KeeperHubAttestationFilter = {}): KeeperHubAttestation[] {
  const rows = readExecutionArray(value)
    .map((entry) => normalizeKeeperHubExecution(entry))
    .filter((entry): entry is KeeperHubAttestation => Boolean(entry))
    .filter((entry) => matchesAgentFilter(entry, filter))
    .sort((left, right) => timestampValue(right.startedAt ?? right.completedAt) - timestampValue(left.startedAt ?? left.completedAt));

  return rows.slice(0, normalizeLimit(filter.limit));
}

/** Converts one KeeperHub execution into a public attestation display model. */
export function normalizeKeeperHubExecution(value: unknown): KeeperHubAttestation | null {
  const record = asRecord(value);
  if (!record) return null;
  const input = asRecord(record.input) ?? {};
  const output = asRecord(record.output) ?? {};
  const stamp = readBlockedStamp(output.result);
  const trace = readStringArray(record.executionTrace);
  const status = readString(record.status) ?? "unknown";
  const txHash = readTxHash(output.transactionHash) ?? readTxHash(asRecord(output.result)?.transactionHash) ?? null;
  const decision = decideExecution({ stamp, status, txHash });
  const failureReason = decision === "failed" ? sanitizeFailureReason(record.error ?? asRecord(record.errorContext)?.error) : null;
  const failedNodeId = stamp?.failedNodeId ?? readFailedNodeId(record, trace, decision);

  return {
    amount: readString(input.amount),
    agentName: readString(input.agentName)?.toLowerCase() ?? null,
    agentNode: readString(input.agentNode)?.toLowerCase() ?? null,
    blockedCode: stamp?.blockedCode ?? null,
    completedAt: readString(record.completedAt),
    decision,
    durationMs: readString(record.duration),
    executionId: readString(record.id) ?? readString(record.executionId) ?? "unknown-execution",
    failedNodeId,
    failureReason,
    gasUsedUnits: readString(output.gasUsedUnits),
    lastSuccessfulNodeId: readString(record.lastSuccessfulNodeId),
    lastSuccessfulNodeName: readString(record.lastSuccessfulNodeName),
    metadataURI: readString(input.metadataURI),
    policyDigest: readString(input.policyDigest)?.toLowerCase() ?? null,
    recipient: readString(input.recipient)?.toLowerCase() ?? null,
    requestedSelector: readString(input.requestedSelector)?.toLowerCase() ?? null,
    requestedTarget: readString(input.requestedTarget)?.toLowerCase() ?? null,
    stampReason: stamp?.reason ?? null,
    startedAt: readString(record.startedAt),
    status,
    taskDescription: readString(input.taskDescription),
    tokenIn: readString(input.tokenIn),
    tokenOut: readString(input.tokenOut),
    trace,
    txHash,
    workflowId: readString(record.workflowId)
  };
}

/** Browser helper for the Agent page API route. */
export async function loadKeeperHubAttestations(input: {
  agentName: string;
  agentNode: string;
  fetcher?: (input: string) => Promise<{ json(): Promise<unknown>; ok: boolean }>;
  limit?: number;
}): Promise<KeeperHubAttestation[]> {
  const fetcher = input.fetcher ?? fetch;
  const params = new URLSearchParams({
    agentName: input.agentName,
    agentNode: input.agentNode
  });
  if (input.limit) params.set("limit", String(input.limit));
  const response = await fetcher(`/api/keeperhub/attestations?${params.toString()}`);
  if (!response.ok) {
    throw new Error("KeeperHub attestation request failed");
  }
  const body = await response.json() as { attestations?: KeeperHubAttestation[] };
  return Array.isArray(body.attestations) ? body.attestations : [];
}

function readExecutionArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  if (Array.isArray(record.executions)) return record.executions;
  if (Array.isArray(record.data)) return record.data;
  return [];
}

function matchesAgentFilter(entry: KeeperHubAttestation, filter: KeeperHubAttestationFilter): boolean {
  const agentName = filter.agentName?.trim().toLowerCase();
  const agentNode = filter.agentNode?.trim().toLowerCase();
  if (agentNode && entry.agentNode === agentNode) return true;
  if (agentName && entry.agentName === agentName) return true;
  return !agentName && !agentNode;
}

function normalizeLimit(value: number | null | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(value), 100));
}

function decideExecution(input: { stamp: BlockedStamp | null; status: string; txHash: string | null }): KeeperHubDecision {
  if (input.stamp) return "blocked";
  const status = input.status.toLowerCase();
  if (status === "success" && input.txHash) return "executed";
  if (["error", "failed", "failure"].includes(status)) return "failed";
  if (["running", "queued", "pending", "in_progress", "processing"].includes(status)) return "running";
  return status === "success" ? "unknown" : "failed";
}

type BlockedStamp = {
  blockedCode: string | null;
  failedNodeId: string | null;
  reason: string | null;
};

function readBlockedStamp(value: unknown): BlockedStamp | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.schema !== BLOCKED_STAMP_SCHEMA && record.decision !== "blocked" && !record.blockedCode) {
    return null;
  }
  return {
    blockedCode: readString(record.blockedCode),
    failedNodeId: readString(record.failedNodeId),
    reason: readString(record.reason)
  };
}

function readFailedNodeId(record: Record<string, unknown>, trace: string[], decision: KeeperHubDecision): string | null {
  const errorContext = asRecord(record.errorContext);
  const explicit = readString(errorContext?.failedNodeId) ?? readErroredNodeStatus(record);
  if (explicit) return explicit;
  if (decision === "failed" && trace.length > 0) return trace[trace.length - 1] ?? null;
  return null;
}

function readErroredNodeStatus(record: Record<string, unknown>): string | null {
  const statuses = Array.isArray(record.nodeStatuses) ? record.nodeStatuses : [];
  for (const status of statuses) {
    const row = asRecord(status);
    if (row && readString(row.status)?.toLowerCase() === "error") {
      return readString(row.nodeId);
    }
  }
  return null;
}

function sanitizeFailureReason(value: unknown): string | null {
  const raw = typeof value === "string" ? value : value === null || value === undefined ? "" : JSON.stringify(value);
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(LONG_HEX_PATTERN, (match) => `[hex-redacted:${match.length}]`)
    .replace(/\s+/gu, " ")
    .slice(0, 320);
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  return null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => readString(item)).filter((item): item is string => Boolean(item)) : [];
}

function readTxHash(value: unknown): string | null {
  const text = readString(value);
  return text && /^0x[0-9a-fA-F]{64}$/u.test(text) ? text.toLowerCase() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function timestampValue(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).toString().replace(/\/$/u, "");
}
