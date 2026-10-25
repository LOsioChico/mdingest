import { handleApi } from "./http/api.ts";
import { serveSite } from "./http/llm-visibility.ts";
import { IngestError, RateLimitedError } from "./common/errors/ingest-error.ts";
import { shapeError } from "./common/errors/shape-error.ts";

/**
 * Worker entrypoint — the only HTTP layer (containers removed).
 * /v1/*  → API router (rate-limited via the native binding)
 * else   → ASSETS binding + Accept: text/markdown negotiation
 * Every error is shaped to the standard contract { code, message, details?, traceId }.
 */

async function checkRateLimit(request: Request, env: Env): Promise<void> {
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.RATE_LIMITER.limit({ key });
  if (!success) throw new RateLimitedError();
}

function errorResponse(error: unknown): Response {
  const shaped = shapeError(error);
  const status = error instanceof IngestError ? error.httpStatus : 500;
  if (status >= 500) {
    console.error(
      "Unhandled error:",
      error instanceof Error ? error.stack : error,
    );
  }
  return Response.json({ ...shaped, traceId: crypto.randomUUID() }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path === "/v1" || path.startsWith("/v1/")) {
        await checkRateLimit(request, env);
        return await handleApi(request, path);
      }
      return await serveSite(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
