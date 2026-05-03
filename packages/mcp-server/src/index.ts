#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAgentPassportsMcpServer } from "./server.ts";

/**
 * AgentPassports stdio MCP entrypoint.
 *
 * Stdio remains useful for clients that launch MCP servers as subprocesses.
 * The HTTP entrypoint lives in http.ts for clients that connect to a deployed
 * MCP server such as https://mcp.agentpassports.xyz/mcp, or a locally hosted
 * equivalent during development.
 */
async function main() {
  await createAgentPassportsMcpServer().connect(new StdioServerTransport());
}

main().catch((error) => {
  // MCP clients read protocol messages from stdout. Keep operational errors on
  // stderr so failures do not corrupt the JSON-RPC stream.
  console.error(error);
  process.exitCode = 1;
});
