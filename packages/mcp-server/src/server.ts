import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAgentPassportPrompts } from "./prompts.ts";
import { registerAgentPassportResources } from "./resources.ts";
import { createAgentPassportHandlers, loadMcpConfig } from "./runtime.ts";
import { AGENTPASSPORT_MCP_TOOLS, type AgentPassportToolName } from "./tools.ts";

/**
 * Creates an AgentPassports MCP server with every tool registered.
 *
 * Keeping registration in one helper prevents the stdio and localhost HTTP
 * transports from drifting. Transport entrypoints should only decide how MCP
 * messages move, not which AgentPassports tools exist.
 */
export function createAgentPassportsMcpServer() {
  const server = new McpServer({
    name: "agentpassports",
    version: "0.1.0"
  });
  const handlers = createAgentPassportHandlers(loadMcpConfig());

  for (const tool of AGENTPASSPORT_MCP_TOOLS) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputShape,
      async (args) => jsonToolResult(await handlers[tool.name as AgentPassportToolName](args as never))
    );
  }

  registerAgentPassportResources(server, handlers);
  registerAgentPassportPrompts(server);

  return server;
}

/** Formats arbitrary handler data as a JSON text result for MCP clients. */
export function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        // MCP tool responses are JSON text so agents can save, inspect, and feed
        // exact payloads into local signing scripts. Some viem/EIP-712 helpers
        // keep chain ids, nonces, and expiries as bigint values, which native
        // JSON.stringify cannot encode. Convert them at the final MCP boundary
        // so individual handlers can keep using type-safe bigint internally.
        text: JSON.stringify(value, bigintJsonReplacer, 2)
      }
    ]
  };
}

function bigintJsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
