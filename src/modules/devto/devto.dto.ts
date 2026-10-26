import { z } from "zod";
import { detectProvider } from "../../../shared/providers.ts";

/**
 * Request/response DTOs for the Dev.to provider.
 * Zod schemas are the source of truth — types are inferred.
 */

/**
 * Validates that a URL is a Dev.to article URL.
 * Delegates to shared detectProvider — single source of truth for URL matching.
 */
export function isValidDevtoUrl(url: string): boolean {
  return detectProvider(url) === "devto";
}

export const DevtoConvertQuerySchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      isValidDevtoUrl,
      "Must be a Dev.to article URL (https://dev.to/{username}/{slug})",
    ),
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export type DevtoConvertQuery = z.infer<typeof DevtoConvertQuerySchema>;

/**
 * Forem API article response — only the fields we use.
 * safeParse'd at the fetch boundary; unknown upstream keys are stripped.
 * Nullable+optional mirrors the code's `||`/`??` fallbacks.
 */
export const DevtoArticleResponseSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  body_markdown: z.string(),
  published_timestamp: z.string(),
  edited_at: z.string().nullable().optional(),
  reading_time_minutes: z.number(),
  canonical_url: z.string().nullable().optional(),
  cover_image: z.string().nullable().optional(),
  tag_list: z.string().nullable().optional(),
  user: z.object({ name: z.string() }),
});

export type DevtoArticleResponse = z.infer<typeof DevtoArticleResponseSchema>;
