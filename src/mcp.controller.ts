import { All, Controller, Req, Res } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { handleHttpRequest } from "./mcp/server.ts";

/**
 * MCP HTTP endpoint — Streamable HTTP transport at /v1/mcp.
 * Same tools (ingest_article, list_providers) as the stdio transport.
 *
 * Register in your MCP client:
 *   { "url": "https://mdingest.knightker.workers.dev/v1/mcp" }
 */
@Controller("mcp")
export class McpController {
  @All()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const url = `${req.protocol}://${req.host}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }
    const body = req.method === "POST" && req.body ? JSON.stringify(req.body) : undefined;
    const request = new Request(url, { method: req.method, headers, body });

    const response = await handleHttpRequest(request);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    reply.raw.writeHead(response.status, responseHeaders);

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        // oxlint-disable-next-line no-await-in-loop — stream reading is sequential
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }
    }
    reply.raw.end();
  }
}
