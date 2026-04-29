#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAgentPassportHandlers, loadMcpConfig } from "./runtime.ts";
import { AGENTPASSPORT_MCP_TOOLS, type AgentPassportToolName } from "./tools.ts";

/**
 * AgentPassports MCP server.
 *
 * The server intentionally uses stdio transport because it is the most portable
 * MCP mode for local autonomous agents: Claude Desktop, CLI agents, and other
 * MCP clients can launch this package as a subprocess without exposing an HTTP
 * port or browser-accessible secret material.
 */
async function main() {
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

  await server.connect(new StdioServerTransport());
}

/** Formats arbitrary handler data as a JSON text result for MCP clients. */
function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

main().catch((error) => {
  // MCP clients read protocol messages from stdout. Keep operational errors on
  // stderr so failures do not corrupt the JSON-RPC stream.
  console.error(error);
  process.exitCode = 1;
});
