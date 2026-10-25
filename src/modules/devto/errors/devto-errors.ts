import { IngestError } from "../../../common/errors/ingest-error.ts";

/**
 * Dev.to provider domain errors.
 * httpStatus carries the former HTTP exception mapping (400/502/503).
 * Codes are namespaced: DEVTO.<REASON>
 */

export class DevtoInvalidUrlError extends IngestError {
  constructor(url: string) {
    super(400, "DEVTO.INVALID_URL", `Not a valid Dev.to URL: ${url}`, { url });
    this.name = "DevtoInvalidUrlError";
  }
}

export class DevtoUnavailableError extends IngestError {
  constructor(reason: string) {
    super(503, "DEVTO.UNAVAILABLE", `Dev.to API unavailable: ${reason}`);
    this.name = "DevtoUnavailableError";
  }
}

export class DevtoParseError extends IngestError {
  constructor(reason: string) {
    super(
      502,
      "DEVTO.PARSE_FAILED",
      `Failed to parse Dev.to article: ${reason}`,
    );
    this.name = "DevtoParseError";
  }
}
