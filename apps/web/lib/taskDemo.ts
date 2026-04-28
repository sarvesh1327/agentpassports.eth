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

export type TaskAuthorizationResult = {
  failureReason?: string;
  status: "fail" | "pass" | "unknown";
};

export type TaskGasBudgetStatus = {
  blocker: string | null;
  requiredWei: bigint;
};

type SignedTaskPayloadStorage = {
  setItem(key: string, value: string): void;
};

/**
 * Builds the TaskLog calldata and EIP-712 intent that the browser signing flow displays.
 */
export function buildTaskRunDraft(input: TaskRunDraftInput): TaskRunDraft {
  const agentName = normalizeEnsName(input.agentName, "Agent ENS");
  const ownerName = validateImmediateOwnerName(agentName, input.ownerName);
  const taskDescription = normalizeRequiredText(input.taskDescription, "Task text");
  const metadataURI = normalizeOptionalTaskMetadataURI(input.metadataURI);
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
 * Keeps TaskLog metadata optional until the Pinata-backed metadata flow exists.
 */
export function normalizeOptionalTaskMetadataURI(value: string): string {
  return value.trim();
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
 * Saves the last signed payload when browser storage is available without blocking execution.
 */
export function storeSignedTaskPayload(input: {
  key?: string;
  payload: StoredSignedTaskPayload;
  storage?: SignedTaskPayloadStorage | null;
}): boolean {
  const storage = input.storage ?? browserStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(input.key ?? LAST_SIGNED_TASK_STORAGE_KEY, JSON.stringify(input.payload, null, 2));
    return true;
  } catch {
    return false;
  }
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
 * Checks whether a stored retry payload safely belongs to the currently selected agent node.
 */
export function storedPayloadMatchesAgentNode(payload: unknown, agentNode: Hex): boolean {
  const candidate = payload as { intent?: { agentNode?: unknown } } | null;
  const payloadAgentNode = candidate?.intent?.agentNode;
  return typeof payloadAgentNode === "string" && payloadAgentNode.toLowerCase() === agentNode.toLowerCase();
}

/**
 * Recovers the signer shown in the ENS proof panel after a browser signature is produced.
 */
export function recoverTaskSigner(digest: Hex, signature: Hex): Hex {
  return recoverSignerAddress(digest, signature);
}

/**
 * Computes the proof-panel authorization state from live ENS signer and policy facts.
 */
export function taskAuthorizationResult(input: {
  liveAgentAddress?: Hex | null;
  policyEnabled?: boolean;
  recoveredSigner?: Hex | null;
}): TaskAuthorizationResult {
  if (!input.recoveredSigner || !input.liveAgentAddress) {
    return { status: "unknown" };
  }
  if (!sameAddress(input.recoveredSigner, input.liveAgentAddress)) {
    return {
      failureReason: "Recovered signer does not match ENS addr(agent)",
      status: "fail"
    };
  }
  if (input.policyEnabled === undefined) {
    return { status: "unknown" };
  }
  if (!input.policyEnabled) {
    return {
      failureReason: "Policy is disabled",
      status: "fail"
    };
  }
  return { status: "pass" };
}

/**
 * Checks the budget facts the browser can prove before signing; relayer-side gas estimation handles reimbursement.
 */
export function taskGasBudgetStatus(input: {
  gasBudgetWei?: bigint;
  maxGasReimbursementWei?: bigint;
  maxValueWei?: bigint;
}): TaskGasBudgetStatus {
  const gasBudgetWei = input.gasBudgetWei ?? 0n;
  const requiredWei = input.maxValueWei && input.maxValueWei > 0n ? input.maxValueWei : gasBudgetWei === 0n ? 1n : 0n;
  if (requiredWei > 0n && gasBudgetWei < requiredWei) {
    return {
      blocker: gasBudgetWei === 0n ? "Gas budget is empty" : "Gas budget cannot cover the task value",
      requiredWei
    };
  }

  return {
    blocker: null,
    requiredWei
  };
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

function sameAddress(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function browserStorage(): SignedTaskPayloadStorage | null {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}
