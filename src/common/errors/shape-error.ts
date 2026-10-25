import { IngestError } from "./ingest-error.ts";

/**
 * Shape any error into the standard contract: { code, message, details? }.
 * Shared by the Worker error boundary, CLI, and MCP — one source of truth.
 */
export interface ShapedError {
  code: string;
  message: string;
  details?: unknown;
}

export function shapeError(error: unknown): ShapedError {
  if (error instanceof IngestError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: "INTERNAL.ERROR",
    message: error instanceof Error ? error.message : "Internal server error",
  };
}
