import { BadRequestException } from "@nestjs/common";
import { FreediumService } from "./integrations/freedium/freedium.service.ts";
import { CacheService } from "./core/cache/cache.service.ts";
import { MediumService } from "./modules/medium/medium.service.ts";
import { DevtoService } from "./modules/devto/devto.service.ts";
import { SubstackService } from "./modules/substack/substack.service.ts";
import type { ConvertResult, Provider } from "./common/types/provider.interface.ts";
import { detectProvider, type ProviderId } from "../shared/providers.ts";

/**
 * Shared ingestion router — used by CLI and MCP.
 * Instantiates the same services as the HTTP API, but with `new` (no NestJS).
 * Services are created once at module load and reused across calls.
 */

const freedium = new FreediumService();
const cache = new CacheService();

const providers: Record<ProviderId, Provider> = {
  medium: new MediumService(freedium, cache),
  devto: new DevtoService(cache),
  substack: new SubstackService(cache),
};

export interface IngestOptions {
  /** Override auto-detection. If omitted, detectProvider(url) is used. */
  provider?: ProviderId;
}

/**
 * Ingest a URL into clean Markdown + metadata.
 * Auto-detects the provider from the URL, or uses an explicit override.
 * Throws typed domain errors (HttpException subclasses) on failure.
 */
export async function ingest(url: string, opts?: IngestOptions): Promise<ConvertResult> {
  const providerId = opts?.provider ?? detectProvider(url);

  if (!providerId) {
    throw new BadRequestException({
      code: "VALIDATION.FAILED",
      message: `Could not detect provider from URL: ${url}. Supported: Medium, Dev.to, Substack.`,
      details: { url },
    });
  }

  return providers[providerId].convert(url);
}
