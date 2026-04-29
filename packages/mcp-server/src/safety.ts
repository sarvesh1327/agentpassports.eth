import type { Hex } from "@agentpassport/config";

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/u;

/**
 * AgentEnsExecutor checks ENS text records byte-for-byte. This helper keeps MCP
 * signing logic aligned with the contract so an AI agent never signs a task for
 * a passport whose live ENS status is missing, differently cased, or padded.
 */
export function assertExactActiveStatus(status: string): void {
  if (status !== "active") {
    throw new Error('agent.status must be exactly active before an AgentPassport task can be signed');
  }
}

/**
 * The policy digest in an intent must match the digest currently published in
 * ENS. A mismatch means the agent is looking at stale or tampered policy data.
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
