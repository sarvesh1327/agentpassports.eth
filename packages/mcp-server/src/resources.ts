import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeEnsName } from "@agentpassport/sdk";
import type { createAgentPassportHandlers } from "./runtime.ts";

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
