import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";

/**
 * Dev.to provider domain errors.
 * Each extends the closest semantic Nest exception so the HTTP status is fixed
 * by the class hierarchy. The global exception filter shapes the response body.
 *
 * Codes are namespaced: DEVTO.<REASON>
 */

export class DevtoInvalidUrlError extends BadRequestException {
  constructor(url: string) {
    super({
      code: "DEVTO.INVALID_URL",
      message: `Not a valid Dev.to URL: ${url}`,
      details: { url },
    });
  }
}

export class DevtoUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super({
      code: "DEVTO.UNAVAILABLE",
      message: `Dev.to API unavailable: ${reason}`,
    });
  }
}

export class DevtoParseError extends BadGatewayException {
  constructor(reason: string) {
    super({
      code: "DEVTO.PARSE_FAILED",
      message: `Failed to parse Dev.to article: ${reason}`,
    });
  }
}
