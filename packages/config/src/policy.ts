import type { Hex, PolicyMetadata, PolicyMetadataInput, PolicySnapshot } from "./types.ts";
import {
  assertUint64,
  assertUint256,
  concatBytes,
  encodeAddress,
  encodeBytes4,
  encodeUint256,
  encodeUint64,
  hexToBytes,
  normalizeAddress,
  normalizeBytes32,
  normalizeSelector
} from "./hex.ts";
import { keccak256Hex, keccak256Utf8 } from "./keccak.ts";

const POLICY_SNAPSHOT_TYPE =
  "PolicySnapshot(bytes32 agentNode,address target,bytes4 selector,uint96 maxValueWei,uint96 maxGasReimbursementWei,uint64 expiresAt,bool enabled)";

/**
 * Builds deterministic policy metadata suitable for ENS text records or IPFS JSON.
 */
export function buildPolicyMetadata(input: PolicyMetadataInput): PolicyMetadata {
  return {
    agentNode: normalizeBytes32(input.agentNode),
    expiresAt: input.expiresAt.toString(),
    maxGasReimbursementWei: input.maxGasReimbursementWei.toString(),
    maxValueWei: input.maxValueWei.toString(),
    ownerNode: normalizeBytes32(input.ownerNode),
    selector: normalizeSelector(input.selector),
    target: normalizeAddress(input.target, "lower")
  };
}

/**
 * Hashes canonical policy metadata for publishing as agent.policy.hash.
 */
export function hashPolicyMetadata(metadata: PolicyMetadata): Hex {
  const canonicalMetadata: PolicyMetadata = {
    agentNode: normalizeBytes32(metadata.agentNode),
    expiresAt: metadata.expiresAt,
    maxGasReimbursementWei: metadata.maxGasReimbursementWei,
    maxValueWei: metadata.maxValueWei,
    ownerNode: normalizeBytes32(metadata.ownerNode),
    selector: normalizeSelector(metadata.selector),
    target: normalizeAddress(metadata.target, "lower")
  };
  return keccak256Utf8(JSON.stringify(canonicalMetadata));
}

/**
 * Normalizes a policy snapshot into the exact fields AgentEnsExecutor hashes.
 */
export function normalizePolicySnapshot(policy: PolicySnapshot): PolicySnapshot {
  return {
    enabled: Boolean(policy.enabled),
    expiresAt: assertUint64(policy.expiresAt),
    maxGasReimbursementWei: assertUint96(policy.maxGasReimbursementWei, "maxGasReimbursementWei"),
    maxValueWei: assertUint96(policy.maxValueWei, "maxValueWei"),
    selector: normalizeSelector(policy.selector),
    target: normalizeAddress(policy.target, "preserve")
  };
}

/**
 * Hashes the policy snapshot digest published in the agent.policy.digest ENS text record.
 */
export function hashPolicySnapshot(agentNode: Hex, policy: PolicySnapshot): Hex {
  const normalizedPolicy = normalizePolicySnapshot(policy);
  return keccak256Hex(
    concatBytes(
      hexToBytes(keccak256Utf8(POLICY_SNAPSHOT_TYPE)),
      hexToBytes(normalizeBytes32(agentNode)),
      encodeAddress(normalizedPolicy.target),
      encodeBytes4(normalizedPolicy.selector),
      encodeUint256(normalizedPolicy.maxValueWei),
      encodeUint256(normalizedPolicy.maxGasReimbursementWei),
      encodeUint64(normalizedPolicy.expiresAt),
      encodeUint256(normalizedPolicy.enabled ? 1n : 0n)
    )
  );
}

/**
 * Reads the V1 executable policy snapshot from ENS text records and checks its digest.
 */
export function policySnapshotFromTextRecords(agentNode: Hex, records: Record<string, string>): PolicySnapshot {
  const status = records["agent.status"] ?? "";
  if (status !== "active") {
    throw new Error('agent.status must be exactly "active"');
  }

  const policySnapshot = normalizePolicySnapshot({
    enabled: true,
    expiresAt: readUnsignedText(records, "agent.policy.expiresAt"),
    maxGasReimbursementWei: readUnsignedText(records, "agent.policy.maxGasReimbursementWei"),
    maxValueWei: readUnsignedText(records, "agent.policy.maxValueWei"),
    selector: readRequiredText(records, "agent.policy.selector") as Hex,
    target: readRequiredText(records, "agent.policy.target") as Hex
  });
  const expectedDigest = normalizeBytes32(readRequiredText(records, "agent.policy.digest") as Hex);
  const actualDigest = hashPolicySnapshot(agentNode, policySnapshot);
  if (actualDigest !== expectedDigest) {
    throw new Error("agent.policy.digest does not match agent policy text records");
  }

  return policySnapshot;
}

function assertUint96(value: bigint, label: string): bigint {
  const normalized = assertUint256(value);
  if (normalized >= 1n << 96n) {
    throw new Error(`${label} is outside uint96 range`);
  }
  return normalized;
}

function readRequiredText(records: Record<string, string>, key: string): string {
  const value = records[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function readUnsignedText(records: Record<string, string>, key: string): bigint {
  const value = readRequiredText(records, key);
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return BigInt(value);
}
