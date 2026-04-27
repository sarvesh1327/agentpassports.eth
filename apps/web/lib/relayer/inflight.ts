import type { Hex } from "@agentpassport/config";
import type { RelayerReservationStoreConfig } from "./config";

/**
 * Keeps a broadcast transaction hash retry-visible while receipt polling is inconclusive.
 */
export const BROADCAST_PENDING_TTL_MS = 30 * 60 * 1000;
export const INTENT_SUBMISSION_TTL_MS = 5 * 60 * 1000;

const ACQUIRED_PENDING_TTL_MS = 30 * 60 * 1000;
const REDIS_REST_AUTH_HEADER_PREFIX = "Bearer ";

type IntentSubmissionRecord = {
  broadcastExpiresAtMs?: number;
  status: "pending" | "submitted";
  submittedExpiresAtMs?: number;
  txHash?: Hex;
};

type IntentSubmissionStoreReservation =
  | {
      status: "acquired";
    }
  | {
      status: "pending";
      txHash?: Hex;
    }
  | {
      status: "submitted";
      txHash: Hex;
    };

export type IntentSubmissionReservation =
  | {
      status: "acquired";
      markBroadcast: (txHash: Hex, nowMs?: number) => Promise<void>;
      markSubmitted: (txHash: Hex, nowMs?: number) => Promise<void>;
      release: () => Promise<void>;
    }
  | {
      status: "pending";
      txHash?: Hex;
    }
  | {
      status: "submitted";
      txHash: Hex;
    };

export type IntentSubmissionStore = {
  markBroadcast: (key: string, txHash: Hex, nowMs: number) => Promise<void>;
  markSubmitted: (key: string, txHash: Hex, nowMs: number) => Promise<void>;
  release: (key: string) => Promise<void>;
  reserve: (key: string, nowMs: number) => Promise<IntentSubmissionStoreReservation>;
  reset?: () => void;
};

type RedisRestCommand = Array<string | number>;
type RedisRestResponse = {
  error?: string;
  result?: unknown;
};

type RedisRestStoreInput = {
  fetch?: typeof fetch;
  token: string;
  url: string;
};

const processIntentSubmissionStore = createMemoryIntentSubmissionStore();

/**
 * Creates the nonce reservation backend requested by relayer configuration.
 */
export function createIntentSubmissionStore(config: RelayerReservationStoreConfig): IntentSubmissionStore {
  if (config.kind === "redisRest") {
    return createRedisRestIntentSubmissionStore(config);
  }
  return processIntentSubmissionStore;
}

/**
 * Creates a Redis REST backed store so scaled relayer workers share one nonce lock.
 */
