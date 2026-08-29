import { defineCommand, runMain } from "citty";
import { Logger } from "@nestjs/common";
import { ingest } from "./ingest.ts";
import { shapeError } from "./common/errors/shape-error.ts";
import { PROVIDERS, MEDIUM_DOMAINS } from "../shared/providers.ts";

/**
 * mdingest CLI — ingest articles to clean Markdown from the terminal.
 *
 * Usage:
 *   mdingest <url>              # markdown to stdout
 *   mdingest <url> --json       # {metadata, markdown} JSON to stdout
 *   mdingest <url> --provider medium  # override auto-detection
 *   mdingest providers          # list supported providers
 *   mdingest mcp                # start MCP server over stdio
 *
 * Pipe-friendly:  mdingest https://dev.to/user/post > article.md
 */

// Silence @nestjs/common Logger BEFORE any service import.
// Services use Logger.log() which writes to stdout — would corrupt
// piped output (mdingest URL > out.md) and MCP stdio transport.
Logger.overrideLogger(false);

const main = defineCommand({
  meta: {
    name: "mdingest",
    description: "Ingest blog/article/newsletter URLs to clean Markdown for LLM consumption",
    version: "0.0.1",
  },
  args: {
    url: { type: "positional", description: "Article URL, or subcommand: 'mcp' (MCP server), 'providers' (list supported)", required: false },
    provider: { type: "string", description: "Override provider auto-detection: medium, devto, or substack" },
    json: { type: "boolean", description: "Output {metadata, markdown} JSON instead of markdown" },
  },
  run: async (ctx) => {
    const url = ctx.args.url as string | undefined;

    // Route "mcp" to the MCP server instead of treating it as a URL
    if (url === "mcp") {
      const { startMcpServer } = await import("./mcp/server.ts");
      await startMcpServer();
      return;
    }

    // Route "providers" to the provider listing
    if (url === "providers") {
      for (const p of PROVIDERS) {
        const domains = p.id === "medium" ? ` (${MEDIUM_DOMAINS.size} domains)` : "";
        console.log(`${p.label.padEnd(12)} ${p.source.padEnd(16)} ${p.example}${domains}`);
      }
      return;
    }

    if (!url) {
      console.error("Error: URL is required. Usage: mdingest <url>  |  mdingest mcp");
      process.exit(1);
    }

    const provider = ctx.args.provider as "medium" | "devto" | "substack" | undefined;

    try {
      const result = await ingest(url, { provider });

      if (ctx.args.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.markdown);
      }
    } catch (error) {
      const shaped = shapeError(error);
      console.error(`Error [${shaped.code}]: ${shaped.message}`);
      process.exit(1);
    }
  },
});

runMain(main);
