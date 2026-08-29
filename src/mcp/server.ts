import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./tools.ts";

/**
 * MCP server for AI tools (Claude, Cursor, etc.).
 * Wraps the same ingest() router used by the CLI — no logic duplication.
 *
 * Two transports:
 * - stdio: `bun run src/cli.ts mcp` (local process)
 * - HTTP:  `GET/POST /v1/mcp` on the deployed API (remote, zero local setup)
 */

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "mdingest", version: "0.0.1" });
  registerTools(server);
  return server;
}

export async function startMcpServer(): Promise<void> {
  // Silence @nestjs/common Logger — it writes to stdout, which would
  // corrupt the stdio JSON-RPC transport used by MCP.
  Logger.overrideLogger(false);
  await createMcpServer().connect(new StdioServerTransport());
}

// Lazy-initialized HTTP transport — created on first request to /v1/mcp.
let httpTransport: WebStandardStreamableHTTPServerTransport | null = null;

/**
 * Handle an MCP request over HTTP (Streamable HTTP transport).
 * Lazy-initializes the transport + server on first call.
 * Stateful mode with session IDs for max client compatibility.
 */
export async function handleHttpRequest(request: Request): Promise<Response> {
  if (!httpTransport) {
    httpTransport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await createMcpServer().connect(httpTransport);
  }
  return httpTransport.handleRequest(request);
}
