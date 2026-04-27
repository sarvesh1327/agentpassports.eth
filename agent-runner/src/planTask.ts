import type { Hex, TaskIntentMessage } from "../../packages/config/src/index.ts";
import { hashCallData, taskLogRecordTaskSelector } from "../../packages/config/src/index.ts";
import {
  assertUint256,
  assertUint64,
  bytesToHex,
  concatBytes,
  encodeUint256,
  hexToBytes,
  normalizeAddress,
  normalizeBytes32,
  utf8ToBytes
} from "../../packages/config/src/hex.ts";
import { keccak256Utf8 } from "../../packages/config/src/keccak.ts";

export type TaskPlanInput = {
  agentNode: Hex;
  expiresAt: bigint;
  metadataURI: string;
  nonce: bigint;
  ownerNode: Hex;
  taskDescription: string;
  taskLogAddress: Hex;
  valueWei?: bigint;
};

export type TaskPlan = {
  callData: Hex;
  intent: TaskIntentMessage;
  metadataURI: string;
  taskHash: Hex;
};

const ABI_WORD_BYTES = 32;
const RECORD_TASK_METADATA_OFFSET = 128n;

/**
 * Builds the deterministic TaskLog call and matching executor intent.
 *
 * Network reads stay outside this function, so tests and the CLI can share one
 * pure planning step after nonce and ENS data have already been gathered.
 */
export function buildTaskPlan(input: TaskPlanInput): TaskPlan {
  const agentNode = normalizeBytes32(input.agentNode);
  const ownerNode = normalizeBytes32(input.ownerNode);
  const taskLogAddress = normalizeAddress(input.taskLogAddress, "preserve");
  const value = assertUint256(input.valueWei ?? 0n);
  const nonce = assertUint256(input.nonce);
  const expiresAt = assertUint64(input.expiresAt);
  const metadataURI = normalizeMetadataURI(input.metadataURI);
  const taskHash = keccak256Utf8(input.taskDescription);
  const callData = encodeRecordTaskCallData(agentNode, ownerNode, taskHash, metadataURI);

  return {
    callData,
    intent: {
      agentNode,
      target: taskLogAddress,
      callDataHash: hashCallData(callData),
      value,
      nonce,
      expiresAt
    },
    metadataURI,
    taskHash
  };
}

function encodeRecordTaskCallData(agentNode: Hex, ownerNode: Hex, taskHash: Hex, metadataURI: string): Hex {
  return bytesToHex(
    concatBytes(
      hexToBytes(taskLogRecordTaskSelector()),
      hexToBytes(agentNode),
      hexToBytes(ownerNode),
      hexToBytes(normalizeBytes32(taskHash)),
      encodeUint256(RECORD_TASK_METADATA_OFFSET),
      encodeString(metadataURI)
    )
  );
}

function encodeString(value: string): Uint8Array {
  const bytes = utf8ToBytes(value);
  const paddedLength = Math.ceil(bytes.length / ABI_WORD_BYTES) * ABI_WORD_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  return concatBytes(encodeUint256(BigInt(bytes.length)), padded);
}

function normalizeMetadataURI(metadataURI: string): string {
  const value = metadataURI.trim();
  if (!value) {
    throw new Error("metadataURI is required");
  }
  return value;
}
