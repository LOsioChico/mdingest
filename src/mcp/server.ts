import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.ts";

/**
 * MCP server factory for AI tools (Claude, Cursor, etc.).
 * Wraps the same ingest() router used by the CLI — no logic duplication.
 *
 * Two transports:
 * - stdio: `bun run src/cli.ts mcp` (local process, src/mcp/stdio.ts)
 * - HTTP:  `ALL /v1/mcp` on the deployed Worker (src/mcp/http.ts, stateless)
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "mdingest", version: "0.0.1" });
  registerTools(server);
  return server;
}
