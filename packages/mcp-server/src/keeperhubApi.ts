import { buildRunAttestation, type KeeperHubGateDecision } from "./keeperhub.ts";

export type KeeperHubApiConfig = {
  apiBaseUrl: string;
  apiKey: string;
  defaultWorkflowId?: string;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type WorkflowDefinitionInput = {
  chainId?: string | number | bigint;
  description?: string;
  ensRegistryAddress?: string;
  executorAddress?: string;
  name?: string;
  rpcUrl?: string;
  taskLogAddress?: string;
};

const DEFAULT_KEEPERHUB_API_BASE_URL = "https://app.keeperhub.com";
const PLACEHOLDER_BYTES32 = "{{input.agentNode}}";

export function loadKeeperHubApiConfig(env: Record<string, string | undefined> = process.env): KeeperHubApiConfig {
  const apiKey = env.KEEPERHUB_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing KEEPERHUB_API_KEY");
  return {
    apiBaseUrl: normalizeBaseUrl(env.KEEPERHUB_API_BASE_URL ?? DEFAULT_KEEPERHUB_API_BASE_URL),
    apiKey,
    defaultWorkflowId: env.KEEPERHUB_WORKFLOW_ID?.trim() || undefined
  };
}

/**
 * Builds the direct-ENS-first KeeperHub border-control workflow template.
 *
 * Why this lives in KeeperHub: the product demo needs KeeperHub to be the visible
 * runtime that decides whether an agent action proceeds, not a black-box caller
 * that trusts our backend. The graph below therefore models Passport checks
 * (agent ENS identity exists) and Visa checks (ENS policy grants the requested
 * action) as separate KeeperHub nodes before the `AgentEnsExecutor.execute` node.
 *
 * Why direct ENS first: the preferred security boundary is that KeeperHub reads
 * current ENS state itself through public `eth_call`s. The AgentPassports MCP/API
 * remains useful as a local preflight and fallback, but it is not the authority in
 * this template. The template intentionally includes JSON-RPC call descriptors for
 * ENS registry/resolver reads instead of API URLs or secrets.
 *
 * Capability status: previous live proof only established that KeeperHub accepts
 * `name`, `nodes`, `edges`, and can run a manual trigger, plus a Web3 write node in
 * a separate proof. We have not live-imported these HTTP JSON-RPC read or condition
 * nodes, so each relevant node carries `capabilityStatus: template-not-live-import-proven`.
 * That is explicit instead of silently falling back to the AgentPassports API.
 */
export function buildAgentPassportsKeeperHubWorkflowDefinition(input: WorkflowDefinitionInput = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const rpcUrl = input.rpcUrl ?? "{{RPC_URL}}";
  const ensRegistryAddress = input.ensRegistryAddress ?? "{{ENS_REGISTRY}}";
  const executorAddress = input.executorAddress ?? "{{EXECUTOR_ADDRESS}}";
  const taskLogAddress = input.taskLogAddress ?? "{{TASK_LOG_ADDRESS}}";

  return {
    name: input.name ?? `AgentPassports V3 KeeperHub Gate ${timestamp}`,
    description:
      input.description ??
      "AgentPassports direct ENS KeeperHub gate. KeeperHub reads the Passport/Visa state from ENS first, routes failures to blocked stamps, and only then reaches execution. Payload contains no secrets.",
    gateMode: "direct-ens-first",
    capabilityStatus: {
      directEnsReads: "template-not-live-import-proven",
      conditionBranches: "template-not-live-import-proven",
      blockedStampRouting: "template-not-live-import-proven",
      agentEnsExecuteWrite: "previous-live-proof-web3-write-supported"
    },
    inputs: {
      chainId: String(input.chainId ?? "{{CHAIN_ID}}"),
      rpcUrl,
      ensRegistryAddress,
      executorAddress,
      taskLogAddress,
      requiredTextRecords: [
        "agent_status",
        "agent_policy_digest",
        "agent_policy_target",
        "agent_policy_selector",
        "agent_policy_max_value_wei",
        "agent_policy_max_gas_reimbursement_wei",
        "agent_policy_expires_at"
      ]
    },
    nodes: buildDirectEnsKeeperHubNodes({ ensRegistryAddress, executorAddress, rpcUrl, taskLogAddress }),
    edges: buildDirectEnsKeeperHubEdges()
  };
}

function buildDirectEnsKeeperHubNodes(input: {
  ensRegistryAddress: string;
  executorAddress: string;
  rpcUrl: string;
  taskLogAddress: string;
}) {
  return [
    {
      id: "agentpassports_trigger",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: {
        type: "trigger",
        label: "AgentPassports action request",
        config: { triggerType: "Manual" },
        status: "idle",
        description: "Receives the agent action request. All subsequent KeeperHub nodes must pass before execution."
      }
    },
    {
      id: "ens_resolve_passport",
      type: "http-json-rpc",
      position: { x: 320, y: 0 },
      capabilityStatus: "template-not-live-import-proven",
      data: {
        label: "Direct ENS Passport/Visa reads",
        method: "POST",
        url: input.rpcUrl,
        description:
          "KeeperHub direct ENS read node. It performs eth_call reads against the registry/resolver so KeeperHub, not the AgentPassports API, observes live Passport and Visa state.",
        config: {
          jsonrpc: "2.0",
          calls: [
            {
              purpose: "Passport resolver lookup",
              to: input.ensRegistryAddress,
              function: "resolver(bytes32)",
              params: [PLACEHOLDER_BYTES32]
            },
            {
              purpose: "Passport signer exists",
              to: "{{nodes.ens_resolve_passport.outputs.resolverAddress}}",
              function: "addr(bytes32)",
              params: [PLACEHOLDER_BYTES32]
            },
            ...[
              "agent_status",
              "agent_policy_digest",
              "agent_policy_target",
              "agent_policy_selector",
              "agent_policy_max_value_wei",
              "agent_policy_max_gas_reimbursement_wei",
              "agent_policy_expires_at"
            ].map((key) => ({
              purpose: `Visa text record ${key}`,
              to: "{{nodes.ens_resolve_passport.outputs.resolverAddress}}",
              function: "text(bytes32,string)",
              params: [PLACEHOLDER_BYTES32, key]
            }))
          ]
        }
      }
    },
    conditionNode("check_agent_exists", 640, -180, "Passport exists?", "MISSING_SIGNER", "Requires nonzero resolver and addr(agent) from live ENS."),
    conditionNode("check_status_active", 960, -180, "Visa status active?", "STATUS_NOT_ACTIVE", "Requires ENS text agent_status to be exactly active."),
    conditionNode("check_policy_digest", 1280, -180, "Visa digest and fields valid?", "POLICY_INVALID", "Reconstructs policy fields and compares digest, expiry, target, selector, and spend caps."),
    conditionNode("check_action_allowed", 1600, -180, "Action inside Visa?", "ACTION_OUTSIDE_POLICY", "Checks requested task target, selector, and value against the ENS Visa fields."),
    blockedStampNode("stamp_blocked_agent_missing", 640, 160, "AGENT_NOT_FOUND", "Passport is missing resolver or signer."),
    blockedStampNode("stamp_blocked_status_inactive", 960, 160, "STATUS_NOT_ACTIVE", "Visa status is not exactly active."),
    blockedStampNode("stamp_blocked_policy_invalid", 1280, 160, "POLICY_INVALID", "Visa digest, expiry, or policy fields are invalid."),
    blockedStampNode("stamp_blocked_action_disallowed", 1600, 160, "ACTION_OUTSIDE_POLICY", "Requested action is outside the Visa grant."),
    {
      id: "agentens_execute",
      type: "web3/write-contract",
      position: { x: 1920, y: -180 },
      capabilityStatus: "previous-live-proof-web3-write-supported",
      data: {
        label: "Execute after Passport/Visa approval",
        description:
          "Execution is reachable only from the true edge of check_action_allowed, so KeeperHub visibly blocks before any onchain write when a Passport or Visa check fails.",
        config: {
          contractAddress: input.executorAddress,
          function: "AgentEnsExecutor.execute",
          targetPolicyAddress: input.taskLogAddress,
          valueSource: "{{input.signedAgentPassportsPayload}}"
        }
      }
    }
  ];
}

function conditionNode(id: string, x: number, y: number, label: string, blockedCode: string, description: string) {
  return {
    id,
    type: "condition",
    position: { x, y },
    capabilityStatus: "template-not-live-import-proven",
    data: {
      label,
      blockedCode,
      description,
      config: {
        trueLabel: "continue",
        falseLabel: "emit blocked-stamp",
        expression: `{{checks.${id}.passed}}`
      }
    }
  };
}

function blockedStampNode(id: string, x: number, y: number, blockedCode: string, reason: string) {
  return {
    id,
    type: "stamp/blocked",
    position: { x, y },
    capabilityStatus: "template-not-live-import-proven",
    data: {
      label: `Blocked stamp: ${blockedCode}`,
      blockedCode,
      reason,
      description:
        "Terminal blocked-stamp node. It records failed node, blocked code, human reason, agent name/node, policy digest when available, and KeeperHub execution context."
    }
  };
}

function buildDirectEnsKeeperHubEdges() {
  return [
    edge("agentpassports_trigger", "ens_resolve_passport", "request"),
    edge("ens_resolve_passport", "check_agent_exists", "resolved"),
    edge("check_agent_exists", "check_status_active", "true"),
    edge("check_agent_exists", "stamp_blocked_agent_missing", "false"),
    edge("check_status_active", "check_policy_digest", "true"),
    edge("check_status_active", "stamp_blocked_status_inactive", "false"),
    edge("check_policy_digest", "check_action_allowed", "true"),
    edge("check_policy_digest", "stamp_blocked_policy_invalid", "false"),
    edge("check_action_allowed", "agentens_execute", "true"),
    edge("check_action_allowed", "stamp_blocked_action_disallowed", "false")
  ];
}

function edge(source: string, target: string, label: string) {
  return { id: `${source}__${label}__${target}`, source, target, label, data: { label } };
}

export function listKeeperHubWorkflows(config: KeeperHubApiConfig, fetchImpl: FetchLike = fetch) {
  return keeperHubRequest(config, "/api/workflows", { method: "GET" }, fetchImpl);
}

export function createKeeperHubWorkflow(config: KeeperHubApiConfig, definition: Record<string, unknown>, fetchImpl: FetchLike = fetch) {
  return keeperHubRequest(config, "/api/workflows/create", { body: JSON.stringify(definition), method: "POST" }, fetchImpl);
}

export function executeKeeperHubWorkflow(config: KeeperHubApiConfig, workflowId: string, input?: unknown, fetchImpl: FetchLike = fetch) {
  return keeperHubRequest(
    config,
    `/api/workflow/${encodeURIComponent(workflowId)}/execute`,
    { body: JSON.stringify(input ?? {}), method: "POST" },
    fetchImpl
  );
}

export function getKeeperHubExecutionStatus(config: KeeperHubApiConfig, executionId: string, fetchImpl: FetchLike = fetch) {
  return keeperHubRequest(config, `/api/workflows/executions/${encodeURIComponent(executionId)}/status`, { method: "GET" }, fetchImpl);
}

export function getKeeperHubExecutionLogs(config: KeeperHubApiConfig, executionId: string, fetchImpl: FetchLike = fetch) {
  return keeperHubRequest(config, `/api/workflows/executions/${encodeURIComponent(executionId)}/logs`, { method: "GET" }, fetchImpl);
}

export async function executeKeeperHubApprovedFlow(input: {
  executeApproved: () => Promise<unknown>;
  gateDecision: KeeperHubGateDecision;
  taskDescription: string;
}) {
  if (!input.gateDecision.allowed) {
    return {
      gateDecision: input.gateDecision,
      keeperhub: { skipped: true, reason: "AgentPassports KeeperHub Gate blocked execution before live KeeperHub API call." },
      attestation: buildRunAttestation({
        agentName: input.gateDecision.agentName,
        blockers: input.gateDecision.blockers,
        decision: "blocked",
        policyDigest: input.gateDecision.policyDigest,
        reasons: input.gateDecision.reasons,
        taskDescription: input.taskDescription
      })
    };
  }
  return input.executeApproved();
}

export function extractKeeperHubExecutionId(value: unknown): string | undefined {
  if (value && typeof value === "object" && "executionId" in value && typeof (value as any).executionId === "string") {
    return (value as any).executionId;
  }
  if (value && typeof value === "object" && "id" in value && typeof (value as any).id === "string") {
    return (value as any).id;
  }
  return undefined;
}

export function extractKeeperHubRunId(value: unknown): string | undefined {
  if (value && typeof value === "object" && "runId" in value && typeof (value as any).runId === "string") {
    return (value as any).runId;
  }
  const execution = value && typeof value === "object" && "execution" in value ? (value as any).execution : undefined;
  if (execution && typeof execution === "object" && typeof execution.runId === "string") {
    return execution.runId;
  }
  return undefined;
}

async function keeperHubRequest(config: KeeperHubApiConfig, path: string, init: RequestInit, fetchImpl: FetchLike) {
  const method = init.method ?? "GET";
  const response = await fetchImpl(`${normalizeBaseUrl(config.apiBaseUrl)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`KeeperHub API ${method} ${path} failed with HTTP ${response.status}: ${redactKeeperHubSecrets(JSON.stringify(body), config)}`);
  }
  return body;
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).toString().replace(/\/$/u, "");
}

function redactKeeperHubSecrets(message: string, config: KeeperHubApiConfig): string {
  return message.replaceAll(config.apiKey, "[redacted]");
}
