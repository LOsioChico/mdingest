import pkg from "../../package.json" with { type: "json" };
import { ingest } from "../ingest.ts";
import { handleMcpRequest } from "../mcp/http.ts";
import {
  NotFoundError,
  ValidationError,
} from "../common/errors/ingest-error.ts";
import { MediumConvertQuerySchema } from "../modules/medium/medium.dto.ts";
import { DevtoConvertQuerySchema } from "../modules/devto/devto.dto.ts";
import { SubstackConvertQuerySchema } from "../modules/substack/substack.dto.ts";
import type { ProviderId } from "../../shared/providers.ts";
import type { ZodSchema } from "zod";

/**
 * /v1 API router — replaces the NestJS controllers.
 * Thin: match path, validate query with the provider's Zod schema,
 * delegate to ingest(), shape the response.
 */

const PROVIDER_SCHEMAS: Record<ProviderId, ZodSchema> = {
  medium: MediumConvertQuerySchema,
  devto: DevtoConvertQuerySchema,
  substack: SubstackConvertQuerySchema,
};

const sourceUrl =
  typeof pkg.repository === "object"
    ? pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")
    : "";

const apiInfo = {
  name: pkg.name,
  version: "v1",
  endpoints: {
    medium: "/v1/medium?url=article-url",
    devto: "/v1/devto?url=article-url",
    substack: "/v1/substack?url=article-url",
  },
  source: sourceUrl,
};

const headersOnly = (res: Response) =>
  new Response(null, { status: res.status, headers: res.headers });

export async function handleApi(
  request: Request,
  path: string,
): Promise<Response> {
  const head = request.method === "HEAD";

  if (path === "/v1" || path === "/v1/") {
    if (request.method !== "GET" && !head)
      return methodNotAllowed(["GET", "HEAD"]);
    const res = Response.json(apiInfo);
    return head ? headersOnly(res) : res;
  }

  if (path === "/v1/mcp") return handleMcpRequest(request);

  const provider = path.slice("/v1/".length) as ProviderId;
  const schema = PROVIDER_SCHEMAS[provider];
  if (!schema) throw new NotFoundError(path);
  if (request.method !== "GET" && !head)
    return methodNotAllowed(["GET", "HEAD"]);

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    url: url.searchParams.get("url") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) throw new ValidationError(parsed.error);
  if (head) {
    return new Response(null, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const result = await ingest(parsed.data.url, { provider });
  if (parsed.data.format === "json") {
    return Response.json({
      metadata: result.metadata,
      markdown: result.markdown,
    });
  }
  return new Response(result.markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

function methodNotAllowed(allow: string[]): Response {
  return Response.json(
    { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
    { status: 405, headers: { Allow: allow.join(", ") } },
  );
}
