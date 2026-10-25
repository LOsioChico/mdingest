import { z } from "zod";

/**
 * Application configuration.
 * Validated with Zod at load — invalid env throws before serving traffic.
 * Just a frozen object imported directly; Workers use the defaults.
 */

const envSchema = z.object({
  FREEDIUM_BASE_URL: z.string().url().default("https://freedium-mirror.cfd"),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(200),
  FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  USER_AGENT: z
    .string()
    .default(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ),
});

export type ConfigEnv = z.infer<typeof envSchema>;

function loadEnv(): ConfigEnv {
  // Workers have no process.env — defaults apply. The CLI (Bun) still honors
  // env overrides locally.
  const rawEnv = typeof process === "undefined" ? {} : process.env;
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return Object.freeze(parsed.data);
}

const env = loadEnv();

export const config = {
  freediumBaseUrl: env.FREEDIUM_BASE_URL,
  cacheTtlSeconds: env.CACHE_TTL_SECONDS,
  cacheMaxEntries: env.CACHE_MAX_ENTRIES,
  fetchTimeoutMs: env.FETCH_TIMEOUT_MS,
  userAgent: env.USER_AGENT,
} as const;

export type Config = typeof config;
