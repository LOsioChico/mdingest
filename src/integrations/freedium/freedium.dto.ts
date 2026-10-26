import { z } from "zod";

/**
 * DTOs for the Freedium mirror integration.
 * Zod schemas are the source of truth — types are inferred.
 *
 * The __data.json payload uses SvelteKit devalue index references, so the
 * raw response can't be validated field-by-field. extractMetadata() resolves
 * the refs, then FreediumArticleMetadataSchema validates the result.
 */

/** Finished markdown returned by fetchMarkdown (our shape, not the wire format). */
export interface FreediumMarkdownResponse {
  readonly markdown: string;
  readonly url: string;
}

/**
 * Metadata extracted from the __data.json devalue article object.
 * Fields the mirror omits stay optional — MediumService treats them
 * as enrichment on top of the download frontmatter.
 */
export const FreediumArticleMetadataSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  authorName: z.string().optional(),
  readingTime: z.string().optional(),
  date: z.string().optional(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  isFree: z.boolean().optional(),
  postImage: z.string().optional(),
  sourceUrl: z.string(),
  tags: z.array(z.string()),
});

export type FreediumArticleMetadata = z.infer<
  typeof FreediumArticleMetadataSchema
>;

export interface FreediumArticleData {
  readonly metadata: FreediumArticleMetadata;
}
