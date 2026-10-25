/**
 * LLM visibility + static-site serving on the ASSETS binding.
 * Ports the former @fastify/static + preHandler hook: Accept: text/markdown
 * negotiation, Link headers, Vary, 406 — same semantics, no filesystem.
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

function withHeaders(res: Response, extra: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(res.body, { status: res.status, headers });
}

const STATIC_EXTENSIONS = /\.(css|js|svg|png|jpe?g|webp|ico|txt|xml|woff2?|map|json)$/i;

export async function serveSite(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

  // Static assets and machine files — straight pass-through
  if (path.startsWith("/_astro/") || path.includes("/icons/") || STATIC_EXTENSIONS.test(path)) {
    return env.ASSETS.fetch(request);
  }

  // .well-known — machine-readable endpoints. api-catalog needs an explicit
  // linkset Content-Type because it has no file extension.
  if (path.startsWith("/.well-known/")) {
    const res = await env.ASSETS.fetch(request);
    if (path === "/.well-known/api-catalog" && res.ok) {
      return withHeaders(res, { "Content-Type": "application/linkset+json; charset=utf-8" });
    }
    return res;
  }

  // Direct .md twin requests
  if (path.endsWith(".md")) {
    const res = await env.ASSETS.fetch(request);
    if (!res.ok) return res;
    return withHeaders(res, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      "Link": `<${toHtmlPath(path)}>; rel="alternate"; type="text/html"`,
    });
  }

  // File-like paths without a page twin — pass through
  if (path.includes(".")) return env.ASSETS.fetch(request);

  // HTML page — check for an .md twin before negotiating
  const mdPath = toMdPath(path);
  const mdProbe = await env.ASSETS.fetch(new URL(mdPath, request.url));
  if (!mdProbe.ok) return env.ASSETS.fetch(request);

  const accept = parseAccept(request.headers.get("accept") ?? "");
  const mdQ = qualityFor(accept, "text/markdown");
  const htmlQ = qualityFor(accept, "text/html");

  const link = `<${path}>; rel="alternate"; type="text/html", <${mdPath}>; rel="alternate"; type="text/markdown"`;

  // 406 if neither representation is acceptable (and no wildcard)
  if (mdQ === 0 && htmlQ === 0 && !accept.some((e) => e.type === "*/*")) {
    return new Response("Not Acceptable", {
      status: 406,
      headers: { "Vary": "Accept", "Link": link },
    });
  }

  // Markdown explicitly requested and preferred (or tied)
  if (hasExplicitType(accept, "text/markdown") && mdQ >= htmlQ) {
    return withHeaders(mdProbe, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      "Link": `<${path}>; rel="alternate"; type="text/html"`,
    });
  }

  // Default: HTML page with discovery headers
  const htmlRes = await env.ASSETS.fetch(request);
  return withHeaders(htmlRes, {
    "Vary": "Accept",
    "Link": `<${mdPath}>; rel="alternate"; type="text/markdown", </.well-known/api-catalog>; rel="api-catalog"`,
  });
}
