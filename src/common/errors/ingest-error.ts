import type { ZodError } from "zod";

/**
 * Framework-free typed error — the single error base for the codebase.
 * Carries an HTTP status so the Worker can map it to a Response;
 * CLI and MCP only read code/message/details via shapeError().
 */
export class IngestError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

/** 422 — request input failed a Zod schema. */
export class ValidationError extends IngestError {
  constructor(zodError: ZodError) {
    super(
      422,
      "VALIDATION.FAILED",
      "Request validation failed.",
      zodError.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
    this.name = "ValidationError";
  }
}

/** Format Zod issues as "path: message" pairs — used in typed error reasons. */
export function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/** 429 — the rate-limit binding rejected the request. Window is fixed at 60s. */
export class RateLimitedError extends IngestError {
  constructor() {
    super(429, "RATE_LIMITED", "Rate limit exceeded. Try again in a minute.", {
      retryAfter: 60,
    });
    this.name = "RateLimitedError";
  }
}

/** 404 — route not found. */
export class NotFoundError extends IngestError {
  constructor(path: string) {
    super(404, "NOT_FOUND", `Not found: ${path}`);
    this.name = "NotFoundError";
  }
}
