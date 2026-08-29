import { Injectable, Logger } from "@nestjs/common";
import { config } from "../../core/config/config.ts";

/**
 * HTTP client for Freedium mirror.
 * Freedium bypasses Medium's paywall and provides two access modes:
 *
 * 1. Download endpoint: GET /api/download?url=<medium_url>
 *    Returns finished markdown with frontmatter, tags, code languages.
 *    Images are included as <picture> HTML tags (converted to markdown by MediumService).
 *    Renderer is non-deterministic — ~20% of requests return [Embedded content] placeholders.
 *
 * 2. Data endpoint: GET /<medium_url>/__data.json
 *    Returns SvelteKit devalue-encoded data with:
 *    - eager.article: metadata object (title, subtitle, authors, readingTime, dates, isFree, postImage)
 *    - eager.html: rendered HTML (unused — images come from download endpoint <picture> tags)
 *    - eager.markdown: raw markdown body (unused — download endpoint has richer version)
 *
 * Attribution: Freedium (https://codeberg.org/Freedium-cfd/web)
 * is the Medium article fetcher this project depends on.
 */

export interface FreediumMarkdownResponse {
  readonly markdown: string;
  readonly url: string;
}

export interface FreediumArticleMetadata {
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly authorName: string | undefined;
  readonly readingTime: string | undefined;
  readonly date: string | undefined;
  readonly publishedAt: string | undefined;
  readonly updatedAt: string | undefined;
  readonly isFree: boolean | undefined;
  readonly postImage: string | undefined;
  readonly sourceUrl: string;
  readonly tags: string[];
}

export interface FreediumArticleData {
  readonly metadata: FreediumArticleMetadata;
}

@Injectable()
export class FreediumService {
  private readonly logger = new Logger(FreediumService.name);

  /**
   * Fetch finished markdown from Freedium's download endpoint.
   * Returns markdown with frontmatter, tags, code languages.
   *
   * Freedium's renderer is non-deterministic — ~20% of requests return
   * `[Embedded content: <hash>]` placeholders instead of rendered tables.
   * We retry up to 5 times and keep the response with fewest placeholders.
   * At ~80% clean rate per attempt, 5 retries = ~99.97% chance of a clean fetch.
   */
  async fetchMarkdown(mediumUrl: string): Promise<FreediumMarkdownResponse> {
    const downloadUrl = `${config.freediumBaseUrl}/api/download?url=${encodeURIComponent(mediumUrl)}`;

    this.logger.log(`Fetching markdown: ${downloadUrl}`);

    let best: { markdown: string; placeholders: number } | null = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      // Sequential retry is intentional — we stop early on a clean fetch
      // oxlint-disable-next-line no-await-in-loop
      const response = await this.fetchWithTimeout(downloadUrl);

      if (!response.ok) {
        throw new Error(
          `Freedium download returned ${response.status}: ${response.statusText}`,
        );
      }

      // oxlint-disable-next-line no-await-in-loop
      const markdown = await response.text();

      if (markdown.length < 100) {
        throw new Error(
          `Freedium download returned suspiciously short response (${markdown.length} bytes) — mirror may be down`,
        );
      }

      const placeholders = this.countEmbeddedPlaceholders(markdown);

      if (placeholders === 0) {
        return { markdown, url: downloadUrl };
      }

      this.logger.warn(`Attempt ${attempt}: ${placeholders} embedded placeholders, retrying`);

      if (!best || placeholders < best.placeholders) {
        best = { markdown, placeholders };
      }
    }

