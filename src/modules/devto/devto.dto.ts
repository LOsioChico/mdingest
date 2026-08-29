import { z } from "zod";

/**
 * Request/response DTOs for the Dev.to provider.
 * Zod schemas are the source of truth — types are inferred.
 */

/**
 * Validates that a URL is a Dev.to article URL.
 *
 * Dev.to URLs:
 *   - https://dev.to/{username}/{slug}
 *
 * The Forem API accepts GET /api/articles/{username}/{slug} and returns
 * the full article including body_markdown.
 */
export function isValidDevtoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "dev.to" && parsed.pathname.split("/").length >= 3;
  } catch {
    return false;
  }
}

export const DevtoConvertQuerySchema = z.object({
  url: z
    .string()
    .url()
    .refine(isValidDevtoUrl, "Must be a Dev.to article URL (https://dev.to/{username}/{slug})"),
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export type DevtoConvertQuery = z.infer<typeof DevtoConvertQuerySchema>;
