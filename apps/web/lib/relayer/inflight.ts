import type { Hex } from "@agentpassport/config";

export const INTENT_SUBMISSION_TTL_MS = 5 * 60 * 1000;

type IntentSubmissionRecord = {
  expiresAtMs: number;
  txHash?: Hex;
};

export type IntentSubmissionReservation =
  | {
      status: "acquired";
      markSubmitted: (txHash: Hex, nowMs?: number) => void;
      release: () => void;
    }
  | {
      status: "pending";
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
  if (existing?.txHash) {
    return {
      status: "submitted",
      txHash: existing.txHash
    };
  }
  if (existing) {
    return { status: "pending" };
  }

  const record: IntentSubmissionRecord = {
    expiresAtMs: nowMs + INTENT_SUBMISSION_TTL_MS
  };
  inFlightSubmissions.set(key, record);

  return {
    status: "acquired",
    markSubmitted: (txHash: Hex, submittedAtMs = Date.now()) => {
      record.txHash = txHash;
      record.expiresAtMs = submittedAtMs + INTENT_SUBMISSION_TTL_MS;
    },
    release: () => {
      if (inFlightSubmissions.get(key) === record) {
        inFlightSubmissions.delete(key);
      }
    }
  };
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
    if (record.expiresAtMs < nowMs) {
      inFlightSubmissions.delete(key);
    }
  }
}
