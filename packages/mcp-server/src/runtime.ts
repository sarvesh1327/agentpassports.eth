import {
  ENS_REGISTRY_ADDRESS,
  buildTaskIntentTypedData,
  getAgentAddress,
  getAgentTextRecords,
  getResolverAddress,
  hashCallData,
  hashPolicySnapshot,
  hashTaskIntent,
  namehashEnsName,
  policySnapshotFromTextRecords,
  taskLogRecordTaskSelector,
  type ContractReadClient,
  type Hex,
  type PolicySnapshot,
  type TaskIntentMessage
} from "@agentpassport/config";
import { createPublicClient, defineChain, encodeFunctionData, http, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertExactActiveStatus, assertPolicyDigestMatches } from "./safety.ts";
import { AGENTPASSPORT_MCP_TOOLS, type AgentPassportToolName } from "./tools.ts";

const AGENT_TEXT_KEYS = [
  "agent.v",
  "agent.owner",
  "agent.kind",
  "agent.capabilities",
  "agent.executor",
  "agent.status",
  "agent.policy.schema",
  "agent.policy.uri",
  "agent.policy.digest",
  "agent.policy.target",
  "agent.policy.selector",
  "agent.policy.maxValueWei",
  "agent.policy.maxGasReimbursementWei",
  "agent.policy.expiresAt"
] as const;

const OWNER_INDEX_KEYS = ["agentpassports.v", "agentpassports.agents"] as const;

