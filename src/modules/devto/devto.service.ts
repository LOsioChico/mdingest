import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "../../core/cache/cache.service.ts";
import { config } from "../../core/config/config.ts";
import { buildFrontmatter, type ArticleMetadata } from "../../common/types/metadata.types.ts";
import type { ConvertResult, Provider } from "../../common/types/provider.interface.ts";
import { isValidDevtoUrl } from "./devto.dto.ts";
import { DevtoInvalidUrlError, DevtoUnavailableError, DevtoParseError } from "./errors/devto-errors.ts";

/**
 * Dev.to provider — converts Dev.to article URLs to markdown.
 *
 * Single-source approach: the Forem API returns body_markdown (native Markdown)
 * plus all metadata in one unauthenticated call. No paywall, no HTML conversion,
 * no dual-source merge needed.
 *
 * Liquid tags ({% youtube ID %}, {% embed URL %}, etc.) are transformed to
 * standard Markdown links in the body.
 */

const DEVTO_API_BASE = "https://dev.to/api/articles";

/** Forem API article response — only the fields we use. */
interface DevtoArticleResponse {
  readonly title: string;
  readonly description: string;
  readonly body_markdown: string;
  readonly published_timestamp: string;
  readonly edited_at: string | null;
  readonly reading_time_minutes: number;
  readonly canonical_url: string;
  readonly url: string;
  readonly cover_image: string | null;
  readonly tag_list: string;
  readonly user: {
    readonly name: string;
    readonly username: string;
  };
}

@Injectable()
export class DevtoService implements Provider {
  readonly name = "devto";
  private readonly logger = new Logger(DevtoService.name);

  constructor(private readonly cache: CacheService) {}

  matches(url: string): boolean {
    return isValidDevtoUrl(url);
  }

  async convert(url: string): Promise<ConvertResult> {
    if (!this.matches(url)) {
      throw new DevtoInvalidUrlError(url);
    }

    const cached = this.cache.get(url);
    if (cached) {
      this.logger.log(`Cache hit: ${url}`);
      return this.parseCachedResult(cached, url);
    }

    this.logger.log(`Cache miss, fetching: ${url}`);

    const article = await this.fetchArticle(url);
    const body = this.stripDevtoFrontmatter(article.body_markdown);
    const cleanBody = this.transformLiquidTags(body);
    const metadata = this.buildMetadata(article, url);
    const bodyWithCover = this.injectCoverImage(cleanBody, article.cover_image);
    const fullMarkdown = `${buildFrontmatter(metadata)}\n\n${bodyWithCover}\n`;

    this.cache.set(url, fullMarkdown);

    return { metadata, markdown: fullMarkdown };
  }

  // --- API fetch ---

  private async fetchArticle(url: string): Promise<DevtoArticleResponse> {
    const apiPath = this.urlToApiPath(url);
    const apiUrl = `${DEVTO_API_BASE}${apiPath}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fetchTimeoutMs);

    try {
      const response = await fetch(apiUrl, {
        headers: { "User-Agent": config.userAgent },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`Dev.to API returned ${response.status}: ${response.statusText}`);
      }

      return await response.json() as DevtoArticleResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new DevtoUnavailableError(`Request timed out after ${config.fetchTimeoutMs}ms`);
      }
      const reason = error instanceof Error ? error.message : "Unknown error";
      throw new DevtoUnavailableError(reason);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Extract /{username}/{slug} from a Dev.to URL for the API path. */
  private urlToApiPath(url: string): string {
    const parsed = new URL(url);
    return parsed.pathname;
  }

  // --- Body processing ---

  /**
   * Strip Dev.to's editor frontmatter from body_markdown.
   * The API returns body_markdown with optional frontmatter (description, published: true).
   * We build our own frontmatter from API metadata fields.
   */
  private stripDevtoFrontmatter(body: string): string {
    const match = body.match(/^---\n[\s\S]*?\n---\n?/);
    if (match) {
      return body.slice(match[0].length).trimStart();
    }
    return body;
  }

  /**
   * Transform Dev.to liquid tags to standard Markdown.
   *
   * Inline tags (single-line):
   *   {% youtube ID %}          → [YouTube video](https://youtube.com/watch?v=ID)
   *   {% embed URL %}           → [Embedded content](URL)
   *   {% github=URL %}          → [GitHub repository](URL)
   *   {% gist URL %}            → [GitHub Gist](URL)
   *   {% twitter ID %}          → [Tweet](https://twitter.com/status/ID)
   *   {% link URL %}            → [Link](URL)
   *   {% codepen ID %}          → [CodePen](https://codepen.io/pen/ID)
   *   {% spotify URI %}         → [Spotify](https://open.spotify.com/...)
   *   {% glitch ID %}           → [Glitch](https://glitch.com/~ID)
   *   {% canva ID %}            → [Canva design](https://canva.com/design/ID)
   *
   * Block tags (with end tags):
   *   {% details summary %}...{% enddetails %}  → <details><summary>summary</summary>...</details>
   *   {% cta URL %}text{% endcta %}             → [text](URL)
   *   {% spoiler text %}{% endspoiler %}        → > [SPOILER] text
   *
   * Unknown tags: convert to [tagname: args] link format.
   */
  transformLiquidTags(markdown: string): string {
    let result = markdown;

    // Block tags first (they contain inner content)
    result = result.replace(
      /\{%\s*details\s+(.+?)\s*%\}([\s\S]*?)\{%\s*enddetails\s*%\}/g,
      (_, summary: string, content: string) =>
        `<details><summary>${summary.trim()}</summary>\n\n${content.trim()}\n\n</details>`,
    );

    result = result.replace(
      /\{%\s*cta\s+(.+?)\s*%\}([\s\S]*?)\{%\s*endcta\s*%\}/g,
      (_, url: string, text: string) => `[${text.trim()}](${url.trim()})`,
    );

    result = result.replace(
      /\{%\s*spoiler\s*%\}([\s\S]*?)\{%\s*endspoiler\s*%\}/g,
      (_, content: string) => `> [SPOILER] ${content.trim()}`,
    );

    // Inline tags
    result = result.replace(
      /\{%\s*youtube\s+([\w-]+)\s*%\}/g,
      (_, id: string) => `[YouTube video](https://youtube.com/watch?v=${id})`,
    );

    result = result.replace(
      /\{%\s*embed\s+(https?:\/\/[^\s]+)\s*%\}/g,
      (_, url: string) => `[Embedded content](${url})`,
    );

    result = result.replace(
      /\{%\s*github=(https?:\/\/[^\s]+)\s*%\}/g,
      (_, url: string) => `[GitHub repository](${url})`,
    );

    result = result.replace(
      /\{%\s*gist\s+(https?:\/\/[^\s]+)\s*%\}/g,
      (_, url: string) => `[GitHub Gist](${url})`,
    );

    result = result.replace(
      /\{%\s*twitter\s+(\d+)\s*%\}/g,
      (_, id: string) => `[Tweet](https://twitter.com/i/web/status/${id})`,
    );

    result = result.replace(
      /\{%\s*link\s+(https?:\/\/[^\s]+)\s*%\}/g,
      (_, url: string) => `[Link](${url})`,
    );

    result = result.replace(
      /\{%\s*codepen\s+([\w/]+)\s*%\}/g,
      (_, id: string) => `[CodePen](https://codepen.io/pen/${id})`,
    );

    result = result.replace(
      /\{%\s*spotify\s+(https?:\/\/[^\s]+)\s*%\}/g,
      (_, url: string) => `[Spotify](${url})`,
    );

    // Catch-all: unknown inline tags → [tagname: args]
    result = result.replace(
      /\{%\s*(\w+)[=\s]+([^%]+?)\s*%\}/g,
      (_, tag: string, args: string) => `[${tag}: ${args.trim()}]`,
    );

    return result;
  }

