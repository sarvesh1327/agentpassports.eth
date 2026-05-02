import {
  ENS_REGISTRY_ADDRESS,
  buildTaskIntentTypedData,
  hashCallData,
  hashPolicySnapshot,
  namehashEnsName,
  normalizeEnsName,
  normalizePolicySnapshot,
  parentEnsName,
  serializePolicySnapshot,
  serializeTaskIntent,
  type ContractReadClient,
  type Hex,
  type PolicySnapshot,
  type TaskIntentMessage
} from "@agentpassport/sdk";
import { createPublicClient, defineChain, encodeFunctionData, http, keccak256, stringToHex } from "viem";
import { AGENTPASSPORT_MCP_TOOLS, type AgentPassportToolName } from "./tools.ts";
import {
  executeKeeperHubWorkflow,
  extractKeeperHubExecutionId,
  getKeeperHubExecutionLogs,
  getKeeperHubExecutionStatus,
  type KeeperHubApiConfig
} from "./keeperhubApi.ts";

const EXECUTOR_READ_ABI = [
  {
    type: "function",
    name: "nextNonce",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [{ name: "nonce", type: "uint256" }]
  }
] as const;

const TASK_LOG_ABI = [
  {
    type: "function",
    name: "recordTask",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentNode", type: "bytes32" },
      { name: "ownerNode", type: "bytes32" },
      { name: "taskHash", type: "bytes32" },
      { name: "metadataURI", type: "string" }
    ],
    outputs: [{ name: "taskId", type: "uint256" }]
  }
] as const;

export type McpServerConfig = {
  chainId: bigint;
  ensRegistryAddress: Hex;
  executorAddress: Hex;
  rpcUrl: string;
  taskLogAddress: Hex;
  keeperhubApiBaseUrl?: string;
  keeperhubApiKey?: string;
  keeperhubWorkflowId?: string;
};

type ToolArgs<TName extends AgentPassportToolName> = Record<string, any>;

/**
 * Reads MCP configuration from environment variables. The MCP server is now a
 * thin build/submit bridge: no relayer URL or private key belongs here.
 */
export function loadMcpConfig(env: Record<string, string | undefined> = process.env): McpServerConfig {
  return {
    chainId: readBigint(env.CHAIN_ID ?? env.NEXT_PUBLIC_CHAIN_ID, "CHAIN_ID"),
    ensRegistryAddress: optionalAddress(env.ENS_REGISTRY ?? env.NEXT_PUBLIC_ENS_REGISTRY) ?? ENS_REGISTRY_ADDRESS,
    executorAddress: readAddress(env.EXECUTOR_ADDRESS ?? env.NEXT_PUBLIC_EXECUTOR_ADDRESS, "EXECUTOR_ADDRESS"),
    rpcUrl: readUrl(env.RPC_URL ?? env.SEPOLIA_RPC_URL ?? env.NEXT_PUBLIC_RPC_URL, "RPC_URL"),
    taskLogAddress: readAddress(env.TASK_LOG_ADDRESS ?? env.NEXT_PUBLIC_TASK_LOG_ADDRESS, "TASK_LOG_ADDRESS"),
    keeperhubApiBaseUrl: optionalUrl(env.KEEPERHUB_API_BASE_URL ?? "https://app.keeperhub.com"),
    keeperhubApiKey: optionalSecret(env.KEEPERHUB_API_KEY),
    keeperhubWorkflowId: optionalSecret(env.KEEPERHUB_WORKFLOW_ID)
  };
}

/** Creates the minimal viem read client needed for nonce/block reads. */
export function createMcpPublicClient(config: McpServerConfig): ContractReadClient {
  const id = Number(config.chainId);
  const chain = defineChain({
    id,
    name: `chain-${id}`,
    nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
    rpcUrls: { default: { http: [config.rpcUrl] } }
  });
  return createPublicClient({ chain, transport: http(config.rpcUrl) }) as unknown as ContractReadClient;
}

/**
 * Creates MCP handlers separately from transport setup so tests can call the
 * business logic directly and the stdio/HTTP entrypoints stay tiny.
 */
