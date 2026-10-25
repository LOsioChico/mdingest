import { describe, expect, it, vi } from "vitest";
import worker from "../worker.ts";

/**
 * /v1 routing + error-contract tests.
 * Network-touching paths (real ingest) stay out of unit scope — service specs
 * cover provider logic with mocked fetch. Here we verify routing, validation
 * shape, and the error boundary.
 */

function makeEnv(overrides?: { limited?: boolean }) {
  return {
    RATE_LIMITER: {
      limit: vi.fn(async () => ({ success: !overrides?.limited })),
    },
    ASSETS: {
      fetch: vi.fn(async () => new Response("asset-ok", { status: 200 })),
    },
  } as unknown as Env;
}

describe("GET /v1", () => {
  it("returns API info", async () => {
    const res = await worker.fetch(new Request("http://x/v1"), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      endpoints: Record<string, string>;
    };
    expect(body.name).toBe("mdingest");
    expect(body.endpoints).toMatchObject({
      medium: expect.stringContaining("/v1/medium"),
      devto: expect.stringContaining("/v1/devto"),
      substack: expect.stringContaining("/v1/substack"),
    });
  });
});

describe("GET /v1/{provider}", () => {
  it("422 VALIDATION.FAILED when url is missing", async () => {
    const res = await worker.fetch(new Request("http://x/v1/devto"), makeEnv());
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      code: string;
      traceId: string;
      details: unknown[];
    };
    expect(body.code).toBe("VALIDATION.FAILED");
    expect(body.traceId).toBeTruthy();
    expect(Array.isArray(body.details)).toBe(true);
  });

  it("422 when url belongs to a different provider", async () => {
    const res = await worker.fetch(
      new Request(
        "http://x/v1/devto?url=" +
          encodeURIComponent("https://medium.com/@u/post"),
      ),
      makeEnv(),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe(
      "VALIDATION.FAILED",
    );
  });
});

describe("routing edge cases", () => {
  it("404 NOT_FOUND on unknown /v1 path", async () => {
    const res = await worker.fetch(new Request("http://x/v1/nope"), makeEnv());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_FOUND");
  });

  it("405 on POST to a provider endpoint", async () => {
    const res = await worker.fetch(
      new Request("http://x/v1/devto?url=https://dev.to/u/post", {
        method: "POST",
      }),
      makeEnv(),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("HEAD /v1 returns 200 headers-only (uptime probes)", async () => {
    const res = await worker.fetch(
      new Request("http://x/v1", { method: "HEAD" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("HEAD /v1/{provider} validates without running the ingest", async () => {
    const ok = await worker.fetch(
      new Request("http://x/v1/devto?url=https://dev.to/u/post", {
        method: "HEAD",
      }),
      makeEnv(),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("");

    const bad = await worker.fetch(
      new Request("http://x/v1/devto", { method: "HEAD" }),
      makeEnv(),
    );
    expect(bad.status).toBe(422);
  });
});

describe("rate limiting", () => {
  it("429 RATE_LIMITED when the binding rejects", async () => {
    const res = await worker.fetch(
      new Request("http://x/v1/devto?url=https://dev.to/u/post"),
      makeEnv({ limited: true }),
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as {
      code: string;
      details: { retryAfter: number };
    };
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.details.retryAfter).toBe(60);
  });

  it("does not rate-limit non-API paths", async () => {
    const env = makeEnv({ limited: true });
    const res = await worker.fetch(new Request("http://x/favicon.svg"), env);
    expect(res.status).toBe(200);
    expect(
      (env.RATE_LIMITER as { limit: ReturnType<typeof vi.fn> }).limit,
    ).not.toHaveBeenCalled();
  });
});

describe("static site passthrough", () => {
  it("serves assets for non-API paths", async () => {
    const res = await worker.fetch(
      new Request("http://x/favicon.svg"),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("asset-ok");
  });
});
