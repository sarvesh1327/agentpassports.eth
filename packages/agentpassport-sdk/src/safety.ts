import type { Hex } from "@agentpassport/config";

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/u;

/**
 * AgentPassports v1 treats ENS as the source of truth. The on-chain executor
 * compares `agent.status` byte-for-byte, so SDK consumers must not silently
 * accept casing, whitespace, or aliases such as `enabled`.
 */
export function assertExactActiveStatus(status: string): void {
  if (status !== "active") {
    throw new Error("agent.status must be exactly active before an AgentPassport task can be signed");
  }
}

/**
 * Verifies that a locally constructed policy snapshot still matches the live ENS
 * digest. This is intentionally strict because a mismatch means stale data,
 * tampering, or a race with an owner policy update.
 */
export function assertPolicyDigestMatches(computedDigest: Hex, liveEnsDigest: Hex): void {
  const computed = normalizeBytes32Text(computedDigest, "computed policy digest");
  const live = normalizeBytes32Text(liveEnsDigest, "live ENS policy digest");
  if (computed !== live) {
    throw new Error("Computed policy snapshot does not match live ENS policy digest");
  }
}

function normalizeBytes32Text(value: Hex, label: string): string {
  if (!BYTES32_PATTERN.test(value)) {
    throw new Error(`${label} must be a 0x-prefixed bytes32 value`);
  }
  return value.toLowerCase();
}