export function createAgentPassportHandlers(config: McpServerConfig, client = createMcpPublicClient(config)) {
  async function buildIntent(args: ToolArgs<"build_task_intent">) {
    const agentName = normalizeEnsName(args.agentName);
    const agentNode = namehashEnsName(agentName);
    const task = args.task;
    const ownerName = task.ownerName ? normalizeEnsName(task.ownerName) : parentEnsName(agentName);
    const ownerNode = namehashEnsName(ownerName);
    const policySnapshot = normalizePolicySnapshotInput(args.policySnapshot);
    const nonce = args.nonce === undefined ? await readExecutorBigint(client, config.executorAddress, "nextNonce", agentNode) : BigInt(args.nonce);
    const expiresAt = args.expiresAt === undefined ? await readExpiresAt(client, args.ttlSeconds) : BigInt(args.expiresAt);
    const taskHash = keccak256(stringToHex(task.description));
    const defaultRecordTaskCalldata = encodeFunctionData({
      abi: TASK_LOG_ABI,
      functionName: "recordTask",
      args: [agentNode, ownerNode, taskHash, args.metadataURI]
    });
    const callData = (args.callData ?? defaultRecordTaskCalldata) as Hex;
    const target = args.callData ? policySnapshot.target : config.taskLogAddress;
    const intent: TaskIntentMessage = {
      agentNode,
      policyDigest: hashPolicySnapshot(agentNode, policySnapshot),
      target,
      callDataHash: hashCallData(callData),
      value: BigInt(task.valueWei ?? "0"),
      nonce,
      expiresAt
    };

    return {
      agentName,
      callData,
      chainId: config.chainId.toString(),
      executorAddress: config.executorAddress,
      intent: serializeTaskIntent(intent),
      metadataURI: args.metadataURI,
      ownerName,
      ownerNode,
      policySnapshot: serializePolicySnapshot(policySnapshot),
      signingPayload: {
        chainId: config.chainId.toString(),
        executorAddress: config.executorAddress,
        intent: serializeTaskIntent(intent),
        typedData: buildTaskIntentTypedData(intent, config.chainId, config.executorAddress)
      },
      taskHash
    };
  }

  async function submitTask(args: ToolArgs<"submit_task">) {
    const keeperhubConfig = keeperHubRuntimeConfig(config);
    const workflowId = args.workflowId ?? keeperhubConfig.defaultWorkflowId;
    if (!workflowId) throw new Error("Missing KeeperHub workflow id. Provide workflowId or set KEEPERHUB_WORKFLOW_ID.");

    const agentName = normalizeEnsName(args.agentName);
    const intent = normalizeTaskIntentInput(args.intent);
    const policySnapshot = normalizePolicySnapshotInput(args.policySnapshot);
    const serializedIntent = serializeTaskIntent(intent);
    const serializedPolicySnapshot = serializePolicySnapshot(policySnapshot);
    const ownerFundedErc20 = args.ownerFundedErc20
      ? { amount: String(args.ownerFundedErc20.amount), tokenIn: args.ownerFundedErc20.tokenIn as Hex }
      : undefined;
    const swapContext = args.swapContext
      ? {
          chainId: args.swapContext.chainId === undefined ? undefined : String(args.swapContext.chainId),
          deadlineSeconds: args.swapContext.deadlineSeconds === undefined ? undefined : String(args.swapContext.deadlineSeconds),
          recipient: args.swapContext.recipient as Hex | undefined,
          slippageBps: args.swapContext.slippageBps === undefined ? undefined : String(args.swapContext.slippageBps),
          tokenOut: args.swapContext.tokenOut as Hex | undefined
        }
      : undefined;
    const functionArgs = ownerFundedErc20
      ? [serializedIntent, serializedPolicySnapshot, args.callData, args.signature, ownerFundedErc20.tokenIn, ownerFundedErc20.amount]
      : [serializedIntent, serializedPolicySnapshot, args.callData, args.signature];
    const payload = {
      agentName,
      agentNode: serializedIntent.agentNode,
      policyDigest: serializedIntent.policyDigest,
      requestedTarget: serializedIntent.target,
      requestedSelector: serializedPolicySnapshot.selector,
      valueWei: serializedIntent.value,
      functionArgs: JSON.stringify(functionArgs),
      callData: args.callData,
      intent: serializedIntent,
      policySnapshot: serializedPolicySnapshot,
      signature: args.signature,
      ...(ownerFundedErc20
        ? {
            amount: ownerFundedErc20.amount,
            ownerFundedErc20,
            tokenIn: ownerFundedErc20.tokenIn
          }
        : {}),
      ...(swapContext
        ? {
            chainId: swapContext.chainId,
            deadlineSeconds: swapContext.deadlineSeconds,
            recipient: swapContext.recipient,
            slippageBps: swapContext.slippageBps,
            swapContext,
            tokenOut: swapContext.tokenOut
          }
        : {}),
      metadataURI: args.metadataURI,
      taskDescription: args.taskDescription
    };

    const execution = await executeKeeperHubWorkflow(keeperhubConfig, workflowId, { input: payload });
    const executionId = extractKeeperHubExecutionId(execution);
    let status: unknown;
    let logs: unknown;
    if ((args.waitForResult ?? false) && executionId) {
      status = await pollKeeperHubStatus(keeperhubConfig, executionId, args.pollAttempts, args.pollIntervalMs);
      logs = await getKeeperHubExecutionLogs(keeperhubConfig, executionId).catch((error) => ({ error: redactedErrorMessage(error) }));
    }

    return {
      agentName,
      keeperhub: {
        execution,
        executionId,
        logs,
        status,
        txHashes: Array.from(collectTransactionHashes({ execution, logs, status })),
        workflowId
      },
      payload
    };
  }

  async function checkTaskStatus(args: ToolArgs<"check_task_status">) {
    const keeperhubConfig = keeperHubRuntimeConfig(config);
    const executionId = String(args.executionId);
    const status = await getKeeperHubExecutionStatus(keeperhubConfig, executionId);
    const logs = (args.includeLogs ?? true)
      ? await getKeeperHubExecutionLogs(keeperhubConfig, executionId).catch((error) => ({ error: redactedErrorMessage(error) }))
      : undefined;

    return {
      keeperhub: {
        executionId,
        logs,
        status,
        txHashes: Array.from(collectTransactionHashes({ logs, status }))
      }
    };
  }

  return {
    build_task_intent: buildIntent,
    submit_task: submitTask,
    check_task_status: checkTaskStatus
  };
}

