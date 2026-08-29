import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

/**
 * Global rate limit guard — 30 requests per minute per IP.
 * In-memory Map (singleton container, resets on restart).
 * Applied globally via APP_GUARD in app.module.ts.
 */

const WINDOW_MS = 60_000;
const LIMIT = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const ip = request.ip ?? "unknown";

    const now = Date.now();
    let bucket = buckets.get(ip);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + WINDOW_MS };
      buckets.set(ip, bucket);
      return true;
    }

    bucket.count++;

    if (bucket.count > LIMIT) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded. Try again in a minute.",
          details: { retryAfter },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Lazy GC: clean expired entries every 100 requests
    if (buckets.size > 1000) {
      for (const [key, b] of buckets) {
        if (now > b.resetAt) buckets.delete(key);
      }
    }

    return true;
  }
}
