import { z } from "zod";

/**
 * Application configuration.
 * Validated with Zod at boot — invalid env crashes before serving traffic.
 * No @nestjs/config — just a frozen object imported directly.
 */

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FREEDIUM_BASE_URL: z
    .string()
    .url()
    .default("https://freedium-mirror.cfd"),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(200),
  FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  USER_AGENT: z.string().default(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Invalid environment configuration:",
      parsed.error.flatten().fieldErrors,
    );
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

const env = loadEnv();

export const config = {
  port: env.PORT,
  freediumBaseUrl: env.FREEDIUM_BASE_URL,
  cacheTtlSeconds: env.CACHE_TTL_SECONDS,
  cacheMaxEntries: env.CACHE_MAX_ENTRIES,
  fetchTimeoutMs: env.FETCH_TIMEOUT_MS,
  userAgent: env.USER_AGENT,
} as const;

export type Config = typeof config;
