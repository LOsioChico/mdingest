import { z } from "zod";
import { detectProvider } from "../../../shared/providers.ts";

/**
 * Request/response DTOs for the Medium provider.
 * Zod schemas are the source of truth — types are inferred.
 */

/**
 * Validates that a URL is a Medium article URL.
 * Delegates to shared detectProvider — single source of truth for URL matching.
 */
export function isValidMediumUrl(url: string): boolean {
  return detectProvider(url) === "medium";
}

export const MediumConvertQuerySchema = z.object({
  url: z
    .string()
    .url()
    .refine(isValidMediumUrl, "Must be a Medium article URL (medium.com, *.medium.com, or publication domain)"),
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export type MediumConvertQuery = z.infer<typeof MediumConvertQuerySchema>;
