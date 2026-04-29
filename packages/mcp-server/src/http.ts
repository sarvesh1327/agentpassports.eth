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
  const httpServer = createServer(async (req, res) => {
    if (!req.url?.startsWith(PATHNAME)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found", mcpEndpoint: `http://${HOST}:${PORT}${PATHNAME}` }));
      return;
    }

    try {
      // In stateless mode the current MCP SDK requires a fresh transport per
      // request. Reusing one transport works for initialize, then fails later
      // requests such as tools/list with an HTTP 500.
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await createAgentPassportsMcpServer().connect(transport);
      const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
      await transport.handleRequest(req, res, parsedBody);
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

/**
 * The Node streamable HTTP adapter accepts an optional pre-parsed body. Passing
 * it explicitly keeps MCP clients such as mcporter compatible with the current
 * SDK and avoids 500s caused by an unconsumed IncomingMessage body.
 */
async function readJsonBody(req: Parameters<StreamableHTTPServerTransport["handleRequest"]>[0]): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : undefined;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