  // --- Metadata ---

  /** Decode common HTML entities in API text fields (description may contain &nbsp; etc). */
  private decodeHtmlEntities(s: string): string {
    return s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private buildMetadata(article: DevtoArticleResponse, fallbackUrl: string): ArticleMetadata {
    const tags = article.tag_list
      ? article.tag_list.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    return {
      title: article.title,
      subtitle: this.decodeHtmlEntities(article.description) || undefined,
      author: article.user.name,
      published: article.published_timestamp,
      date: article.published_timestamp,
      updated: article.edited_at ?? undefined,
      reading_time: `${article.reading_time_minutes} min read`,
      source_url: article.canonical_url || fallbackUrl,
      provider: "devto",
      tags,
      free: true,
    };
  }

  /**
   * Inject cover image after the first H1 heading.
   * The cover is not part of body_markdown — it's a separate API field.
   */
  private injectCoverImage(body: string, coverImage: string | null): string {
    if (!coverImage) return body;
    const h1Match = body.match(/^# .+$/m);
    if (h1Match?.index === undefined) return body;
    const insertPos = h1Match.index + h1Match[0].length;
    return `${body.slice(0, insertPos)}\n\n![Cover image](${coverImage})${body.slice(insertPos)}`;
  }

  // --- Cache parsing ---

  private parseCachedResult(cached: string, url: string): ConvertResult {
    const match = cached.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      throw new DevtoParseError(`Cache corruption: no frontmatter for ${url}`);
    }

    const fm = match[1] ?? "";

    const get = (key: string): string | undefined => {
      // Double-quoted: "value" (with \" and \\ escapes)
      const doubleMatch = fm.match(new RegExp(`^${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m"));
      if (doubleMatch) return doubleMatch[1]?.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

      // Single-quoted: 'value' (with '' escaping, may span multiple lines)
      const singleMatch = fm.match(new RegExp(`^${key}:\\s*'((?:[^']|'')*)'`, "m"));
      if (singleMatch) return singleMatch[1]?.replace(/''/g, "'");

      // Unquoted: until end of line
      const plainMatch = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      if (plainMatch) return plainMatch[1]?.trim();

      return undefined;
    };

    const tagsMatch = fm.match(/^tags:\n((?:\s*-\s+.+\n?)+)/m);
    const tags = tagsMatch?.[1]
      ? [...tagsMatch[1].matchAll(/\s*-\s+"(.+)"/g)].map((m) => m[1] ?? "")
      : [];

    const metadata: ArticleMetadata = {
      title: get("title") ?? "",
      subtitle: get("subtitle"),
      author: get("author"),
      published: get("published"),
      date: get("date"),
      updated: get("updated"),
      reading_time: get("reading_time"),
      source_url: get("source_url") ?? url,
      provider: "devto",
      tags,
      free: true,
    };

    return { metadata, markdown: cached };
  }
}
