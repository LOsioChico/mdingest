import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.ts";

/**
 * Start the MCP server over stdio — used by `mdingest mcp` (local process).
 * Logs must never hit stdout: they would corrupt the JSON-RPC transport.
 */
export async function startMcpServer(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport());
}
