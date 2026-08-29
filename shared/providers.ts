/**
 * Shared constants — single source of truth for backend + frontend.
 *
 * Only genuinely duplicated values live here (YAGNI).
 * Validation functions stay in backend DTOs (Zod .refine() references them).
 */

// ── Medium domains ──────────────────────────────────────────────
// Sourced from Freedium's KNOWN_MEDIUM_DOMAINS + KNOWN_MEDIUM_CUSTOM_DOMAINS
// (medium-parser/medium_parser/utils.py + medium_domains.txt).
// Duplicated in backend (medium.dto.ts) and frontend (Converter.tsx) — centralized here.

export const MEDIUM_DOMAINS: ReadonlySet<string> = new Set([
  // KNOWN_MEDIUM_DOMAINS
  "medium.com",
  "uxplanet.org",
  "osintteam.blog",
  "ahmedelfakharany.com",
  "drlee.io",
  "artificialcorner.com",
  "generativeai.pub",
  "productcoalition.com",
  "towardsdev.com",
  "infosecwriteups.com",
  "towardsdatascience.com",
  "thetaoist.online",
  "devopsquare.com",
  "laceydearie.com",
  "bettermarketing.pub",
  "itnext.io",
  "eand.co",
  "betterprogramming.pub",
  "curiouse.co",
  "betterhumans.pub",
  "uxdesign.cc",
  "thebolditalic.com",
  "arcdigital.media",
  "codeburst.io",
  "psiloveyou.xyz",
  "writingcooperative.com",
  "entrepreneurshandbook.co",
  "prototypr.io",
  "theascent.pub",
  "storiusmag.com",
  // KNOWN_MEDIUM_CUSTOM_DOMAINS
  "javascript.plainenglish.io",
  "blog.llamaindex.ai",
  "code.likeagirl.io",
  "medium.datadriveninvestor.com",
  "blog.det.life",
  "python.plainenglish.io",
  "blog.stackademic.com",
  "ai.gopubby.com",
  "blog.devops.dev",
  "levelup.gitconnected.com",
  "betterhumans.coach.me",
  "ai.plainenglish.io",
]);

// ── Provider metadata ───────────────────────────────────────────
// Used by Converter.tsx (pills), ProviderCards.astro (cards), docs.astro (endpoints).

export interface ProviderInfo {
  readonly id: "medium" | "devto" | "substack";
  readonly label: string;
  readonly endpoint: string;
  readonly source: string;
  readonly url: string;
  readonly icon: string;
  readonly example: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  { id: "medium", label: "Medium", endpoint: "/v1/medium", source: "Freedium mirror", url: "https://medium.com", icon: "/icons/medium.svg", example: "https://medium.com/@user/article" },
  { id: "devto", label: "Dev.to", endpoint: "/v1/devto", source: "Forem API", url: "https://dev.to", icon: "/icons/devto.svg", example: "https://dev.to/user/post" },
  { id: "substack", label: "Substack", endpoint: "/v1/substack", source: "Public API", url: "https://substack.com", icon: "/icons/substack.svg", example: "https://example.substack.com/p/post" },
] as const;

// ── Provider detection ──────────────────────────────────────────
// Single source of truth for URL → provider mapping.
// Frontend uses this for auto-detecting the provider from a pasted URL.

export type ProviderId = "medium" | "devto" | "substack";

export function detectProvider(url: string): ProviderId | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname.split("/").filter(Boolean);

    if (host === "dev.to" && path.length >= 2) return "devto";
    if (path.length >= 2 && path[0] === "p") return "substack";
    if (path.length >= 3 && path[0] === "home" && path[1] === "post" && (path[2]?.startsWith("p-") ?? false)) return "substack";
    if (host === "medium.com" || host.endsWith(".medium.com") || MEDIUM_DOMAINS.has(host)) {
      return "medium";
    }
    return null;
  } catch {
    return null;
  }
}

// ── Site constants ──────────────────────────────────────────────

export const BASE_URL = "https://mdingest.knightker.workers.dev";
export const GITHUB_REPO = "LOsioChico/mdingest";
export const GITHUB_URL = "https://github.com/LOsioChico/mdingest";
export const GITHUB_PROFILE_URL = "https://github.com/LOsioChico";

// ── Error codes (docs.astro) ────────────────────────────────────

export interface ErrorCode {
  readonly code: string;
  readonly http: string;
  readonly when: string;
}

export const ERROR_CODES: readonly ErrorCode[] = [
  { code: "VALIDATION.FAILED", http: "422", when: "Bad query params (Zod pipe)" },
  { code: "MEDIUM.INVALID_URL", http: "400", when: "URL is not a Medium article" },
  { code: "MEDIUM.FREEDIUM_UNAVAILABLE", http: "503", when: "Freedium mirror down or timed out" },
  { code: "MEDIUM.PARSE_FAILED", http: "502", when: "Article data parsing failed" },
  { code: "DEVTO.INVALID_URL", http: "400", when: "URL is not a Dev.to article" },
  { code: "DEVTO.UNAVAILABLE", http: "503", when: "Dev.to API down or timed out" },
  { code: "DEVTO.PARSE_FAILED", http: "502", when: "Article data parsing failed" },
  { code: "SUBSTACK.INVALID_URL", http: "400", when: "URL is not a Substack article" },
  { code: "SUBSTACK.PAID_POST", http: "403", when: "Post is not available for conversion" },
  { code: "SUBSTACK.UNAVAILABLE", http: "503", when: "Substack API down or timed out" },
  { code: "SUBSTACK.PARSE_FAILED", http: "502", when: "Article data parsing failed" },
  { code: "INTERNAL.ERROR", http: "500", when: "Unexpected error" },
  { code: "NOT_FOUND", http: "404", when: "Unknown route" },
] as const;

// ── Frontmatter fields (docs.astro) ─────────────────────────────

export interface FrontmatterField {
  readonly field: string;
  readonly type: string;
  readonly desc: string;
}

export const FRONTMATTER_FIELDS: readonly FrontmatterField[] = [
  { field: "title", type: "string", desc: "Article title" },
  { field: "author", type: "string", desc: "Author name" },
  { field: "published", type: "date", desc: "Publication date (ISO)" },
  { field: "updated", type: "date", desc: "Last updated date (ISO)" },
  { field: "reading_time", type: "string", desc: "Estimated reading time" },
  { field: "tags", type: "string[]", desc: "Article tags (Medium only)" },
  { field: "cover_image", type: "string", desc: "Cover image URL" },
] as const;
