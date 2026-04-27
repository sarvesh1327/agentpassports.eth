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
  ENS_REGISTRY_ADDRESS,
  getAgentAddress,
  getResolverAddress,
  namehashEnsName
} from "../../packages/config/src/index.ts";
import { assertUint256, normalizeAddress } from "../../packages/config/src/hex.ts";
import type { RunnerConfig } from "./config.ts";
import { buildTaskPlan, type TaskPlan } from "./planTask.ts";
import { signTaskIntent, type SignedTaskIntent, type TaskIntentSigner } from "./signIntent.ts";

export type AgentTaskSigner = {
  address: Hex;
  signTypedData: TaskIntentSigner;
};

export type RelayerSubmissionResponse = {
  status: string;
  txHash?: Hex;
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
    name: Number(config.chainId) === 11155111 ? "Sepolia" : `Chain ${config.chainId}`,
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
  const ownerNode = namehashEnsName(config.ownerName);
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
  const now = input.now ?? BigInt(Math.floor(Date.now() / 1000));
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
    await (input.savePayload ?? writeSignedPayload)(config.lastPayloadPath, {
      agentName: config.agentName,
      agentNode,
      callData: plan.callData,
      digest: signed.digest,
      intent: serializeIntent(signed.intent),
      ownerName: config.ownerName,
      ownerNode,
      recoveredSigner: signed.recoveredSigner,
      resolverAddress,
      resolvedAgentAddress,
      signature: signed.signature,
      taskHash: plan.taskHash,
      typedData: signed.typedData
    });
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
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = typeof body?.details === "string" ? body.details : response.statusText;
    throw new Error(`Relayer request failed: ${details}`);
  }
  return body as RelayerSubmissionResponse;
}

/**
 * Persists the last signed payload so the revoke demo can retry it after ENS addr changes.
 */
export async function writeSignedPayload(filePath: string, payload: SavedSignedPayload): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, jsonBigintReplacer, 2)}\n`, "utf8");
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