export function schemaFor<TName extends AgentPassportToolName>(name: TName): Record<string, unknown> {
  const tool = AGENTPASSPORT_MCP_TOOLS.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  return tool.inputShape;
}

function keeperHubRuntimeConfig(config: McpServerConfig): KeeperHubApiConfig {
  if (!config.keeperhubApiKey) throw new Error("Missing KEEPERHUB_API_KEY");
  return {
    apiBaseUrl: config.keeperhubApiBaseUrl ?? "https://app.keeperhub.com",
    apiKey: config.keeperhubApiKey,
    defaultWorkflowId: config.keeperhubWorkflowId
  };
}

async function pollKeeperHubStatus(config: KeeperHubApiConfig, executionId: string, pollAttempts?: number, pollIntervalMs?: number): Promise<unknown> {
  const attempts = pollAttempts ?? 45;
  const intervalMs = pollIntervalMs ?? 5_000;
  let status: unknown;
  for (let index = 0; index < attempts; index += 1) {
    if (index > 0) await sleep(index < 4 ? Math.min(intervalMs, 2_000) : intervalMs);
    status = await getKeeperHubExecutionStatus(config, executionId);
    const state = finalKeeperHubState(status);
    if (state && !["running", "queued", "pending", "in_progress", "processing"].includes(state.toLowerCase())) break;
  }
  return status;
}

function finalKeeperHubState(value: unknown): string | undefined {
  const record = value && typeof value === "object" ? (value as Record<string, any>) : undefined;
  const state = record?.status ?? record?.state ?? record?.execution?.status ?? record?.execution?.state ?? record?.data?.status ?? record?.data?.state;
  return typeof state === "string" ? state : undefined;
}

function collectTransactionHashes(value: unknown, out = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectTransactionHashes(item, out);
    return out;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "transactionHash" || key === "txHash") && typeof item === "string" && /^0x[0-9a-fA-F]{64}$/u.test(item)) {
      out.add(item);
    }
    collectTransactionHashes(item, out);
  }
  return out;
}

function normalizePolicySnapshotInput(value: any): PolicySnapshot {
  return normalizePolicySnapshot({
    enabled: Boolean(value.enabled),
    expiresAt: BigInt(value.expiresAt),
    maxGasReimbursementWei: BigInt(value.maxGasReimbursementWei),
    maxValueWei: BigInt(value.maxValueWei),
    selector: value.selector as Hex,
    target: value.target as Hex
  });
}

function normalizeTaskIntentInput(value: any): TaskIntentMessage {
  return {
    agentNode: value.agentNode as Hex,
    policyDigest: value.policyDigest as Hex,
    target: value.target as Hex,
    callDataHash: value.callDataHash as Hex,
    value: BigInt(value.value),
    nonce: BigInt(value.nonce),
    expiresAt: BigInt(value.expiresAt)
  };
}

async function readExpiresAt(client: ContractReadClient, ttlSeconds?: number): Promise<bigint> {
  const block = await client.getBlock?.({ blockTag: "latest" });
  const now = block?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
  return now + BigInt(ttlSeconds ?? 600);
}

function readExecutorBigint(client: ContractReadClient, executorAddress: Hex, functionName: "nextNonce", agentNode: Hex): Promise<bigint> {
  return client.readContract({ address: executorAddress, abi: EXECUTOR_READ_ABI, functionName, args: [agentNode] }) as Promise<bigint>;
}

function readAddress(value: string | undefined, name: string): Hex {
  const address = optionalAddress(value);
  if (!address) throw new Error(`Missing ${name}`);
  return address;
}

function optionalAddress(value: string | undefined): Hex | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/u.test(trimmed)) throw new Error("Expected an EVM address");
  return trimmed as Hex;
}

function readBigint(value: string | undefined, name: string): bigint {
  if (!value || !/^[1-9][0-9]*$/u.test(value)) throw new Error(`Missing or invalid ${name}`);
  return BigInt(value);
}

function readUrl(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return new URL(value).toString().replace(/\/$/u, "");
}

function optionalUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return new URL(value).toString().replace(/\/$/u, "");
}

function optionalSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "KeeperHub request failed";
}
