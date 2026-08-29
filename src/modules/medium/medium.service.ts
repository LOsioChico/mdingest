import { Injectable, Logger } from "@nestjs/common";
import { FreediumService } from "../../integrations/freedium/freedium.service.ts";
import { buildFrontmatter, type ArticleMetadata } from "../../common/types/metadata.types.ts";
import { CacheService } from "../../core/cache/cache.service.ts";
import { config } from "../../core/config/config.ts";
import type { ConvertResult, Provider } from "../../common/types/provider.interface.ts";
import { isValidMediumUrl } from "./medium.dto.ts";
import { FreediumUnavailableError, MediumInvalidUrlError, MediumParseError } from "./errors/medium-errors.ts";

/**
 * Medium provider — converts Medium article URLs to markdown.
 *
 * Dual-source approach:
 *   1. Freedium download endpoint → finished markdown (tags, code languages, <picture> images)
 *   2. Freedium __data.json → metadata (author, reading_time, cover image URL)
 *
 * The download endpoint gives us 90% of the content. We enrich it with:
 *   - Author name and reading time (from __data.json article object)
 *   - Provider field (our addition for multi-provider support)
 *   - Cover image (from __data.json postImage, injected after H1)
 *   - <picture> HTML tags replaced with markdown image syntax
 *
 * Throws typed domain errors — the global exception filter shapes the HTTP response.
 */

@Injectable()
export class MediumService implements Provider {
  readonly name = "medium";
  private readonly logger = new Logger(MediumService.name);

  constructor(
    private readonly freedium: FreediumService,
    private readonly cache: CacheService,
  ) {}

  matches(url: string): boolean {
    return isValidMediumUrl(url);
  }

  async convert(url: string): Promise<ConvertResult> {
    if (!this.matches(url)) {
      throw new MediumInvalidUrlError(url);
    }

    const cached = this.cache.get(url);
    if (cached) {
      this.logger.log(`Cache hit: ${url}`);
      return this.parseCachedResult(cached, url);
    }

    this.logger.log(`Cache miss, fetching: ${url}`);

    // 1. Fetch finished markdown from download endpoint
    let downloadMd;
    try {
      const response = await this.freedium.fetchMarkdown(url);
      downloadMd = response.markdown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      throw new FreediumUnavailableError(reason);
    }

    // 2. Fetch article data (metadata: author, reading_time, cover image)
    let articleData;
    try {
      articleData = await this.freedium.fetchArticleData(url);
    } catch (error) {
      // Non-fatal: download markdown is the primary source
      this.logger.warn(`Failed to fetch article data: ${error instanceof Error ? error.message : "unknown"}`);
    }

    // 3. Parse frontmatter from download markdown
    const { frontmatter: downloadFm, body } = this.splitFrontmatter(downloadMd);
    const downloadMetadata = this.parseFrontmatter(downloadFm ?? "");

    // 4. Merge metadata: download frontmatter + article data enrichment
    const metadata = this.mergeMetadata(downloadMetadata, articleData?.metadata, url);

    // 5. Replace <picture> HTML tags with markdown images + add cover image
    const enrichedBody = articleData
      ? this.replaceImages(body, articleData.metadata.postImage)
      : body;

    // 6. Rebuild full markdown with enriched frontmatter
    const fullMarkdown = `${buildFrontmatter(metadata)}\n\n${enrichedBody}\n`;

    this.cache.set(url, fullMarkdown);

    return { metadata, markdown: fullMarkdown };
  }

  // --- Frontmatter parsing ---

