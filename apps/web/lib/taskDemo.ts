import {
  buildTaskIntentTypedData,
  hashCallData,
  hashTaskIntent,
  namehashEnsName,
  recoverSignerAddress,
  type Hex,
  type TaskIntentMessage,
  type TaskIntentTypedData
} from "@agentpassport/config";
import { encodeFunctionData, keccak256, toHex } from "viem";
import { TASK_LOG_ABI } from "./contracts.ts";

export const LAST_SIGNED_TASK_STORAGE_KEY = "agentpassport:lastSignedTask";

export type TaskRunDraftInput = {
  agentName: string;
  chainId: bigint;
  executorAddress: Hex;
  expiresAt: bigint;
  metadataURI: string;
  nonce: bigint;
  ownerName: string;
  taskDescription: string;
  taskLogAddress: Hex;
  valueWei?: bigint;
};

export type FreshTaskRunDraftInput = Omit<TaskRunDraftInput, "expiresAt"> & {
  nowSeconds: bigint;
  ttlSeconds: bigint;
};

export type TaskRunDraft = {
  agentNode: Hex;
  callData: Hex;
  digest: Hex;
  intent: TaskIntentMessage;
  ownerNode: Hex;
  taskHash: Hex;
  typedData: TaskIntentTypedData;
};

export type RelayerExecutePayload = {
  callData: Hex;
  intent: TaskIntentMessage;
  signature: Hex;
};

export type SerializableRelayerExecutePayload = {
  callData: Hex;
  intent: Record<"agentNode" | "target" | "callDataHash" | "value" | "nonce" | "expiresAt", string>;
  signature: Hex;
};

export type StoredSignedTaskPayload = SerializableRelayerExecutePayload & {
  agentName: string;
  agentNode: Hex;
  digest: Hex;
  ownerName: string;
  ownerNode: Hex;
  recoveredSigner: Hex | null;
  taskHash: Hex;
  typedData: ReturnType<typeof serializeTypedData>;
};

/**
 * Builds the TaskLog calldata and EIP-712 intent that the browser signing flow displays.
 */
export function buildTaskRunDraft(input: TaskRunDraftInput): TaskRunDraft {
  const agentName = normalizeEnsName(input.agentName, "Agent ENS");
  const ownerName = validateImmediateOwnerName(agentName, input.ownerName);
  const taskDescription = normalizeRequiredText(input.taskDescription, "Task text");
  const metadataURI = normalizeRequiredText(input.metadataURI, "Metadata URI");
  const agentNode = namehashEnsName(agentName);
  const ownerNode = namehashEnsName(ownerName);
  const taskHash = keccak256(toHex(taskDescription));
  const callData = encodeFunctionData({
    abi: TASK_LOG_ABI,
    functionName: "recordTask",
    args: [agentNode, ownerNode, taskHash, metadataURI]
  });
  const intent: TaskIntentMessage = {
    agentNode,
    callDataHash: hashCallData(callData),
    expiresAt: input.expiresAt,
    nonce: input.nonce,
    target: input.taskLogAddress,
    value: input.valueWei ?? 0n
  };
  const typedData = buildTaskIntentTypedData(intent, input.chainId, input.executorAddress);

  return {
    agentNode,
    callData,
    digest: hashTaskIntent(typedData.message, input.chainId, input.executorAddress),
    intent: typedData.message,
    ownerNode,
    taskHash,
    typedData
  };
}

/**
 * Builds a task draft with an expiry derived from the current signing moment.
 */
export function buildFreshTaskRunDraft(input: FreshTaskRunDraftInput): TaskRunDraft {
  return buildTaskRunDraft({
    ...input,
    expiresAt: input.nowSeconds + input.ttlSeconds
  });
}

/**
 * Serializes bigint-heavy relayer payloads into the JSON shape accepted by /api/relayer/execute.
 */
export function serializeRelayerExecutePayload(payload: RelayerExecutePayload): SerializableRelayerExecutePayload {
  return {
    callData: payload.callData,
    intent: serializeTaskIntent(payload.intent),
    signature: payload.signature
  };
}

/**
 * Creates the local payload used by the revoke page to retry an old signature.
 */
export function buildStoredSignedTaskPayload(input: {
  agentName: string;
  callData: Hex;
  digest: Hex;
  intent: TaskIntentMessage;
  ownerName: string;
  recoveredSigner: Hex | null;
  signature: Hex;
  taskHash: Hex;
  typedData: TaskIntentTypedData;
}): StoredSignedTaskPayload {
  const agentName = normalizeEnsName(input.agentName, "Agent ENS");
  const ownerName = normalizeEnsName(input.ownerName, "Owner ENS");

  return {
    agentName,
    agentNode: input.intent.agentNode,
    callData: input.callData,
    digest: input.digest,
    intent: serializeTaskIntent(input.intent),
    ownerName,
    ownerNode: namehashEnsName(ownerName),
    recoveredSigner: input.recoveredSigner,
    signature: input.signature,
    taskHash: input.taskHash,
    typedData: serializeTypedData(input.typedData)
  };
}

/**
 * Rebuilds a relayer request body from a stored signed payload.
 */
export function storedPayloadToRelayerBody(payload: StoredSignedTaskPayload): SerializableRelayerExecutePayload {
  return {
    callData: payload.callData,
    intent: payload.intent,
    signature: payload.signature
  };
}

/**
 * Recovers the signer shown in the ENS proof panel after a browser signature is produced.
 */
export function recoverTaskSigner(digest: Hex, signature: Hex): Hex {
  return recoverSignerAddress(digest, signature);
}

/**
 * Converts typed data to a JSON-safe object for display and localStorage.
 */
export function serializeTypedData(typedData: TaskIntentTypedData) {
  return {
    ...typedData,
    domain: {
      ...typedData.domain,
      chainId: typedData.domain.chainId.toString()
    },
    message: serializeTaskIntent(typedData.message)
  };
}

function serializeTaskIntent(intent: TaskIntentMessage): SerializableRelayerExecutePayload["intent"] {
  return {
    agentNode: intent.agentNode,
    callDataHash: intent.callDataHash,
    expiresAt: intent.expiresAt.toString(),
    nonce: intent.nonce.toString(),
    target: intent.target,
    value: intent.value.toString()
  };
}

function validateImmediateOwnerName(agentName: string, ownerName: string): string {
  const normalizedOwnerName = normalizeEnsName(ownerName, "Owner ENS");
  const immediateParentName = agentName.split(".").slice(1).join(".");
  if (immediateParentName !== normalizedOwnerName) {
    throw new Error("Owner ENS must match the agent immediate parent");
  }
  return normalizedOwnerName;
}

function normalizeEnsName(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes(".")) {
    throw new Error(`${label} must be a complete ENS name`);
  }
  return normalized;
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}
