import type { Hex } from "@agentpassport/config";

export const INTENT_SUBMISSION_TTL_MS = 5 * 60 * 1000;

type IntentSubmissionRecord = {
  status: "pending" | "submitted";
  submittedExpiresAtMs?: number;
  txHash?: Hex;
};

export type IntentSubmissionReservation =
  | {
      status: "acquired";
      markBroadcast: (txHash: Hex) => void;
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
    markBroadcast: (txHash: Hex) => {
      record.txHash = txHash;
    },
    markSubmitted: (txHash: Hex, submittedAtMs = Date.now()) => {
      record.status = "submitted";
      record.txHash = txHash;
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
      record.status === "submitted" &&
      record.submittedExpiresAtMs !== undefined &&
      record.submittedExpiresAtMs < nowMs
    ) {
      inFlightSubmissions.delete(key);
    }
  }
}
