import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeEnsName } from "@agentpassport/sdk";
import { KEEPERHUB_WORKFLOW_NAME } from "./keeperhub.ts";
import type { createAgentPassportHandlers } from "./runtime.ts";

export const KEEPERHUB_GATE_RESOURCE_TEMPLATE = "agentpassport://keeperhub/{agentName}";

export function buildKeeperHubResourceGuide(agentName: string) {
  const normalizedAgentName = normalizeEnsName(agentName);
  return {
    agentName: normalizedAgentName,
    policyAuthority: "KeeperHub",
    workflowName: KEEPERHUB_WORKFLOW_NAME,
    executionMode: "thin-mcp-live-keeperhub-submit",
    liveKeeperHubSubmit: true,
    requiredToolOrder: ["build_task_intent", "submit_task", "check_task_status"],
    safetyBoundaries: [
      "MCP does not resolve ENS Passport records.",
      "MCP does not read or validate Visa policy records.",
      "MCP does not check active status, signer ownership, policy digest freshness, target, selector, value, or action limits.",
      "KeeperHub owns Passport/Visa validation and returns the success or error to the agent.",
      "Use external signing only; MCP does not read, store, or create private keys."
    ],
    signingScript: "skills/agentpassports/sign-intent.ts",
    keypairScript: "skills/agentpassports/create-key.ts"
  };
}

type AgentPassportHandlers = ReturnType<typeof createAgentPassportHandlers>;

type ResourceVariables = Record<string, string | string[]>;

/** Registers thin guidance resources. Tools remain the only execution path. */
export function registerAgentPassportResources(server: McpServer, _handlers: AgentPassportHandlers): void {
  server.registerResource(
    "agent_tasks",
    new ResourceTemplate("agentpassport://tasks/{agentName}", { list: undefined }),
    {
      description: "Task intent guidance for the thin AgentPassports MCP flow. KeeperHub performs Passport/Visa validation.",
      mimeType: "application/json",
      title: "AgentPassport task intent flow"
    },
    async (uri, variables) => {
      const agentName = normalizeEnsName(requiredVariable(variables, "agentName"));
      return jsonResource(uri, {
        agentName,
        note: "Use build_task_intent to create unsigned TaskLog intent JSON, sign locally with skills/agentpassports/sign-intent.ts, submit_task to create a KeeperHub execution, then check_task_status with the execution id for final status/logs/tx hashes.",
        policyAuthority: "KeeperHub",
        tools: ["build_task_intent", "submit_task", "check_task_status"]
      });
    }
  );

  server.registerResource(
    "keeperhub_gate",
    new ResourceTemplate(KEEPERHUB_GATE_RESOURCE_TEMPLATE, { list: undefined }),
    {
      description: "Thin AgentPassports/KeeperHub guidance: build unsigned intent, sign outside MCP, submit signed payload to KeeperHub, then check final status by execution id.",
      mimeType: "application/json",
      title: "AgentPassports KeeperHub Submit Flow"
    },
    async (uri, variables) => jsonResource(uri, buildKeeperHubResourceGuide(requiredVariable(variables, "agentName")))
  );
}

function jsonResource(uri: URL, value: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function requiredVariable(variables: ResourceVariables, name: string): string {
  const value = variables[name];
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) {
    throw new Error(`Missing resource variable ${name}`);
  }
  return first;
}
