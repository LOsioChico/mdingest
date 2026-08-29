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
import { shapeError, type ShapedError } from "../errors/shape-error.ts";

/**
 * Global exception filter.
 * Shapes every error into the standard contract:
 *   { code, message, details?, traceId }
 *
 * Delegates error→{code, message, details?} mapping to shapeError()
 * (shared with CLI + MCP). This filter adds traceId, HTTP status, and logging.
 */

interface StandardErrorBody extends ShapedError {
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

    const shaped = shapeError(exception);
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: StandardErrorBody = { ...shaped, traceId };

    // Log 5xx with stack
    if (status >= 500) {
      this.logger.error(
        `[${traceId}] ${shaped.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      // Log 4xx only at debug (expected client errors)
      this.logger.debug(`[${traceId}] ${shaped.code}: ${shaped.message}`);
    }

    reply.status(status).header("Content-Type", "application/json").send(body);
  }
}
