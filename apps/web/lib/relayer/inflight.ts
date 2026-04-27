import type { Hex } from "@agentpassport/config";

/**
 * Keeps a broadcast transaction hash retry-visible while receipt polling is inconclusive.
 */
export const BROADCAST_PENDING_TTL_MS = 30 * 60 * 1000;
export const INTENT_SUBMISSION_TTL_MS = 5 * 60 * 1000;

type IntentSubmissionRecord = {
  broadcastExpiresAtMs?: number;
  status: "pending" | "submitted";
  submittedExpiresAtMs?: number;
  txHash?: Hex;
};

export type IntentSubmissionReservation =
  | {
      status: "acquired";
      markBroadcast: (txHash: Hex, nowMs?: number) => void;
      markSubmitted: (txHash: Hex, nowMs?: number) => void;
      release: () => void;
    }
  | {
      status: "pending";
      txHash?: Hex;
    }
  | {
      status: "submitted";
      txHash: Hex;
    };

const inFlightSubmissions = new Map<string, IntentSubmissionRecord>();

/**
 * Reserves one executor nonce per agent node so duplicate requests do not broadcast duplicate transactions.
 */
export function reserveIntentSubmission(input: {
  agentNode: Hex;
  nonce: bigint;
  nowMs?: number;
}): IntentSubmissionReservation {
  const nowMs = input.nowMs ?? Date.now();
  const key = intentSubmissionKey(input.agentNode, input.nonce);
  pruneExpiredSubmissions(nowMs);

  const existing = inFlightSubmissions.get(key);
  if (existing?.status === "submitted" && existing.txHash) {
    return {
      status: "submitted",
      txHash: existing.txHash
    };
  }
  if (existing) {
    return existing.txHash ? { status: "pending", txHash: existing.txHash } : { status: "pending" };
  }

  const record: IntentSubmissionRecord = {
    status: "pending"
  };
  inFlightSubmissions.set(key, record);

  return {
    status: "acquired",
    markBroadcast: (txHash: Hex, broadcastAtMs = Date.now()) => {
      record.txHash = txHash;
      record.broadcastExpiresAtMs = broadcastAtMs + BROADCAST_PENDING_TTL_MS;
    },
    markSubmitted: (txHash: Hex, submittedAtMs = Date.now()) => {
      record.status = "submitted";
      record.txHash = txHash;
      record.broadcastExpiresAtMs = undefined;
      record.submittedExpiresAtMs = submittedAtMs + INTENT_SUBMISSION_TTL_MS;
    },
    release: () => {
      if (inFlightSubmissions.get(key) === record) {
        inFlightSubmissions.delete(key);
      }
    }
  };
}

/**
 * Marks a previously broadcast transaction as successfully included.
 */
export function markIntentSubmissionSubmitted(input: {
  agentNode: Hex;
  nonce: bigint;
  nowMs?: number;
  txHash: Hex;
}): void {
  const key = intentSubmissionKey(input.agentNode, input.nonce);
  const record = inFlightSubmissions.get(key) ?? { status: "pending" as const };
  record.status = "submitted";
  record.txHash = input.txHash;
  record.broadcastExpiresAtMs = undefined;
  record.submittedExpiresAtMs = (input.nowMs ?? Date.now()) + INTENT_SUBMISSION_TTL_MS;
  inFlightSubmissions.set(key, record);
}

/**
 * Releases a reservation when submission is known to have failed or reverted.
 */
export function releaseIntentSubmission(input: { agentNode: Hex; nonce: bigint }): void {
  inFlightSubmissions.delete(intentSubmissionKey(input.agentNode, input.nonce));
}

/**
 * Clears the process-local submission cache for deterministic tests.
 */
export function resetIntentSubmissionCache(): void {
  inFlightSubmissions.clear();
}

function intentSubmissionKey(agentNode: Hex, nonce: bigint): string {
  return `${agentNode.toLowerCase()}:${nonce.toString()}`;
}

function pruneExpiredSubmissions(nowMs: number): void {
  for (const [key, record] of inFlightSubmissions.entries()) {
    if (
      record.status === "pending" &&
      record.txHash &&
      record.broadcastExpiresAtMs !== undefined &&
      record.broadcastExpiresAtMs < nowMs
    ) {
      inFlightSubmissions.delete(key);
      continue;
    }
    if (
      record.status === "submitted" &&
      record.submittedExpiresAtMs !== undefined &&
      record.submittedExpiresAtMs < nowMs
    ) {
      inFlightSubmissions.delete(key);
    }
  }
}