  private splitFrontmatter(md: string): { frontmatter: string; body: string } {
    const match = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      return { frontmatter: "", body: md };
    }
    return { frontmatter: match[1] ?? "", body: match[2] ?? "" };
  }

  private parseFrontmatter(yaml: string): Partial<ArticleMetadata> {
    const get = (key: string): string | undefined => {
      // Single-quoted: match opening ' to closing ' (handles multi-line, '' escaping)
      const singleMatch = yaml.match(new RegExp(`^${key}:\\s*('(?:[^']|'')*')`, "m"));
      if (singleMatch) return this.stripYamlQuotes(singleMatch[1] ?? "");

      // Double-quoted: match opening " to closing " (handles multi-line, \" escaping)
      const doubleMatch = yaml.match(new RegExp(`^${key}:\\s*("(?:[^"\\\\]|\\\\.)*")`, "m"));
      if (doubleMatch) return this.stripYamlQuotes(doubleMatch[1] ?? "");

      // Unquoted: match until end of line
      const plainMatch = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      if (plainMatch) return (plainMatch[1] ?? "").trim();

      return undefined;
    };

    const getBool = (key: string): boolean | undefined => {
      const val = get(key);
      if (val === "true") return true;
      if (val === "false") return false;
      return undefined;
    };

    const tagsMatch = yaml.match(/^tags:\n((?:\s*-\s+.+\n?)+)/m);
    const tags = tagsMatch?.[1]
      ? [...tagsMatch[1].matchAll(/\s*-\s+(.+)/g)].map((m) => this.stripYamlQuotes(m[1] ?? ""))
      : [];

    return {
      title: get("title"),
      subtitle: get("subtitle"),
      published: get("published"),
      updated: get("updated"),
      free: getBool("free"),
      source_url: get("source_url"),
      tags,
    };
  }

  private stripYamlQuotes(value: string): string {
    const trimmed = value.trim();
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  // --- Metadata merging ---

  private mergeMetadata(
    download: Partial<ArticleMetadata>,
    article: { authorName: string | undefined; readingTime: string | undefined; sourceUrl: string } | undefined,
    fallbackUrl: string,
  ): ArticleMetadata {
    return {
      title: download.title ?? "",
      subtitle: download.subtitle,
      author: article?.authorName,
      date: download.published,
      published: download.published,
      updated: download.updated,
      reading_time: article?.readingTime,
      source_url: download.source_url ?? article?.sourceUrl ?? fallbackUrl,
      provider: "medium",
      tags: download.tags ?? [],
      free: download.free,
    };
  }

  // --- Image replacement ---

  /**
   * Replace <picture> HTML tags in the markdown body with clean markdown images.
   * The Freedium download endpoint includes images as <picture> HTML tags
   * (with <source> for responsive sizes). We convert them to markdown image syntax.
   *
   * Also injects the cover image (from metadata.postImage) after the H1 title,
   * since the cover is not part of the article body.
   */
  private replaceImages(markdownBody: string, coverImage: string | undefined): string {
    // Replace <picture>...</picture> blocks with markdown image syntax
    let result = markdownBody.replace(
      /<picture>\s*<source[^>]*>\s*<source[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/>\s*<\/picture>/g,
      (_, src: string, alt: string) => {
        const fullSrc = src.startsWith("/")
          ? `${config.freediumBaseUrl}${src}`
          : src;
        const cleanAlt = alt === "None" ? "" : alt;
        return `![${cleanAlt}](${fullSrc})`;
      },
    );

    // Inject cover image after H1 (cover is not in the body)
    if (coverImage) {
      const h1Match = result.match(/^(# .+)$/m);
      if (h1Match?.index !== undefined) {
        const insertPos = h1Match.index + h1Match[0].length;
        result =
          result.slice(0, insertPos) +
          "\n\n![Post cover image](" +
          coverImage +
          ")" +
          result.slice(insertPos);
      }
    }

    return result;
  }

  // --- Cache parsing ---

  private parseCachedResult(cached: string, url: string): ConvertResult {
    const { frontmatter } = this.splitFrontmatter(cached);
    if (!frontmatter) {
      throw new MediumParseError(`Cache corruption: no frontmatter for ${url}`);
    }

    const fmData = this.parseFrontmatter(frontmatter);
    const metadata = this.mergeMetadata(fmData, undefined, url);
    return { metadata, markdown: cached };
  }
}
