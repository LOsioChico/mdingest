import type { ArticleMetadata } from "./metadata.types.ts";

/**
 * Provider interface — every content source implements this.
 * Future providers: Substack, Dev.to, generic HTML.
 *
 * The interface is intentionally minimal: given a URL, return metadata + markdown body.
 * How the provider fetches and parses is an implementation detail.
 */

export interface ConvertResult {
  readonly metadata: ArticleMetadata;
  readonly markdown: string;
}

export interface Provider {
  /** Provider name (e.g. "medium", "substack") */
  readonly name: string;

  /** Check if a URL belongs to this provider */
  matches(url: string): boolean;

  /** Convert a URL to markdown + metadata */
  convert(url: string): Promise<ConvertResult>;
}
