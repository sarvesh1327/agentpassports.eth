import type { Hex, TaskIntentMessage, TaskIntentTypedData } from "./types.ts";
import {
  assertUint256,
  assertUint64,
  concatBytes,
  encodeAddress,
  encodeUint256,
  encodeUint64,
  hexToBytes,
  normalizeAddress,
  normalizeBytes32,
  assertHex
} from "./hex.ts";
import { keccak256Hex, keccak256Utf8 } from "./keccak.ts";

const TASK_LOG_RECORD_TASK_SIGNATURE = "recordTask(bytes32,bytes32,bytes32,string)";
const TASK_INTENT_TYPE =
  "TaskIntent(bytes32 agentNode,bytes32 policyDigest,address target,bytes32 callDataHash,uint256 value,uint256 nonce,uint64 expiresAt)";
const EIP_712_DOMAIN_TYPE =
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";

const TASK_INTENT_TYPES = [
  { name: "agentNode", type: "bytes32" },
  { name: "policyDigest", type: "bytes32" },
  { name: "target", type: "address" },
  { name: "callDataHash", type: "bytes32" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "expiresAt", type: "uint64" }
] as const;

export const POLICY_SNAPSHOT_TEXT_KEYS = [
  "agent.status",
  "agent.policy.digest",
  "agent.policy.target",
  "agent.policy.selector",
  "agent.policy.maxValueWei",
  "agent.policy.maxGasReimbursementWei",
  "agent.policy.expiresAt"
] as const;

/**
 * Returns the TaskLog.recordTask selector allowed by the MVP policy.
 */
export function taskLogRecordTaskSelector(): Hex {
  return selectorForSignature(TASK_LOG_RECORD_TASK_SIGNATURE);
}

/**
 * Hashes calldata exactly as AgentPolicyExecutor compares intent.callDataHash.
 */
export function hashCallData(callData: Hex): Hex {
  return keccak256Hex(hexToBytes(assertHex(callData)));
}

/**
 * Builds viem-compatible EIP-712 data for AgentEnsExecutor.TaskIntent.
 */
export function buildTaskIntentTypedData(
  intent: TaskIntentMessage,
  chainId: bigint,
  executorAddress: Hex
): TaskIntentTypedData {
  const message = normalizeTaskIntent(intent);
  return {
    domain: {
      name: "AgentEnsExecutor",
      version: "1",
      chainId,
      verifyingContract: normalizeAddress(executorAddress, "preserve")
    },
    primaryType: "TaskIntent",
    types: {
      TaskIntent: TASK_INTENT_TYPES
    },
    message
  };
}

/**
 * Hashes a TaskIntent struct using the same field order and ABI widths as Solidity.
 */
export function hashTaskIntentStruct(intent: TaskIntentMessage): Hex {
  const normalizedIntent = normalizeTaskIntent(intent);
  return keccak256Hex(
    concatBytes(
      hexToBytes(keccak256Utf8(TASK_INTENT_TYPE)),
      hexToBytes(normalizedIntent.agentNode),
      hexToBytes(normalizedIntent.policyDigest),
      encodeAddress(normalizedIntent.target),
      hexToBytes(normalizedIntent.callDataHash),
      encodeUint256(normalizedIntent.value),
      encodeUint256(normalizedIntent.nonce),
      encodeUint64(normalizedIntent.expiresAt)
    )
  );
}

/**
 * Hashes TaskIntent as an EIP-712 digest accepted by AgentEnsExecutor.
 */
export function hashTaskIntent(intent: TaskIntentMessage, chainId: bigint, executorAddress: Hex): Hex {
  const domainSeparator = hashTaskIntentDomain(chainId, executorAddress);
  const structHash = hashTaskIntentStruct(intent);
  return keccak256Hex(concatBytes(new Uint8Array([0x19, 0x01]), hexToBytes(domainSeparator), hexToBytes(structHash)));
}

function hashTaskIntentDomain(chainId: bigint, executorAddress: Hex): Hex {
  return keccak256Hex(
    concatBytes(
      hexToBytes(keccak256Utf8(EIP_712_DOMAIN_TYPE)),
      hexToBytes(keccak256Utf8("AgentEnsExecutor")),
      hexToBytes(keccak256Utf8("1")),
      encodeUint256(chainId),
      encodeAddress(executorAddress)
    )
  );
}

function selectorForSignature(signature: string): Hex {
  return `0x${keccak256Utf8(signature).slice(2, 10)}`;
}

function normalizeTaskIntent(intent: TaskIntentMessage): TaskIntentMessage {
  return {
    agentNode: normalizeBytes32(intent.agentNode),
    policyDigest: normalizeBytes32(intent.policyDigest),
    target: normalizeAddress(intent.target, "preserve"),
    callDataHash: normalizeBytes32(intent.callDataHash),
    value: assertUint256(intent.value),
    nonce: assertUint256(intent.nonce),
    expiresAt: assertUint64(intent.expiresAt)
  };
}
