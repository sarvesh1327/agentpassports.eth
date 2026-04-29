#!/usr/bin/env node
import "dotenv/config";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAgentPassportsMcpServer } from "./server.ts";

const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.MCP_PORT ?? "3333");
const PATHNAME = "/mcp";

/**
 * Localhost Streamable HTTP MCP entrypoint.
 *
 * This is the current local hosted endpoint for agents that connect to an
 * already-running MCP server instead of spawning the stdio command. The server
 * binds to 127.0.0.1 by default so chain configuration and relayer settings stay
 * on the operator-controlled MCP process rather than in the agent prompt.
 */
async function main() {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await createAgentPassportsMcpServer().connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (!req.url?.startsWith(PATHNAME)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found", mcpEndpoint: `http://${HOST}:${PORT}${PATHNAME}` }));
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ error: "MCP request failed" }));
    }
  });

  httpServer.listen(PORT, HOST, () => {
    console.error(`AgentPassports MCP server listening at http://${HOST}:${PORT}${PATHNAME}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
