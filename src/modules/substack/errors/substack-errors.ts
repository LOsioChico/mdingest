import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";

/**
 * Substack provider domain errors.
 * Each extends the closest semantic Nest exception so the HTTP status is fixed
 * by the class hierarchy. The global exception filter shapes the response body.
 *
 * Codes are namespaced: SUBSTACK.<REASON>
 */

export class SubstackInvalidUrlError extends BadRequestException {
  constructor(url: string) {
    super({
      code: "SUBSTACK.INVALID_URL",
      message: `Not a valid Substack URL: ${url}`,
      details: { url },
    });
  }
}

export class SubstackPaidPostError extends ForbiddenException {
  constructor(url: string) {
    super({
      code: "SUBSTACK.PAID_POST",
      message: "This post is behind a paywall. Only free posts can be converted.",
      details: { url },
    });
  }
}

export class SubstackUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super({
      code: "SUBSTACK.UNAVAILABLE",
      message: `Substack API unavailable: ${reason}`,
    });
  }
}

export class SubstackParseError extends BadGatewayException {
  constructor(reason: string) {
    super({
      code: "SUBSTACK.PARSE_FAILED",
      message: `Failed to parse Substack article: ${reason}`,
    });
  }
}
