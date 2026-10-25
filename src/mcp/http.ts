import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server.ts";

/**
 * Stateless Streamable HTTP transport — no session IDs.
 * Worker isolates are ephemeral: no state may survive a request, so the
 * transport runs with sessionIdGenerator disabled (spec-legal stateless mode).
 * The SDK requires a fresh transport + server pair per request in this mode.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createMcpServer();
  // oxlint-disable-next-line prefer-add-event-listener — SDK property API, not a DOM event
  transport.onclose = () => void server.close();
  await server.connect(transport);
  return transport.handleRequest(request);
}
