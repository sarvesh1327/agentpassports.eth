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
  normalizeEnsName,
  parentEnsName,
  parseOwnerAgentLabels,
  policySnapshotFromTextRecords,
  serializePolicySnapshot,
  serializeTaskIntent,
  swapPolicyFromTextRecords,
  taskLogRecordTaskSelector,
  assertExactActiveStatus,
  assertPolicyDigestMatches,
  type ContractReadClient,
  type Hex,
  type TaskIntentMessage
} from "@agentpassport/sdk";
import { createPublicClient, defineChain, encodeFunctionData, http, keccak256, stringToHex } from "viem";
import { AGENTPASSPORT_MCP_TOOLS, type AgentPassportToolName } from "./tools.ts";
import {
  buildSwapProofMetadata,
  buildUniswapApprovalPayload,
  buildUniswapQuotePayload,
  callUniswapApi,
  normalizeUniswapQuoteResponse,
  normalizeUniswapSwapResponse,
  validateSwapRequestAgainstPolicy
} from "./uniswap.ts";
import {
  buildAgentPassportsKeeperHubWorkflowDefinition,
  createKeeperHubWorkflow,
  executeKeeperHubApprovedFlow,
  executeKeeperHubWorkflow,
  extractKeeperHubExecutionId,
  extractKeeperHubRunId,
  getKeeperHubExecutionLogs,
  getKeeperHubExecutionStatus,
  listKeeperHubWorkflows,
  type KeeperHubApiConfig
} from "./keeperhubApi.ts";
import { buildKeeperHubGateDecision, buildKeeperHubWorkflowPayload, buildRunAttestation } from "./keeperhub.ts";

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
  "agent.policy.expiresAt",
  "agent.policy.uniswap.chainId",
  "agent.policy.uniswap.allowedTokenIn",
  "agent.policy.uniswap.allowedTokenOut",
  "agent.policy.uniswap.maxInputAmount",
  "agent.policy.uniswap.maxSlippageBps",
  "agent.policy.uniswap.deadlineSeconds",
  "agent.policy.uniswap.enabled",
  "agent.policy.uniswap.recipient",
  "agent.policy.uniswap.router",
  "agent.policy.uniswap.selector"
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
  chainId: bigint;
  ensRegistryAddress: Hex;
  executorAddress: Hex;
  relayerUrl: string;
  rpcUrl: string;
  taskLogAddress: Hex;
  keeperhubApiBaseUrl?: string;
  keeperhubApiKey?: string;
  keeperhubWorkflowId?: string;
  uniswapApiBaseUrl?: string;
  uniswapApiKey?: string;
};

type ToolArgs<TName extends AgentPassportToolName> = Record<string, any>;

/**
 * Reads MCP configuration from environment variables. The MCP server is an agent
 * runtime, so it uses the non-NEXT_PUBLIC names from the CLI/runner path and
 * never asks the browser for secrets.
 */
