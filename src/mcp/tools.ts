import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ingest } from "../ingest.ts";
import { shapeError } from "../common/errors/shape-error.ts";
import { PROVIDERS, MEDIUM_DOMAINS } from "../../shared/providers.ts";

/**
 * MCP tool registration — two tools:
 * - ingest_article: ingest a URL into clean Markdown (auto-detect provider)
 * - list_providers: discover supported providers + example URLs
 */

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: true };

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "ingest_article",
    {
      description:
        "Ingest a blog/article/newsletter URL (Medium, Dev.to, or Substack) into clean Markdown with YAML frontmatter (title, author, dates, reading time, tags, cover image). Auto-detects provider from URL. Returns markdown text by default; pass json=true for {metadata, markdown}.",
      inputSchema: {
        url: z
          .string()
          .url()
          .describe("Article URL (medium.com, *.medium.com, publication domain, dev.to/{user}/{slug}, or {pub}.substack.com/p/{slug})"),
        provider: z
          .enum(["medium", "devto", "substack"])
          .optional()
          .describe("Override auto-detection"),
        json: z
          .boolean()
          .optional()
          .describe("Return {metadata, markdown} JSON instead of markdown text"),
      },
    },
    async (args) => {
      try {
        const result = await ingest(args.url, { provider: args.provider });
        if (args.json === true) return jsonResult(result);
        return textResult(result.markdown);
      } catch (error) {
        const shaped = shapeError(error);
        return {
          content: [{ type: "text", text: `[${shaped.code}] ${shaped.message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_providers",
    {
      description:
        "List all supported article providers with their source, example URL format, and accepted domains. Use this to discover what URLs mdingest can ingest before calling ingest_article.",
      inputSchema: {},
    },
    async () => {
      const providers = PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        source: p.source,
        example: p.example,
        acceptedDomains: p.id === "medium" ? [...MEDIUM_DOMAINS] : undefined,
      }));
      return jsonResult({ providers });
    },
  );
}
