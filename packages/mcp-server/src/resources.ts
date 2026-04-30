import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeEnsName } from "@agentpassport/sdk";
import { KEEPERHUB_WORKFLOW_NAME } from "./keeperhub.ts";
import type { createAgentPassportHandlers } from "./runtime.ts";

export const KEEPERHUB_GATE_RESOURCE_TEMPLATE = "agentpassport://keeperhub/{agentName}";

export function buildKeeperHubResourceGuide(agentName: string) {
  const normalizedAgentName = normalizeEnsName(agentName);
  return {
    agentName: normalizedAgentName,
    policySource: "ENS",
    workflowName: KEEPERHUB_WORKFLOW_NAME,
    executionMode: "exportable-action-pack",
    liveKeeperHubSubmit: false,
    requiredToolOrder: [
      "resolve_agent_passport",
      "keeperhub_validate_agent_task",
      "keeperhub_build_workflow_payload",
      "keeperhub_emit_run_attestation"
    ],
    safetyBoundaries: [
      "Resolve live ENS records before every KeeperHub workflow.",
      "Return blocked decisions for inactive status, policy digest mismatch, task-policy failures, or trust threshold failures.",
      "Use external signing only; MCP does not read or store private keys.",
      "No live KeeperHub API call is made by this resource or by the current action-pack export path.",
      "Uniswap remains experimental and full gasless sponsored swaps are frozen."
    ],
    workflowActionPack: "packages/mcp-server/keeperhub/action-pack.md",
    workflowTemplate: "packages/mcp-server/keeperhub/workflow-template.json",
    runAttestationSchema: {
      schema: "agentpassport.keeperhubRunAttestation.v1",
      required: ["schema", "agentName", "decision", "taskHash", "policyDigest", "reasons", "blockers", "createdAt"],
      optional: ["keeperhubRunId", "txHash"]
    }
  };
}

type AgentPassportHandlers = ReturnType<typeof createAgentPassportHandlers>;

type ResourceVariables = Record<string, string | string[]>;

/**
 * Registers the V1 AgentPassports resource templates. Resources are read-only
 * convenience views over the same live ENS-backed handlers used by tools, so an
 * MCP client can inspect passport/policy/task context without introducing a
 * second data model.
 */
export function registerAgentPassportResources(server: McpServer, handlers: AgentPassportHandlers): void {
  server.registerResource(
    "agent_passport",
    new ResourceTemplate("agentpassport://agent/{agentName}", { list: undefined }),
    {
      description: "Live AgentPassport ENS identity, resolver, addr(agent), nonce, gas budget, and text records for one agent.",
      mimeType: "application/json",
      title: "AgentPassport identity"
    },
    async (uri, variables) => jsonResource(uri, await handlers.resolve_agent_passport({ agentName: requiredVariable(variables, "agentName") } as never))
  );

  server.registerResource(
    "owner_agents",
    new ResourceTemplate("agentpassport://owner/{ownerName}/agents", { list: undefined }),
    {
      description: "Owner ENS multi-agent index derived from agentpassports.agents and resolved against live ENS.",
      mimeType: "application/json",
      title: "Owner AgentPassports"
    },
    async (uri, variables) => jsonResource(uri, await handlers.list_owner_agents({ ownerName: requiredVariable(variables, "ownerName") } as never))
  );

  server.registerResource(
    "agent_policy",
    new ResourceTemplate("agentpassport://policy/{agentName}", { list: undefined }),
    {
      description: "Live ENS policy snapshot and digest for one AgentPassport. Policy source: ENS.",
      mimeType: "application/json",
      title: "AgentPassport policy"
    },
    async (uri, variables) => jsonResource(uri, await handlers.get_agent_policy({ agentName: requiredVariable(variables, "agentName") } as never))
  );

  server.registerResource(
    "agent_tasks",
    new ResourceTemplate("agentpassport://tasks/{agentName}", { list: undefined }),
    {
      description: "Task resource guidance for an AgentPassport. V1 task history is TaskLog/relayer-backed, not private-key-backed MCP state.",
      mimeType: "application/json",
      title: "AgentPassport tasks"
    },
    async (uri, variables) => {
      const agentName = normalizeEnsName(requiredVariable(variables, "agentName"));
      return jsonResource(uri, {
        agentName,
        note: "Use build_task_intent to create a new unsigned TaskLog intent, sign locally with the skill-provided sign-intent.ts script, then submit_task. Historical proofs are emitted by TaskLog and surfaced by the web task history APIs.",
        policySource: "ENS",
        tools: ["check_task_against_policy", "build_task_intent", "submit_task"]
      });
    }
  );

  server.registerResource(
    "keeperhub_gate",
    new ResourceTemplate(KEEPERHUB_GATE_RESOURCE_TEMPLATE, { list: undefined }),
    {
      description: "V3 KeeperHub Gate action-pack guidance for one ENS AgentPassport, including tool order, safety boundaries, workflow artifact paths, and run attestation schema.",
      mimeType: "application/json",
      title: "AgentPassports KeeperHub Gate"
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
