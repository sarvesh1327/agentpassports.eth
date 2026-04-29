import type { Hex, PolicyMetadata, PolicyMetadataInput, PolicySnapshot, SwapPolicy, SwapPolicyMetadata } from "./types.ts";
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
const MAX_SLIPPAGE_BPS = 10_000n;

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

/**
 * Normalizes V2 Uniswap swap policy fields used by owner UI, MCP, and relayer preflight.
 */
export function normalizeSwapPolicy(policy: SwapPolicy): SwapPolicy {
  const maxSlippageBps = assertUint256(policy.maxSlippageBps);
  if (maxSlippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error("maxSlippageBps must be <= 10000");
  }

  return {
    allowedChainId: assertUint256(policy.allowedChainId),
    allowedTokensIn: normalizeAddressList(policy.allowedTokensIn),
    allowedTokensOut: normalizeAddressList(policy.allowedTokensOut),
    deadlineSeconds: assertUint64(policy.deadlineSeconds),
    enabled: Boolean(policy.enabled),
    maxAmountInWei: assertUint256(policy.maxAmountInWei),
    maxSlippageBps,
    recipient: normalizeAddress(policy.recipient, "lower"),
    router: normalizeAddress(policy.router, "lower"),
    selector: normalizeSelector(policy.selector)
  };
}

/**
 * Builds canonical V2 swap policy metadata for ENS/IPFS publication.
 */
export function buildSwapPolicyMetadata(policy: SwapPolicy): SwapPolicyMetadata {
  const normalized = normalizeSwapPolicy(policy);
  return {
    allowedChainId: normalized.allowedChainId.toString(),
    allowedTokensIn: normalized.allowedTokensIn,
    allowedTokensOut: normalized.allowedTokensOut,
    deadlineSeconds: normalized.deadlineSeconds.toString(),
    enabled: normalized.enabled,
    maxAmountInWei: normalized.maxAmountInWei.toString(),
    maxSlippageBps: normalized.maxSlippageBps.toString(),
    recipient: normalized.recipient,
    router: normalized.router,
    schema: "agentpassport.swapPolicy.v2",
    selector: normalized.selector
  };
}

/**
 * Converts V2 swap constraints into the executor snapshot that authorizes router calls.
 */
export function swapPolicyToExecutableSnapshot(input: {
  expiresAt: bigint;
  maxGasReimbursementWei: bigint;
  maxValueWei?: bigint;
  swapPolicy: SwapPolicy;
}): PolicySnapshot {
  const swapPolicy = normalizeSwapPolicy(input.swapPolicy);
  return normalizePolicySnapshot({
    enabled: swapPolicy.enabled,
    expiresAt: input.expiresAt,
    maxGasReimbursementWei: input.maxGasReimbursementWei,
    maxValueWei: input.maxValueWei ?? 0n,
    selector: swapPolicy.selector,
    target: swapPolicy.router
  });
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

function normalizeAddressList(values: readonly Hex[]): readonly Hex[] {
  const seen = new Set<string>();
  const normalized: Hex[] = [];
  for (const value of values) {
    const address = normalizeAddress(value, "lower");
    if (!seen.has(address)) {
      seen.add(address);
      normalized.push(address);
    }
  }
  if (normalized.length === 0) {
    throw new Error("Expected at least one allowed token");
  }
  return normalized;
}
