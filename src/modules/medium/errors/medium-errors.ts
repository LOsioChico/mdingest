import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";

/**
 * Medium provider domain errors.
 * Each extends the closest semantic Nest exception so the HTTP status is fixed
 * by the class hierarchy. The global exception filter shapes the response body.
 *
 * Codes are namespaced: MEDIUM.<REASON>
 */

export class MediumInvalidUrlError extends BadRequestException {
  constructor(url: string) {
    super({
      code: "MEDIUM.INVALID_URL",
      message: `Not a valid Medium URL: ${url}`,
      details: { url },
    });
  }
}

export class FreediumUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super({
      code: "MEDIUM.FREEDIUM_UNAVAILABLE",
      message: `Freedium mirror unavailable: ${reason}`,
    });
  }
}

export class MediumParseError extends BadGatewayException {
  constructor(reason: string) {
    super({
      code: "MEDIUM.PARSE_FAILED",
      message: `Failed to parse article data: ${reason}`,
    });
  }
}
