import { IngestError } from "../../../common/errors/ingest-error.ts";

/**
 * Substack provider domain errors.
 * httpStatus carries the former HTTP exception mapping (400/403/502/503).
 * Codes are namespaced: SUBSTACK.<REASON>
 */

export class SubstackInvalidUrlError extends IngestError {
  constructor(url: string) {
    super(400, "SUBSTACK.INVALID_URL", `Not a valid Substack URL: ${url}`, {
      url,
    });
    this.name = "SubstackInvalidUrlError";
  }
}

export class SubstackPaidPostError extends IngestError {
  constructor(url: string) {
    super(
      403,
      "SUBSTACK.PAID_POST",
      "This post is behind a paywall. Only free posts can be converted.",
      { url },
    );
    this.name = "SubstackPaidPostError";
  }
}

export class SubstackUnavailableError extends IngestError {
  constructor(reason: string) {
    super(503, "SUBSTACK.UNAVAILABLE", `Substack API unavailable: ${reason}`);
    this.name = "SubstackUnavailableError";
  }
}

export class SubstackParseError extends IngestError {
  constructor(reason: string) {
    super(
      502,
      "SUBSTACK.PARSE_FAILED",
      `Failed to parse Substack article: ${reason}`,
    );
    this.name = "SubstackParseError";
  }
}
