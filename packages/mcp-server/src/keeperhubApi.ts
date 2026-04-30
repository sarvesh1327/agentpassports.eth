import { buildRunAttestation, type KeeperHubGateDecision } from "./keeperhub.ts";

export type KeeperHubApiConfig = {
  apiBaseUrl: string;
  apiKey: string;
  defaultWorkflowId?: string;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type WorkflowDefinitionInput = {
  description?: string;
  name?: string;
};

const DEFAULT_KEEPERHUB_API_BASE_URL = "https://app.keeperhub.com";

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
 * Builds the exact workflow shape verified live against KeeperHub:
 * name + nodes + edges are mandatory. This payload contains only public workflow
 * structure and descriptions, never API keys, wallet addresses, signatures, or
 * private-key material.
 */
export function buildAgentPassportsKeeperHubWorkflowDefinition(input: WorkflowDefinitionInput = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    name: input.name ?? `AgentPassports V3 KeeperHub Gate ${timestamp}`,
    description:
      input.description ??
      "AgentPassports V3 live integration workflow created by Hermes/JCode. Gate is enforced by AgentPassports before KeeperHub execution; payload contains no secrets.",
    nodes: [
      {
        id: "agentpassports_gate_trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          type: "trigger",
          label: "AgentPassports Gate Trigger",
          config: { triggerType: "Manual" },
          status: "idle",
          description: "Manual trigger for an AgentPassports-approved KeeperHub payload"
        }
      }
    ],
    edges: []
  };
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
