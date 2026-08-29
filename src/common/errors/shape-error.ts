import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Shape any error into the standard contract: { code, message, details? }.
 * Shared by AllExceptionsFilter (HTTP), CLI, and MCP — one source of truth.
 *
 * - HttpException: extract code/message/details from getResponse()
 * - Everything else: INTERNAL.ERROR with the error message
 */

export interface ShapedError {
  code: string;
  message: string;
  details?: unknown;
}

export function shapeError(error: unknown): ShapedError {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = error.getResponse();

    // Our typed errors pass an object: { code, message, details? }
    if (typeof response === "object" && response !== null) {
      const r = response as Record<string, unknown>;
      const fallbackCode = status === HttpStatus.NOT_FOUND
        ? "NOT_FOUND"
        : "INTERNAL.ERROR";
      return {
        code: (r.code as string) ?? fallbackCode,
        message: (r.message as string) ?? error.message,
        details: r.details,
      };
    }

    const code = status === HttpStatus.NOT_FOUND ? "NOT_FOUND" : "INTERNAL.ERROR";
    return {
      code,
      message: typeof response === "string" ? response : error.message,
    };
  }

  return {
    code: "INTERNAL.ERROR",
    message: error instanceof Error ? error.message : "Internal server error",
  };
}