export function loadMcpConfig(env: Record<string, string | undefined> = process.env): McpServerConfig {
  return {
    chainId: readBigint(env.CHAIN_ID ?? env.NEXT_PUBLIC_CHAIN_ID, "CHAIN_ID"),
    ensRegistryAddress: optionalAddress(env.ENS_REGISTRY ?? env.NEXT_PUBLIC_ENS_REGISTRY) ?? ENS_REGISTRY_ADDRESS,
    executorAddress: readAddress(env.EXECUTOR_ADDRESS ?? env.NEXT_PUBLIC_EXECUTOR_ADDRESS, "EXECUTOR_ADDRESS"),
    relayerUrl: readUrl(env.RELAYER_URL, "RELAYER_URL"),
    rpcUrl: readUrl(env.RPC_URL ?? env.NEXT_PUBLIC_RPC_URL, "RPC_URL"),
    taskLogAddress: readAddress(env.TASK_LOG_ADDRESS ?? env.NEXT_PUBLIC_TASK_LOG_ADDRESS, "TASK_LOG_ADDRESS"),
    keeperhubApiBaseUrl: optionalUrl(env.KEEPERHUB_API_BASE_URL ?? "https://app.keeperhub.com"),
    keeperhubApiKey: optionalSecret(env.KEEPERHUB_API_KEY),
    keeperhubWorkflowId: optionalSecret(env.KEEPERHUB_WORKFLOW_ID),
    uniswapApiBaseUrl: optionalUrl(env.UNISWAP_API_BASE_URL),
    uniswapApiKey: optionalSecret(env.UNISWAP_API_KEY)
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

  async function getSwapPolicy(agentName: string) {
    const passport = await resolvePassport(agentName);
    assertExactActiveStatus(passport.textRecords["agent.status"] ?? "");
    if (!passport.agentAddress) throw new Error("Agent ENS addr() is required for Uniswap API calls");
    return { agentAddress: passport.agentAddress, agentName: passport.agentName, agentNode: passport.agentNode, swapPolicy: swapPolicyFromTextRecords(passport.textRecords) };
  }

  async function validateUniswapSwap(args: ToolArgs<"uniswap_validate_swap_against_ens_policy">) {
    const policy = await getSwapPolicy(args.agentName);
    const validation = validateSwapRequestAgainstPolicy(args as any, policy.swapPolicy);
    return { ...validation, agentAddress: policy.agentAddress, agentName: policy.agentName, agentNode: policy.agentNode };
  }

  async function checkTaskAgainstPolicy(args: ToolArgs<"check_task_against_policy">) {
    const policy = await getPolicy(args.agentName);
    const selectorAllowed = policy.policySnapshot.selector === taskLogRecordTaskSelector();
    const targetAllowed = policy.policySnapshot.target.toLowerCase() === config.taskLogAddress.toLowerCase();
    const valueAllowed = BigInt(args.task.valueWei ?? "0") <= BigInt(policy.policySnapshot.maxValueWei);
    return { allowed: selectorAllowed && targetAllowed && valueAllowed, policy, selectorAllowed, targetAllowed, valueAllowed };
  }

  async function buildKeeperHubDecision(args: ToolArgs<"keeperhub_validate_agent_task">) {
    const passport = await resolvePassport(args.agentName);
    try {
      const taskCheck = await checkTaskAgainstPolicy({ agentName: args.agentName, task: args.task });
      return buildKeeperHubGateDecision({
        passport,
        policy: taskCheck.policy,
        taskCheck,
        trustThreshold: args.trustThreshold
      });
    } catch (error) {
      // KeeperHub Gate must be demo-safe for revocation and bad-policy paths: a
      // controlled AgentPassports policy/status failure is a blocked decision, not
      // a crash that would make the gate unusable. This never approves on error.
      return buildKeeperHubGateDecision({
        passport,
        policyError: error instanceof Error ? error : new Error("policy preflight failed"),
        trustThreshold: args.trustThreshold
      });
    }
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

    return {
      callData,
      chainId: config.chainId.toString(),
      executorAddress: config.executorAddress,
      intent: serializeTaskIntent(intent),
      metadataURI: args.metadataURI,
      ownerName,
      ownerNode,
      policySnapshot: policy.policySnapshot,
      signingPayload: {
        chainId: config.chainId.toString(),
        executorAddress: config.executorAddress,
        intent: serializeTaskIntent(intent),
        typedData: buildTaskIntentTypedData(intent, config.chainId, config.executorAddress)
      },
      taskHash
    };
  }

  return {
    resolve_agent_passport: (args: ToolArgs<"resolve_agent_passport">) => resolvePassport(args.agentName),
    list_owner_agents: async (args: ToolArgs<"list_owner_agents">) => {
      const ownerName = normalizeEnsName(args.ownerName);
      const ownerNode = namehashEnsName(ownerName);
      const resolverAddress = await getResolverAddress({ client, ensRegistryAddress: config.ensRegistryAddress, node: ownerNode });
      const records = await getAgentTextRecords({ agentNode: ownerNode, client, keys: OWNER_INDEX_KEYS, resolverAddress });
      const labels = parseOwnerAgentLabels(records["agentpassports.agents"] ?? "");
      const agents = await Promise.all(labels.map((label) => resolvePassport(`${label}.${ownerName}`)));
      return { agents, ownerName, ownerNode, resolverAddress, version: records["agentpassports.v"] ?? "" };
    },
    get_agent_policy: (args: ToolArgs<"get_agent_policy">) => getPolicy(args.agentName),
    check_task_against_policy: checkTaskAgainstPolicy,
    build_task_intent: buildIntent,
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
    },
    keeperhub_validate_agent_task: buildKeeperHubDecision,
    keeperhub_build_workflow_payload: async (args: ToolArgs<"keeperhub_build_workflow_payload">) => {
      const [passport, gateDecision, intentResult] = await Promise.all([
        resolvePassport(args.agentName),
        buildKeeperHubDecision(args),
        buildIntent(args)
      ]);
      return buildKeeperHubWorkflowPayload({ buildIntentResult: intentResult, gateDecision, passport });
    },
    keeperhub_emit_run_attestation: async (args: ToolArgs<"keeperhub_emit_run_attestation">) => buildRunAttestation(args as any),
    keeperhub_list_workflows: async () => listKeeperHubWorkflows(keeperHubRuntimeConfig(config)),
    keeperhub_create_gate_workflow: async (args: ToolArgs<"keeperhub_create_gate_workflow">) => {
      const definition = buildAgentPassportsKeeperHubWorkflowDefinition({ description: args.description, name: args.name });
      const keeperhub = await createKeeperHubWorkflow(keeperHubRuntimeConfig(config), definition);
      return { definition, keeperhub };
    },
    keeperhub_execute_approved_workflow: async (args: ToolArgs<"keeperhub_execute_approved_workflow">) => {
      const passport = await resolvePassport(args.agentName);
      const gateDecision = await buildKeeperHubDecision(args);
      return executeKeeperHubApprovedFlow({
        gateDecision,
        taskDescription: args.task.description,
        executeApproved: async () => {
          const intentResult = await buildIntent(args);
          const workflowPayload = buildKeeperHubWorkflowPayload({ buildIntentResult: intentResult, gateDecision, passport });
          const keeperhubConfig = keeperHubRuntimeConfig(config);
          const workflowId = args.workflowId ?? keeperhubConfig.defaultWorkflowId;
          if (!workflowId) throw new Error("Missing KeeperHub workflow id. Provide workflowId or set KEEPERHUB_WORKFLOW_ID.");
          const execution = await executeKeeperHubWorkflow(keeperhubConfig, workflowId, workflowPayload);
          const executionId = extractKeeperHubExecutionId(execution);
          const [status, logs] = executionId
            ? await Promise.all([
                getKeeperHubExecutionStatus(keeperhubConfig, executionId).catch((error) => ({ error: redactedErrorMessage(error) })),
                getKeeperHubExecutionLogs(keeperhubConfig, executionId).catch((error) => ({ error: redactedErrorMessage(error) }))
              ])
            : [undefined, undefined];
          const keeperhubRunId = extractKeeperHubRunId(logs) ?? executionId;
          return {
            gateDecision,
            workflowPayload,
            keeperhub: { execution, executionId, logs, status, workflowId },
            attestation: buildRunAttestation({
              agentName: gateDecision.agentName,
              blockers: [],
              decision: "approved",
              keeperhubRunId,
              policyDigest: gateDecision.policyDigest,
              reasons: gateDecision.reasons,
              taskDescription: args.task.description
            })
          };
        }
      });
    },
    keeperhub_get_execution_status: async (args: ToolArgs<"keeperhub_get_execution_status">) => getKeeperHubExecutionStatus(keeperHubRuntimeConfig(config), args.executionId),
    keeperhub_get_execution_logs: async (args: ToolArgs<"keeperhub_get_execution_logs">) => getKeeperHubExecutionLogs(keeperHubRuntimeConfig(config), args.executionId),
    uniswap_check_approval: async (args: ToolArgs<"uniswap_check_approval">) => {
      const policy = await getSwapPolicy(args.agentName);
      const validation = validateSwapRequestAgainstPolicy(
        { amount: args.amount, chainId: args.chainId, slippageBps: "0", tokenIn: args.token, tokenOut: policy.swapPolicy.allowedTokensOut[0] },
        policy.swapPolicy
      );
      if (!validation.policyEnabled || !validation.chainAllowed || !validation.tokenInAllowed || !validation.amountAllowed) {
        throw new Error("Approval request is not allowed by ENS Uniswap policy");
      }
      const payload = buildUniswapApprovalPayload(policy.agentAddress, args as any);
      return { agentName: policy.agentName, payload, uniswap: await callUniswapApi("/check_approval", payload, uniswapRuntimeConfig(config)) };
    },
    uniswap_quote: async (args: ToolArgs<"uniswap_quote">) => {
      const policy = await getSwapPolicy(args.agentName);
      const validation = validateSwapRequestAgainstPolicy(args as any, policy.swapPolicy);
      if (!validation.allowed) throw new Error("Quote request is not allowed by ENS Uniswap policy");
      const payload = buildUniswapQuotePayload(policy.agentAddress, args as any);
      const uniswap = await callUniswapApi("/quote", payload, uniswapRuntimeConfig(config));
      return { agentName: policy.agentName, payload, policyValidation: validation, summary: normalizeUniswapQuoteResponse(uniswap), uniswap };
    },
    uniswap_execute_swap: async (args: ToolArgs<"uniswap_execute_swap">) => {
      const policy = await getSwapPolicy(args.agentName);
      const validation = validateSwapRequestAgainstPolicy(args as any, policy.swapPolicy);
      if (!validation.allowed) throw new Error("Swap request is not allowed by ENS Uniswap policy");
      const payload = { permitData: args.permitData, quote: args.quote, signature: args.permit2Signature };
      const uniswap = await callUniswapApi("/swap", payload, uniswapRuntimeConfig(config));
      return { agentName: policy.agentName, payload, policyValidation: validation, summary: normalizeUniswapSwapResponse(uniswap), uniswap };
    },
    uniswap_validate_swap_against_ens_policy: validateUniswapSwap,
    uniswap_record_swap_proof: async (args: ToolArgs<"uniswap_record_swap_proof">) => {
      const passport = await resolvePassport(args.agentName);
      return {
        agentName: passport.agentName,
        metadata: buildSwapProofMetadata({ ...(args as any), agentName: passport.agentName, agentNode: passport.agentNode })
      };
    }
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

function readExecutionId(value: unknown): string | undefined {
  if (value && typeof value === "object" && "executionId" in value && typeof (value as any).executionId === "string") {
    return (value as any).executionId;
  }
  return undefined;
}

function readRunId(value: unknown): string | undefined {
  if (value && typeof value === "object" && "runId" in value && typeof (value as any).runId === "string") {
    return (value as any).runId;
  }
  return undefined;
}

function redactedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "KeeperHub request failed";
}

function readExecutorBigint(client: ContractReadClient, executorAddress: Hex, functionName: "nextNonce" | "gasBudgetWei", agentNode: Hex): Promise<bigint> {
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

function uniswapRuntimeConfig(config: McpServerConfig) {
  return { apiBaseUrl: config.uniswapApiBaseUrl, apiKey: config.uniswapApiKey };
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