export function createRedisRestIntentSubmissionStore(input: RedisRestStoreInput): IntentSubmissionStore {
  const fetchCommand = input.fetch ?? fetch;

  async function command(args: RedisRestCommand): Promise<unknown> {
    const response = await fetchCommand(input.url, {
      body: JSON.stringify(args),
      headers: {
        authorization: `${REDIS_REST_AUTH_HEADER_PREFIX}${input.token}`,
        "content-type": "application/json"
      },
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`Reservation store command failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as RedisRestResponse;
    if (body.error) {
      throw new Error(`Reservation store command failed: ${body.error}`);
    }
    return body.result ?? null;
  }

  async function readRecord(key: string): Promise<IntentSubmissionStoreReservation | undefined> {
    const result = await command(["GET", key]);
    if (result === null) {
      return undefined;
    }
    return reservationFromRecord(parseRecord(result));
  }

  return {
    markBroadcast: async (key, txHash) => {
      await command(["SET", key, serializeRecord({ status: "pending", txHash }), "PX", BROADCAST_PENDING_TTL_MS]);
    },
    markSubmitted: async (key, txHash) => {
      await command(["SET", key, serializeRecord({ status: "submitted", txHash }), "PX", INTENT_SUBMISSION_TTL_MS]);
    },
    release: async (key) => {
      await command(["DEL", key]);
    },
    reserve: async (key) => {
      const result = await command([
        "SET",
        key,
        serializeRecord({ status: "pending" }),
        "NX",
        "PX",
        ACQUIRED_PENDING_TTL_MS
      ]);
      if (result === "OK") {
        return { status: "acquired" };
      }

      const existing = await readRecord(key);
      if (existing) {
        return existing;
      }

      const retry = await command([
        "SET",
        key,
        serializeRecord({ status: "pending" }),
        "NX",
        "PX",
        ACQUIRED_PENDING_TTL_MS
      ]);
      return retry === "OK" ? { status: "acquired" } : { status: "pending" };
    }
  };
}

/**
 * Creates a process-local store used for local development and deterministic tests.
 */
export function createMemoryIntentSubmissionStore(): IntentSubmissionStore {
  const inFlightSubmissions = new Map<string, IntentSubmissionRecord>();

  return {
    markBroadcast: async (key, txHash, broadcastAtMs) => {
      const record = inFlightSubmissions.get(key) ?? { status: "pending" };
      record.status = "pending";
      record.txHash = txHash;
      record.broadcastExpiresAtMs = broadcastAtMs + BROADCAST_PENDING_TTL_MS;
      record.submittedExpiresAtMs = undefined;
      inFlightSubmissions.set(key, record);
    },
    markSubmitted: async (key, txHash, submittedAtMs) => {
      const record = inFlightSubmissions.get(key) ?? { status: "pending" };
      record.status = "submitted";
      record.txHash = txHash;
      record.broadcastExpiresAtMs = undefined;
      record.submittedExpiresAtMs = submittedAtMs + INTENT_SUBMISSION_TTL_MS;
      inFlightSubmissions.set(key, record);
    },
    release: async (key) => {
      inFlightSubmissions.delete(key);
    },
    reserve: async (key, nowMs) => {
      pruneExpiredSubmissions(inFlightSubmissions, nowMs);

      const existing = inFlightSubmissions.get(key);
      if (existing) {
        return reservationFromRecord(existing);
      }

      inFlightSubmissions.set(key, { status: "pending" });
      return { status: "acquired" };
    },
    reset: () => {
      inFlightSubmissions.clear();
    }
  };
}

/**
 * Reserves one executor nonce per agent node so duplicate requests do not broadcast duplicate transactions.
 */
export async function reserveIntentSubmission(input: {
  agentNode: Hex;
  nonce: bigint;
  nowMs?: number;
  store?: IntentSubmissionStore;
}): Promise<IntentSubmissionReservation> {
  const nowMs = input.nowMs ?? Date.now();
  const key = intentSubmissionKey(input.agentNode, input.nonce);
  const store = input.store ?? processIntentSubmissionStore;
  const reservation = await store.reserve(key, nowMs);

  if (reservation.status !== "acquired") {
    return reservation;
  }
  return {
    status: "acquired",
    markBroadcast: (txHash: Hex, broadcastAtMs = Date.now()) => store.markBroadcast(key, txHash, broadcastAtMs),
    markSubmitted: (txHash: Hex, submittedAtMs = Date.now()) => store.markSubmitted(key, txHash, submittedAtMs),
    release: () => store.release(key)
  };
}

/**
 * Marks a previously broadcast transaction as successfully included.
 */
export async function markIntentSubmissionSubmitted(input: {
  agentNode: Hex;
  nonce: bigint;
  nowMs?: number;
  store?: IntentSubmissionStore;
  txHash: Hex;
}): Promise<void> {
  const key = intentSubmissionKey(input.agentNode, input.nonce);
  await (input.store ?? processIntentSubmissionStore).markSubmitted(key, input.txHash, input.nowMs ?? Date.now());
}

/**
 * Releases a reservation when submission is known to have failed or reverted.
 */
export async function releaseIntentSubmission(input: {
  agentNode: Hex;
  nonce: bigint;
  store?: IntentSubmissionStore;
}): Promise<void> {
  await (input.store ?? processIntentSubmissionStore).release(intentSubmissionKey(input.agentNode, input.nonce));
}

/**
 * Clears the process-local submission cache for deterministic tests.
 */
export function resetIntentSubmissionCache(): void {
  processIntentSubmissionStore.reset?.();
}

function intentSubmissionKey(agentNode: Hex, nonce: bigint): string {
  return `relayer:intent:${agentNode.toLowerCase()}:${nonce.toString()}`;
}

function reservationFromRecord(record: IntentSubmissionRecord): IntentSubmissionStoreReservation {
  if (record.status === "submitted" && record.txHash) {
    return {
      status: "submitted",
      txHash: record.txHash
    };
  }
  return record.txHash ? { status: "pending", txHash: record.txHash } : { status: "pending" };
}

function parseRecord(value: unknown): IntentSubmissionRecord {
  if (typeof value !== "string") {
    throw new Error("Reservation store returned a non-string record");
  }
  const parsed = JSON.parse(value) as Partial<IntentSubmissionRecord>;
  if (parsed.status !== "pending" && parsed.status !== "submitted") {
    throw new Error("Reservation store returned an invalid status");
  }
  return {
    status: parsed.status,
    txHash: typeof parsed.txHash === "string" ? (parsed.txHash as Hex) : undefined
  };
}

function pruneExpiredSubmissions(records: Map<string, IntentSubmissionRecord>, nowMs: number): void {
  for (const [key, record] of records.entries()) {
    if (
      record.status === "pending" &&
      record.txHash &&
      record.broadcastExpiresAtMs !== undefined &&
      record.broadcastExpiresAtMs < nowMs
    ) {
      records.delete(key);
      continue;
    }
    if (
      record.status === "submitted" &&
      record.submittedExpiresAtMs !== undefined &&
      record.submittedExpiresAtMs < nowMs
    ) {
      records.delete(key);
    }
  }
}

function serializeRecord(record: IntentSubmissionRecord): string {
  return JSON.stringify(record);
}
