import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  ContractReadClient,
  Hex,
  TaskIntentTypedData
} from "../../packages/config/src/index.ts";
import {
  chainNameForId,
  ENS_REGISTRY_ADDRESS,
  getAgentAddress,
  getResolverAddress,
  namehashEnsName
} from "../../packages/config/src/index.ts";
import { assertHex, assertUint256, assertUint64, normalizeAddress } from "../../packages/config/src/hex.ts";
import type { RunnerConfig } from "./config.ts";
import { buildTaskPlan, type TaskPlan } from "./planTask.ts";
import { signTaskIntent, type SignedTaskIntent, type TaskIntentSigner } from "./signIntent.ts";

export type AgentTaskSigner = {
  address: Hex;
  signTypedData: TaskIntentSigner;
};

export type RelayerSubmissionResponse = {
  status: "submitted";
  txHash: Hex;
};

export type SavedSignedPayload = {
  agentName: string;
  agentNode: Hex;
  callData: Hex;
  digest: Hex;
  intent: Record<"agentNode" | "target" | "callDataHash" | "value" | "nonce" | "expiresAt", string>;
  ownerName: string;
  ownerNode: Hex;
  recoveredSigner: Hex;
  resolverAddress: Hex;
  resolvedAgentAddress: Hex;
  signature: Hex;
  taskHash: Hex;
  typedData: TaskIntentTypedData;
};

export type RunAgentTaskInput = {
  client?: ContractReadClient;
  config: RunnerConfig;
  now?: bigint;
  savePayload?: (path: string, payload: SavedSignedPayload) => Promise<void>;
  signer?: AgentTaskSigner;
  submitRelayer?: (url: string, payload: RelayerPayload) => Promise<RelayerSubmissionResponse>;
};

export type RelayerPayload = {
  callData: Hex;
  intent: TaskPlan["intent"];
  signature: Hex;
};

export type RunAgentTaskResult = {
  agentNode: Hex;
  ownerNode: Hex;
  plan: TaskPlan;
  relayerResponse: RelayerSubmissionResponse;
  resolvedAgentAddress: Hex;
  resolverAddress: Hex;
  signed: SignedTaskIntent;
};

const EXECUTOR_NONCE_ABI = [
  {
    type: "function",
    name: "nextNonce",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [{ name: "nonce", type: "uint256" }]
  }
] as const;

/**
 * Creates the viem public client used for ENS and executor reads.
 */
export function createRunnerPublicClient(config: RunnerConfig): ContractReadClient {
  const chain = defineChain({
    id: Number(config.chainId),
    name: chainNameForId(config.chainId),
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH"
    },
    rpcUrls: {
      default: {
        http: [config.rpcUrl]
      }
    }
  });
  return createPublicClient({ chain, transport: http(config.rpcUrl) }) as unknown as ContractReadClient;
}

/**
 * Creates the agent signer backed by AGENT_PRIVATE_KEY.
 */
export function createPrivateKeyAgentSigner(privateKey: Hex): AgentTaskSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address as Hex,
    signTypedData: (typedData) =>
      account.signTypedData({
        domain: typedData.domain,
        message: typedData.message,
        primaryType: typedData.primaryType,
        types: typedData.types
      })
  };
}

/**
 * Runs the full backend signing path: ENS resolution, nonce read, signing, relayer submission, and payload persistence.
 */
export async function runAgentTask(input: RunAgentTaskInput): Promise<RunAgentTaskResult> {
  const { config } = input;
  const client = input.client ?? createRunnerPublicClient(config);
  const signer = input.signer ?? createPrivateKeyAgentSigner(config.agentPrivateKey);
  const agentNode = namehashEnsName(config.agentName);
  const ownerName = validateAgentOwnerName(config.agentName, config.ownerName);
  const ownerNode = namehashEnsName(ownerName);
  const resolverAddress = await getResolverAddress({
    client,
    ensRegistryAddress: config.ensRegistryAddress ?? ENS_REGISTRY_ADDRESS,
    node: agentNode
  });

  if (!resolverAddress) {
    throw new Error(`ENS resolver is not set for ${config.agentName}`);
  }

  const resolvedAgentAddress = await getAgentAddress({
    agentNode,
    client,
    resolverAddress
  });

  if (!resolvedAgentAddress) {
    throw new Error(`ENS addr record is not set for ${config.agentName}`);
  }
  if (!sameAddress(signer.address, resolvedAgentAddress)) {
    throw new Error("AGENT_PRIVATE_KEY does not match ENS-resolved agent address");
  }

  const nonce = await readExecutorNonce(client, config.executorAddress, agentNode);
  const now = await readSigningTimestamp(client, input.now);
  const plan = buildTaskPlan({
    agentNode,
    expiresAt: now + config.intentTtlSeconds,
    metadataURI: config.metadataURI,
    nonce,
    ownerNode,
    taskDescription: config.taskDescription,
    taskLogAddress: config.taskLogAddress
  });
  const signed = await signTaskIntent({
    chainId: config.chainId,
    executorAddress: config.executorAddress,
    expectedSigner: resolvedAgentAddress,
    intent: plan.intent,
    signTypedData: signer.signTypedData
  });
  const relayerPayload = {
    callData: plan.callData,
    intent: signed.intent,
    signature: signed.signature
  };
  const relayerResponse = await (input.submitRelayer ?? submitRelayerPayload)(config.relayerUrl, relayerPayload);

  if (config.lastPayloadPath) {
    try {
      await (input.savePayload ?? writeSignedPayload)(config.lastPayloadPath, {
        agentName: config.agentName,
        agentNode,
        callData: plan.callData,
        digest: signed.digest,
        intent: serializeIntent(signed.intent),
        ownerName,
        ownerNode,
        recoveredSigner: signed.recoveredSigner,
        resolverAddress,
        resolvedAgentAddress,
        signature: signed.signature,
        taskHash: plan.taskHash,
        typedData: signed.typedData
      });
    } catch {
      // The relayer has already accepted the intent, so local demo persistence must not mask success.
    }
  }

  return {
    agentNode,
    ownerNode,
    plan,
    relayerResponse,
    resolvedAgentAddress,
    resolverAddress,
    signed
  };
}

