import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * LLM visibility hook for Fastify.
 *
 * Implements Accept: text/markdown content negotiation, Link headers,
 * and Vary: Accept for the static Astro site served by @fastify/static.
 *
 * Companion to the Evil Martians llms-visibility techniques:
 * https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms
 */

interface AcceptEntry {
  type: string;
  q: number;
}

function parseAccept(accept: string): AcceptEntry[] {
  if (!accept.trim()) return [{ type: "*/*", q: 1 }];
  return accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const [type = "", ...params] = item.split(";").map((s) => s.trim());
      let q = 1;
      for (const p of params) {
        const eq = p.indexOf("=");
        if (eq < 0 || p.slice(0, eq).trim().toLowerCase() !== "q") continue;
        const n = parseFloat(p.slice(eq + 1));
        if (Number.isFinite(n)) q = n;
      }
      return { type: type.toLowerCase(), q };
    });
}

function qualityFor(entries: AcceptEntry[], candidate: string): number {
  const [primary] = candidate.split("/");
  let bestSpec = -1;
  let bestQ = 0;
  for (const { type, q } of entries) {
    const spec =
      type === candidate ? 3 :
      type === `${primary}/*` ? 2 :
      type === "*/*" ? 1 : -1;
    if (spec < 0) continue;
    if (spec > bestSpec || (spec === bestSpec && q > bestQ)) {
      bestSpec = spec;
      bestQ = q;
    }
  }
  return bestQ;
}

function hasExplicitType(entries: AcceptEntry[], candidate: string): boolean {
  return entries.some((e) => e.type === candidate && e.q > 0);
}

function toMdPath(htmlPath: string): string {
  const clean = htmlPath.replace(/\/$/, "");
  return clean === "" ? "/index.md" : `${clean}.md`;
}

function toHtmlPath(mdPath: string): string {
  return mdPath.replace(/\.md$/, "").replace(/^\/index$/, "/");
}

/**
 * Create a Fastify preHandler hook for LLM content negotiation.
 * @param webDist — absolute path to the Astro build output (web/dist)
 */
export function createLlmVisibilityHook(webDist: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const path = url.pathname;

    // Skip API routes and static assets
    if (path.startsWith("/v1/") || path.startsWith("/_astro/")) return;
    if (path.includes("/icons/") || path.endsWith(".svg") || path.endsWith(".css") || path.endsWith(".js")) return;
    // Skip .well-known — these are machine-readable endpoints, not HTML pages
    // Exception: api-catalog has no extension, @fastify/static won't set the right
    // Content-Type, so we serve it here with application/linkset+json (RFC 9727)
    if (path.startsWith("/.well-known/")) {
      if (path === "/.well-known/api-catalog") {
        const catalogFile = join(webDist, ".well-known", "api-catalog");
        if (existsSync(catalogFile)) {
          const content = await readFile(catalogFile, "utf-8");
          reply.header("Content-Type", "application/linkset+json; charset=utf-8");
          return reply.send(content);
        }
      }
      return;
    }

    const isMdUrl = path.endsWith(".md");

    // Handle direct .md URL requests
    if (isMdUrl) {
      const mdFile = join(webDist, path);
      if (existsSync(mdFile)) {
        const content = await readFile(mdFile, "utf-8");
        const htmlPath = toHtmlPath(path);
        reply.header("Content-Type", "text/markdown; charset=utf-8");
        reply.header("Vary", "Accept");
        reply.header("Link", `<${htmlPath}>; rel="alternate"; type="text/html"`);
        return reply.send(content);
      }
      return; // 404 from @fastify/static
    }

    // Content negotiation for HTML pages
    // Only apply to paths that have a corresponding .md file (the 3 web pages)
    const accept = parseAccept(request.headers.accept ?? "");
    const mdQ = qualityFor(accept, "text/markdown");
    const htmlQ = qualityFor(accept, "text/html");
    const mdPath = toMdPath(path);

    // If no .md file exists for this path, skip negotiation — let @fastify/static handle it
    if (!existsSync(join(webDist, mdPath))) return;

    // 406 if neither is acceptable (and no wildcard)
    if (mdQ === 0 && htmlQ === 0 && !accept.some((e) => e.type === "*/*")) {
      reply.header("Vary", "Accept");
      reply.header(
        "Link",
        `<${path}>; rel="alternate"; type="text/html", <${mdPath}>; rel="alternate"; type="text/markdown"`,
      );
      reply.code(406);
      return reply.send("Not Acceptable");
    }

    // Set Vary and Link on all HTML responses
    reply.header("Vary", "Accept");
    reply.header(
      "Link",
      `<${mdPath}>; rel="alternate"; type="text/markdown", </.well-known/api-catalog>; rel="api-catalog"`,
    );

    // Serve markdown if explicitly requested and preferred (or tied)
    if (hasExplicitType(accept, "text/markdown") && mdQ >= htmlQ) {
      const mdFile = join(webDist, mdPath);
      if (existsSync(mdFile)) {
        const content = await readFile(mdFile, "utf-8");
        reply.header("Content-Type", "text/markdown; charset=utf-8");
        reply.header("Link", `<${path}>; rel="alternate"; type="text/html"`);
        return reply.send(content);
      }
    }

    // Fall through to @fastify/static for HTML
  };
}
