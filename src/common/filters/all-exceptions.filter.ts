import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";

/**
 * Global exception filter.
 * Shapes every error into the standard contract:
 *   { code, message, details?, traceId }
 *
 * - HttpException: use the embedded status + code + message + details
 * - Everything else: 500 with code INTERNAL.ERROR
 * - traceId is generated per error and logged for correlation
 */

interface StandardErrorBody {
  code: string;
  message: string;
  details?: unknown;
  traceId: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const traceId = (request.id as string | undefined) ?? randomUUID();

    let status: number;
    let body: StandardErrorBody;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      // Our typed errors pass an object: { code, message, details? }
      if (typeof response === "object" && response !== null) {
        const r = response as Record<string, unknown>;
        body = {
          code: (r.code as string) ?? "INTERNAL.ERROR",
          message: (r.message as string) ?? exception.message,
          details: r.details,
          traceId,
        };
      } else {
        body = {
          code: "INTERNAL.ERROR",
          message: typeof response === "string" ? response : exception.message,
          traceId,
        };
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        exception instanceof Error ? exception.message : "Internal server error";
      body = { code: "INTERNAL.ERROR", message, traceId };

      // Log 5xx with stack
      this.logger.error(`[${traceId}] ${message}`, exception instanceof Error ? exception.stack : undefined);
    }

    // Log 4xx only at debug (expected client errors)
    if (status < 500) {
      this.logger.debug(`[${traceId}] ${body.code}: ${body.message}`);
    }

    reply.status(status).header("Content-Type", "application/json").send(body);
  }
}
