#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAgentPassportsMcpServer } from "./server.ts";

/**
 * AgentPassports stdio MCP entrypoint.
 *
 * Stdio remains useful for clients that launch MCP servers as subprocesses.
 * The localhost HTTP entrypoint lives in http.ts for clients that connect to an
 * already-running MCP server at http://127.0.0.1:3333/mcp.
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