const EXECUTOR_READ_ABI = [
  {
    type: "function",
    name: "nextNonce",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [{ name: "nonce", type: "uint256" }]
  },
  {
    type: "function",
    name: "gasBudgetWei",
    stateMutability: "view",
    inputs: [{ name: "agentNode", type: "bytes32" }],
    outputs: [{ name: "budget", type: "uint256" }]
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
  agentPrivateKey?: Hex;
  chainId: bigint;
  ensRegistryAddress: Hex;
  executorAddress: Hex;
  relayerUrl: string;
  rpcUrl: string;
  taskLogAddress: Hex;
};

type ToolArgs<TName extends AgentPassportToolName> = Record<string, any>;

/**
 * Reads MCP configuration from environment variables. The MCP server is an agent
 * runtime, so it uses the non-NEXT_PUBLIC names from the CLI/runner path and
 * never asks the browser for secrets.
 */
export function loadMcpConfig(env: Record<string, string | undefined> = process.env): McpServerConfig {
  return {
    agentPrivateKey: optionalHex(env.AGENT_PRIVATE_KEY, 32),
    chainId: readBigint(env.CHAIN_ID ?? env.NEXT_PUBLIC_CHAIN_ID, "CHAIN_ID"),
    ensRegistryAddress: optionalAddress(env.ENS_REGISTRY ?? env.NEXT_PUBLIC_ENS_REGISTRY) ?? ENS_REGISTRY_ADDRESS,
    executorAddress: readAddress(env.EXECUTOR_ADDRESS ?? env.NEXT_PUBLIC_EXECUTOR_ADDRESS, "EXECUTOR_ADDRESS"),
    relayerUrl: readUrl(env.RELAYER_URL, "RELAYER_URL"),
    rpcUrl: readUrl(env.RPC_URL ?? env.NEXT_PUBLIC_RPC_URL, "RPC_URL"),
    taskLogAddress: readAddress(env.TASK_LOG_ADDRESS ?? env.NEXT_PUBLIC_TASK_LOG_ADDRESS, "TASK_LOG_ADDRESS")
  };
}

/** Creates the minimal viem read client needed by shared ENS helpers. */
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
 * Builds MCP handlers separately from transport setup so tests can call the
 * business logic directly and the stdio entrypoint stays tiny.
 */
export function createAgentPassportHandlers(config: McpServerConfig, client = createMcpPublicClient(config)) {
  async function resolvePassport(agentName: string) {
    const name = normalizeEnsName(agentName);
    const agentNode = namehashEnsName(name);
    const resolverAddress = await getResolverAddress({ client, ensRegistryAddress: config.ensRegistryAddress, node: agentNode });
    const [agentAddress, textRecords, nextNonce, gasBudgetWei] = await Promise.all([
      getAgentAddress({ agentNode, client, resolverAddress }),
      getAgentTextRecords({ agentNode, client, keys: AGENT_TEXT_KEYS, resolverAddress }),
      readExecutorBigint(client, config.executorAddress, "nextNonce", agentNode),
      readExecutorBigint(client, config.executorAddress, "gasBudgetWei", agentNode)
    ]);

    return { agentAddress, agentName: name, agentNode, gasBudgetWei: gasBudgetWei.toString(), nextNonce: nextNonce.toString(), resolverAddress, textRecords };
  }

  async function getPolicy(agentName: string) {
    const passport = await resolvePassport(agentName);
    assertExactActiveStatus(passport.textRecords["agent.status"] ?? "");
    const policySnapshot = policySnapshotFromTextRecords(passport.agentNode, passport.textRecords);
    const computedDigest = hashPolicySnapshot(passport.agentNode, policySnapshot);
    assertPolicyDigestMatches(computedDigest, passport.textRecords["agent.policy.digest"] as Hex);
    return { agentName: passport.agentName, agentNode: passport.agentNode, policyDigest: computedDigest, policySnapshot: serializePolicySnapshot(policySnapshot), policyUri: passport.textRecords["agent.policy.uri"] ?? "", status: passport.textRecords["agent.status"] ?? "" };
  }

  async function buildIntent(args: ToolArgs<"build_task_intent">) {
    const policy = await getPolicy(args.agentName);
    const task = args.task;
    const ownerName = task.ownerName ? normalizeEnsName(task.ownerName) : parentEnsName(args.agentName);
    const ownerNode = namehashEnsName(ownerName);
    const nonce = await readExecutorBigint(client, config.executorAddress, "nextNonce", policy.agentNode);
    const block = await client.getBlock?.({ blockTag: "latest" });
    const now = block?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
    const expiresAt = now + BigInt(args.ttlSeconds ?? 600);
    const taskHash = keccak256(stringToHex(task.description));
    const callData = encodeFunctionData({
      abi: TASK_LOG_ABI,
      functionName: "recordTask",
      args: [policy.agentNode, ownerNode, taskHash, args.metadataURI]
    });
    const intent: TaskIntentMessage = {
      agentNode: policy.agentNode,
      policyDigest: policy.policyDigest,
      target: config.taskLogAddress,
      callDataHash: hashCallData(callData),
      value: BigInt(task.valueWei ?? "0"),
      nonce,
      expiresAt
    };

    return { callData, intent: serializeIntent(intent), metadataURI: args.metadataURI, ownerName, ownerNode, policySnapshot: policy.policySnapshot, taskHash };
  }

  return {
    resolve_agent_passport: (args: ToolArgs<"resolve_agent_passport">) => resolvePassport(args.agentName),
    list_owner_agents: async (args: ToolArgs<"list_owner_agents">) => {
      const ownerName = normalizeEnsName(args.ownerName);
      const ownerNode = namehashEnsName(ownerName);
      const resolverAddress = await getResolverAddress({ client, ensRegistryAddress: config.ensRegistryAddress, node: ownerNode });
      const records = await getAgentTextRecords({ agentNode: ownerNode, client, keys: OWNER_INDEX_KEYS, resolverAddress });
      const labels = parseOwnerLabels(records["agentpassports.agents"] ?? "");
      const agents = await Promise.all(labels.map((label) => resolvePassport(`${label}.${ownerName}`)));
      return { agents, ownerName, ownerNode, resolverAddress, version: records["agentpassports.v"] ?? "" };
    },
    get_agent_policy: (args: ToolArgs<"get_agent_policy">) => getPolicy(args.agentName),
    check_task_against_policy: async (args: ToolArgs<"check_task_against_policy">) => {
      const policy = await getPolicy(args.agentName);
      const selectorAllowed = policy.policySnapshot.selector === taskLogRecordTaskSelector();
      const targetAllowed = policy.policySnapshot.target.toLowerCase() === config.taskLogAddress.toLowerCase();
      const valueAllowed = BigInt(args.task.valueWei ?? "0") <= BigInt(policy.policySnapshot.maxValueWei);
      return { allowed: selectorAllowed && targetAllowed && valueAllowed, policy, selectorAllowed, targetAllowed, valueAllowed };
    },
    build_task_intent: buildIntent,
    sign_task_intent: async (args: ToolArgs<"sign_task_intent">) => {
      if (!config.agentPrivateKey) {
        throw new Error("AGENT_PRIVATE_KEY is required for sign_task_intent");
      }
      const passport = await resolvePassport(args.agentName);
      assertExactActiveStatus(passport.textRecords["agent.status"] ?? "");
      if (!passport.agentAddress) {
        throw new Error("ENS addr(agentName) is not set");
      }
      const account = privateKeyToAccount(config.agentPrivateKey);
      if (account.address.toLowerCase() !== passport.agentAddress.toLowerCase()) {
        throw new Error("AGENT_PRIVATE_KEY does not match live ENS addr(agentName)");
      }
      const intent = parseIntent(args.intent);
      const typedData = buildTaskIntentTypedData(intent, config.chainId, config.executorAddress);
      const signature = await account.signTypedData(typedData);
      const digest = hashTaskIntent(intent, config.chainId, config.executorAddress);
      return { digest, intent: serializeIntent(intent), signer: account.address, signature, typedData };
    },
    submit_task: async (args: ToolArgs<"submit_task">) => {
      // The relayer performs the same ENS and signature checks again. This MCP
      // tool still requires agentName so agents keep a human-readable audit trail.
      const response = await fetch(config.relayerUrl, {
        body: JSON.stringify(args),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body?.details === "string" ? body.details : `Relayer failed with HTTP ${response.status}`);
      }
      return { agentName: normalizeEnsName(args.agentName), relayer: body };
    }
  };
}

export function schemaFor<TName extends AgentPassportToolName>(name: TName): Record<string, unknown> {
  const tool = AGENTPASSPORT_MCP_TOOLS.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  return tool.inputShape;
}

function readExecutorBigint(client: ContractReadClient, executorAddress: Hex, functionName: "nextNonce" | "gasBudgetWei", agentNode: Hex): Promise<bigint> {
  return client.readContract({ address: executorAddress, abi: EXECUTOR_READ_ABI, functionName, args: [agentNode] }) as Promise<bigint>;
}

function parseIntent(intent: Record<string, string>): TaskIntentMessage {
  return { agentNode: intent.agentNode as Hex, policyDigest: intent.policyDigest as Hex, target: intent.target as Hex, callDataHash: intent.callDataHash as Hex, value: BigInt(intent.value), nonce: BigInt(intent.nonce), expiresAt: BigInt(intent.expiresAt) };
}

function serializeIntent(intent: TaskIntentMessage) {
  return { agentNode: intent.agentNode, policyDigest: intent.policyDigest, target: intent.target, callDataHash: intent.callDataHash, value: intent.value.toString(), nonce: intent.nonce.toString(), expiresAt: intent.expiresAt.toString() };
}

function serializePolicySnapshot(policy: PolicySnapshot) {
  return { target: policy.target, selector: policy.selector, maxValueWei: policy.maxValueWei.toString(), maxGasReimbursementWei: policy.maxGasReimbursementWei.toString(), expiresAt: policy.expiresAt.toString(), enabled: policy.enabled };
}

function parseOwnerLabels(value: string): string[] {
  return value.split(",").map((label) => label.trim().toLowerCase()).filter(Boolean);
}

function parentEnsName(agentName: string): string {
  return normalizeEnsName(agentName).split(".").slice(1).join(".");
}

function normalizeEnsName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized || !normalized.includes(".") || normalized.split(".").some((label) => !label)) {
    throw new Error("Expected a valid ENS name");
  }
  return normalized;
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

function optionalHex(value: string | undefined, bytes: number): Hex | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`, "u").test(trimmed)) throw new Error(`Expected ${bytes}-byte hex`);
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
