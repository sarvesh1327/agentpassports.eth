import type { Hex } from "./types.ts";
import { ZERO_BYTES32, concatBytes, hexToBytes, normalizeBytes32, utf8ToBytes } from "./hex.ts";
import { keccak256Hex } from "./keccak.ts";

/**
 * Computes the ENS namehash for a root or dot-separated ENS name.
 *
 * The executor derives agent subnodes with Solidity's namehash algorithm, so
 * this helper keeps frontend and runner code byte-for-byte aligned with that
 * onchain calculation.
 */
export function namehashEnsName(name: string): Hex {
  const normalizedName = normalizeEnsName(name);
  if (normalizedName === "") {
    return ZERO_BYTES32;
  }

  let node = ZERO_BYTES32;
  const labels = normalizedName.split(".");
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const labelHash = keccak256Hex(utf8ToBytes(labels[index]));
    node = keccak256Hex(concatBytes(hexToBytes(node), hexToBytes(labelHash))) as Hex;
  }
  return node;
}

/**
 * Computes the ENS subnode hash used by AgentPolicyExecutor.setPolicy().
 */
export function computeSubnode(parentNode: Hex, label: string): Hex {
  const normalizedParentNode = normalizeBytes32(parentNode);
  const normalizedLabel = normalizeEnsLabel(label);
  const labelHash = keccak256Hex(utf8ToBytes(normalizedLabel));
  return keccak256Hex(concatBytes(hexToBytes(normalizedParentNode), hexToBytes(labelHash)));
}

function normalizeEnsName(name: string): string {
  if (name === "") {
    return "";
  }
  const normalizedName = name.trim().toLowerCase();
  const labels = normalizedName.split(".");
  if (normalizedName !== name.toLowerCase() || labels.some((label) => label.length === 0)) {
    throw new Error("Invalid ENS name");
  }
  for (const label of labels) {
    normalizeEnsLabel(label);
  }
  return normalizedName;
}

function normalizeEnsLabel(label: string): string {
  const normalizedLabel = label.trim();
  if (normalizedLabel.length === 0 || normalizedLabel.includes(".") || normalizedLabel !== label || normalizedLabel !== label.toLowerCase()) {
    throw new Error("Invalid ENS label");
  }
  if (normalizedLabel !== normalizedLabel.normalize("NFC") || /[\u0000-\u0020\u007f]/u.test(normalizedLabel)) {
    throw new Error("Invalid ENS label");
  }
  if (normalizedLabel.startsWith("-") || normalizedLabel.endsWith("-")) {
    throw new Error("Invalid ENS label");
  }
  return normalizedLabel;
}