/**
 * Sends the signed payload to the relayer endpoint with bigint fields serialized as decimal strings.
 */
export async function submitRelayerPayload(
  url: string,
  payload: RelayerPayload,
  fetchFn: typeof fetch = fetch
): Promise<RelayerSubmissionResponse> {
  const response = await fetchFn(url, {
    body: JSON.stringify(serializeRelayerPayload(payload)),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const details = typeof body?.details === "string" ? body.details : response.statusText;
    throw new Error(`Relayer request failed: ${details}`);
  }
  return readRelayerSubmissionResponse(await readSuccessJson(response));
}

/**
 * Persists the last signed payload so the revoke demo can retry it after ENS addr changes.
 */
export async function writeSignedPayload(filePath: string, payload: SavedSignedPayload): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, jsonBigintReplacer, 2)}\n`, "utf8");
}

/**
 * Ensures TaskLog owner attribution is the parent ENS name of the configured agent.
 */
function validateAgentOwnerName(agentName: string, ownerName: string): string {
  const normalizedAgentName = agentName.trim().toLowerCase();
  const normalizedOwnerName = ownerName.trim().toLowerCase();
  const immediateParentName = normalizedAgentName.split(".").slice(1).join(".");
  if (immediateParentName !== normalizedOwnerName) {
    throw new Error("OWNER_ENS_NAME must match the immediate parent of AGENT_ENS_NAME");
  }
  return normalizedOwnerName;
}

async function readSuccessJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Invalid relayer response");
  }
}

function readRelayerSubmissionResponse(body: unknown): RelayerSubmissionResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid relayer response");
  }
  const response = body as Record<string, unknown>;
  if (response.status !== "submitted" || typeof response.txHash !== "string") {
    throw new Error("Invalid relayer response");
  }
  return {
    status: "submitted",
    txHash: assertHex(response.txHash as Hex, 32)
  };
}

async function readExecutorNonce(client: ContractReadClient, executorAddress: Hex, agentNode: Hex): Promise<bigint> {
  const nonce = await client.readContract({
    address: normalizeAddress(executorAddress, "preserve"),
    abi: EXECUTOR_NONCE_ABI,
    functionName: "nextNonce",
    args: [agentNode]
  });
  if (typeof nonce !== "bigint") {
    throw new Error("nextNonce must return uint256");
  }
  return assertUint256(nonce);
}

async function readSigningTimestamp(client: ContractReadClient, nowOverride?: bigint): Promise<bigint> {
  if (nowOverride !== undefined) {
    return assertUint64(nowOverride);
  }
  if (!client.getBlock) {
    throw new Error("Contract read client must support getBlock when no signing timestamp override is provided");
  }

  const block = await client.getBlock({ blockTag: "latest" });
  if (typeof block.timestamp !== "bigint") {
    throw new Error("latest block must include a bigint timestamp");
  }
  return assertUint64(block.timestamp);
}

function serializeRelayerPayload(payload: RelayerPayload) {
  return {
    callData: payload.callData,
    intent: serializeIntent(payload.intent),
    signature: payload.signature
  };
}

function serializeIntent(intent: TaskPlan["intent"]) {
  return {
    agentNode: intent.agentNode,
    target: intent.target,
    callDataHash: intent.callDataHash,
    value: intent.value.toString(),
    nonce: intent.nonce.toString(),
    expiresAt: intent.expiresAt.toString()
  };
}

function sameAddress(left: Hex, right: Hex): boolean {
  return normalizeAddress(left, "lower") === normalizeAddress(right, "lower");
}

function jsonBigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
