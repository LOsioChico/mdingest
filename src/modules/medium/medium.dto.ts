import { z } from "zod";

/**
 * Request/response DTOs for the Medium provider.
 * Zod schemas are the source of truth — types are inferred.
 */

/**
 * Validates that a URL is a Medium article URL.
 * Domain list sourced from Freedium's KNOWN_MEDIUM_DOMAINS + KNOWN_MEDIUM_CUSTOM_DOMAINS
 * (medium-parser/medium_parser/utils.py + medium_domains.txt).
 *
 * Medium URLs:
 *   - medium.com/@user/article-id
 *   - username.medium.com/article-id
 *   - Publication custom domains (itnext.io, levelup.gitconnected.com, etc.)
 */
const MEDIUM_DOMAINS = new Set([
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

export function isValidMediumUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      host === "medium.com" ||
      host.endsWith(".medium.com") ||
      MEDIUM_DOMAINS.has(host)
    );
  } catch {
    return false;
  }
}

export const MediumConvertQuerySchema = z.object({
  url: z
    .string()
    .url()
    .refine(isValidMediumUrl, "Must be a Medium article URL (medium.com, *.medium.com, or publication domain)"),
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export type MediumConvertQuery = z.infer<typeof MediumConvertQuerySchema>;