    // Return the best we got after 5 attempts
    return { markdown: best!.markdown, url: downloadUrl };
  }

  private countEmbeddedPlaceholders(markdown: string): number {
    return (markdown.match(/\[Embedded content: [a-f0-9]+\]/g) || []).length;
  }

  /**
   * Fetch article data from Freedium's __data.json endpoint.
   * Returns metadata (author, reading_time, postImage/cover).
   * HTML and markdown fields exist in the eager object but are not extracted —
   * the download endpoint is the primary source for body content.
   *
   * The __data.json uses SvelteKit's devalue format with index references.
   * We resolve the references to extract the article metadata object.
   */
  async fetchArticleData(mediumUrl: string): Promise<FreediumArticleData> {
    const dataUrl = `${config.freediumBaseUrl}/${mediumUrl}/__data.json`;

    this.logger.log(`Fetching article data: ${dataUrl}`);

    const response = await this.fetchWithTimeout(dataUrl);

    if (!response.ok) {
      throw new Error(
        `Freedium data endpoint returned ${response.status}: ${response.statusText}`,
      );
    }

    const raw = await response.text();
    const json = JSON.parse(raw);

    // SvelteKit devalue: nodes[1].data is an array of referenced values
    const nodeData = json.nodes?.[1]?.data;
    if (!nodeData || !Array.isArray(nodeData)) {
      throw new Error("Freedium data: invalid SvelteKit structure");
    }

    // data[0] = { slug, eager, streamed } — eager is a ref (number) to the actual object
    // eager = { html, markdown, article, cacheStatus, renderTimeMs, error }
    const eager = this.resolveRef(nodeData[0]?.eager, nodeData) as
      | Record<string, unknown>
      | undefined;
    if (!eager) {
      throw new Error("Freedium data: no eager field");
    }

    // SvelteKit streaming format: error field present when article fetch failed
    // (404, fetch failure, etc.) — check before accessing article
    const eagerError = this.resolveRef(eager.error, nodeData) as
      | Record<string, unknown>
      | undefined;
    if (eagerError) {
      const status = eagerError.status ?? "unknown";
      const message = typeof eagerError.message === "string" ? eagerError.message : "Freedium article fetch failed";
      throw new Error(`Freedium data error (status ${status}): ${message}`);
    }

    const article = this.resolveRef(eager.article, nodeData) as
      | Record<string, unknown>
      | undefined;

    if (!article) {
      throw new Error("Freedium data: no article metadata");
    }

    const metadata = this.extractMetadata(article, nodeData, mediumUrl);

    return { metadata };
  }

  // --- Private helpers ---

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.fetchTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": config.userAgent },
        signal: controller.signal,
        redirect: "follow",
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Freedium fetch timed out after ${config.fetchTimeoutMs}ms`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Resolve a SvelteKit devalue reference.
   * Numbers are array indices, -1 is undefined, anything else is a literal.
   */
  private resolveRef(ref: unknown, data: unknown[]): unknown {
    if (typeof ref === "number") {
      if (ref === -1) return undefined;
      return data[ref];
    }
    return ref;
  }

  private extractMetadata(
    article: Record<string, unknown>,
    data: unknown[],
    mediumUrl: string,
  ): FreediumArticleMetadata {
    const resolve = (ref: unknown) => this.resolveRef(ref, data);

    const title = resolve(article.title) as string | undefined ?? "";
    const subtitle = resolve(article.subtitle) as string | undefined;
    const readingTime = resolve(article.readingTime) as string | undefined;
    const date = resolve(article.date) as string | undefined;
    const publishedAt = resolve(article.publishedAt) as string | undefined;
    const updatedAt = resolve(article.updatedAt) as string | undefined;
    const isFree = resolve(article.isFree) as boolean | undefined;
    const postImage = resolve(article.postImage) as string | undefined;
    const sourceUrl = resolve(article.url) as string | undefined ?? mediumUrl;

    // Authors is a ref to an array of refs to { name, avatar } objects
    const authorsRef = resolve(article.authors);
    const authorsArr = Array.isArray(authorsRef) ? authorsRef : [];
    const firstAuthorRef = authorsArr[0];
    const firstAuthor = resolve(firstAuthorRef) as
      | Record<string, unknown>
      | undefined;
    const authorName = firstAuthor
      ? (resolve(firstAuthor.name) as string | undefined)
      : undefined;

    // Tags: not in the article object — extract from download markdown frontmatter
    // (handled by MediumService which has both sources)
    return {
      title,
      subtitle,
      authorName,
      readingTime,
      date,
      publishedAt,
      updatedAt,
      isFree,
      postImage: postImage
        ? `${config.freediumBaseUrl}${postImage}`
        : undefined,
      sourceUrl,
      tags: [],
    };
  }
}
