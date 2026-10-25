import { IngestError } from "../../../common/errors/ingest-error.ts";

/**
 * Medium provider domain errors (Freedium errors included — the provider
 * surfaces them under the MEDIUM.* namespace).
 * httpStatus carries the former HTTP exception mapping (400/502/503).
 * Codes are namespaced: MEDIUM.<REASON>
 */

export class MediumInvalidUrlError extends IngestError {
  constructor(url: string) {
    super(400, "MEDIUM.INVALID_URL", `Not a valid Medium URL: ${url}`, { url });
    this.name = "MediumInvalidUrlError";
  }
}

export class FreediumUnavailableError extends IngestError {
  constructor(reason: string) {
    super(
      503,
      "MEDIUM.FREEDIUM_UNAVAILABLE",
      `Freedium mirror unavailable: ${reason}`,
    );
    this.name = "FreediumUnavailableError";
  }
}

export class MediumParseError extends IngestError {
  constructor(reason: string) {
    super(
      502,
      "MEDIUM.PARSE_FAILED",
      `Failed to parse article data: ${reason}`,
    );
    this.name = "MediumParseError";
  }
}
