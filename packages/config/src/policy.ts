import type { Hex, PolicyMetadata, PolicyMetadataInput } from "./types";
import { normalizeAddress, normalizeBytes32, normalizeSelector } from "./hex";
import { keccak256Utf8 } from "./keccak";

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
