import { normalizePolicySnapshot, type Hex, type PolicySnapshot, type TaskIntentMessage } from "@agentpassport/config";

export type SerializedTaskIntent = Record<"agentNode" | "policyDigest" | "target" | "callDataHash" | "value" | "nonce" | "expiresAt", string>;

export type SerializedPolicySnapshot = {
  enabled: boolean;
  expiresAt: string;
  maxGasReimbursementWei: string;
  maxValueWei: string;
  selector: Hex;
  target: Hex;
};

/**
 * Converts bigint-heavy task intents into the JSON-safe shape used by MCP,
 * browser storage, and relayer payloads. Keep this canonical so signatures and
 * audit logs render the same values everywhere.
 */
export function serializeTaskIntent(intent: TaskIntentMessage): SerializedTaskIntent {
  return {
    agentNode: intent.agentNode,
    policyDigest: intent.policyDigest,
    target: intent.target,
    callDataHash: intent.callDataHash,
    value: intent.value.toString(),
    nonce: intent.nonce.toString(),
    expiresAt: intent.expiresAt.toString()
  };
}

/** Rehydrates the JSON transport shape back into the bigint-rich intent type. */
export function parseTaskIntent(intent: SerializedTaskIntent): TaskIntentMessage {
  return {
    agentNode: intent.agentNode as Hex,
    policyDigest: intent.policyDigest as Hex,
    target: intent.target as Hex,
    callDataHash: intent.callDataHash as Hex,
    value: BigInt(intent.value),
    nonce: BigInt(intent.nonce),
    expiresAt: BigInt(intent.expiresAt)
  };
}

/** Serializes policy snapshots for deterministic JSON responses and requests. */
export function serializePolicySnapshot(policy: PolicySnapshot): SerializedPolicySnapshot {
  const normalized = normalizePolicySnapshot(policy);
  return {
    target: normalized.target,
    selector: normalized.selector,
    maxValueWei: normalized.maxValueWei.toString(),
    maxGasReimbursementWei: normalized.maxGasReimbursementWei.toString(),
    expiresAt: normalized.expiresAt.toString(),
    enabled: normalized.enabled
  };
}
