import { z } from "zod";

/**
 * Request/response DTOs for the Substack provider.
 * Zod schemas are the source of truth — types are inferred.
 */

/**
 * Validates that a URL is a Substack article URL.
 *
 * Substack URLs:
 *   - https://{pub}.substack.com/p/{slug}
 *   - https://{custom-domain}/p/{slug}  (e.g. www.noahpinion.blog, www.argmin.net)
 *
 * The path must contain `/p/{slug}`. The domain can be anything —
 * if it's not a Substack publication, the API returns 404 and we
 * surface that as SUBSTACK.UNAVAILABLE.
 */
export function isValidSubstackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts.length >= 2 && pathParts[0] === "p";
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
