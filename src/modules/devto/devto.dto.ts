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
    .refine(isValidDevtoUrl, "Must be a Dev.to article URL (https://dev.to/{username}/{slug})"),
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export type DevtoConvertQuery = z.infer<typeof DevtoConvertQuerySchema>;
