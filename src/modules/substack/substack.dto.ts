import { z } from "zod";
import { detectProvider } from "../../../shared/providers.ts";

/**
 * Request/response DTOs for the Substack provider.
 * Zod schemas are the source of truth — types are inferred.
 */

/**
 * Validates that a URL is a Substack article URL.
 * Delegates to shared detectProvider — single source of truth for URL matching.
 */
export function isValidSubstackUrl(url: string): boolean {
  return detectProvider(url) === "substack";
}

/**
 * Checks if a URL is a Substack reader/home URL that needs redirect resolution.
 * e.g. https://substack.com/home/post/p-212696442
 */
export function isSubstackHomeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts.length >= 3 && pathParts[0] === "home" && pathParts[1] === "post" && (pathParts[2]?.startsWith("p-") ?? false);
  } catch {
    return false;
  }
}

/**
 * Extract the publication domain and slug from a Substack URL.
 * Returns `{ domain, slug }` or `null` if the URL is invalid.
 *
 * Examples:
 *   https://platformer.substack.com/p/why-leaving → { domain: "platformer.substack.com", slug: "why-leaving" }
 *   https://www.argmin.net/p/microconferences     → { domain: "www.argmin.net", slug: "microconferences" }
 */
export function parseSubstackUrl(url: string): { domain: string; slug: string } | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2 || pathParts[0] !== "p") return null;
    return { domain: parsed.host, slug: pathParts[1] ?? "" };
  } catch {
    return null;
  }
}

export const SubstackConvertQuerySchema = z.object({
  url: z
    .string()
    .url()
    .refine(isValidSubstackUrl, "Must be a Substack article URL (https://{pub}/p/{slug})"),
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export type SubstackConvertQuery = z.infer<typeof SubstackConvertQuerySchema>;
