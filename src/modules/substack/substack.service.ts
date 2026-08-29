import { Injectable, Logger } from "@nestjs/common";
import TurndownService from "turndown";
import { CacheService } from "../../core/cache/cache.service.ts";
import { config } from "../../core/config/config.ts";
import { buildFrontmatter, type ArticleMetadata } from "../../common/types/metadata.types.ts";
import type { ConvertResult, Provider } from "../../common/types/provider.interface.ts";
import { isValidSubstackUrl, isSubstackHomeUrl, parseSubstackUrl } from "./substack.dto.ts";
import {
  SubstackInvalidUrlError,
  SubstackPaidPostError,
  SubstackUnavailableError,
  SubstackParseError,
} from "./errors/substack-errors.ts";

/**
 * Substack provider — converts Substack article URLs to markdown.
 *
 * Single-source: GET https://{domain}/api/v1/posts/{slug} returns body_html +
 * metadata in one unauthenticated call. Free posts only — paid posts return
 * truncated body_html (hard server-side paywall).
 *
 * HTML→Markdown via turndown + custom rules for Substack-specific components:
 * footnotes, LaTeX, YouTube/Twitter embeds, mentions, subscribe buttons.
 */

/** Substack API post response — only the fields we use. */
interface SubstackPostResponse {
  readonly title: string;
  readonly subtitle: string;
  readonly slug: string;
  readonly canonical_url: string;
  readonly post_date: string;
  readonly updated_at: string | null;
  readonly audience: string;
  readonly wordcount: number;
  readonly body_html: string;
  readonly cover_image: string | null;
  readonly publishedBylines: ReadonlyArray<{
    readonly name: string;
    readonly handle: string;
  }>;
}

@Injectable()
export class SubstackService implements Provider {
  readonly name = "substack";
  private readonly logger = new Logger(SubstackService.name);
  private readonly turndown: TurndownService;

  constructor(private readonly cache: CacheService) {
    this.turndown = this.createTurndownService();
  }

  matches(url: string): boolean {
    return isValidSubstackUrl(url);
  }

  async convert(url: string): Promise<ConvertResult> {
    if (!this.matches(url)) {
      throw new SubstackInvalidUrlError(url);
    }

    // Resolve /home/post/p-{id} redirects to real article URLs
    let resolvedUrl = url;
    if (isSubstackHomeUrl(url)) {
      resolvedUrl = await this.resolveHomeUrl(url);
    }

    const cached = this.cache.get(resolvedUrl);
    if (cached) {
      this.logger.log(`Cache hit: ${resolvedUrl}`);
      return this.parseCachedResult(cached, resolvedUrl);
    }

    this.logger.log(`Cache miss, fetching: ${resolvedUrl}`);

    const post = await this.fetchPost(resolvedUrl);

    if (post.audience === "only_paid") {
      throw new SubstackPaidPostError(resolvedUrl);
    }

    const preprocessed = this.preprocessHtml(post.body_html);
    const body = this.turndown.turndown(preprocessed);
    const cleanBody = this.cleanupMarkdown(body);
    const metadata = this.buildMetadata(post, resolvedUrl);
    const bodyWithCover = this.injectCoverImage(cleanBody, post.cover_image);
    const fullMarkdown = `${buildFrontmatter(metadata)}\n\n${bodyWithCover}\n`;

    this.cache.set(resolvedUrl, fullMarkdown);

    return { metadata, markdown: fullMarkdown };
  }

  // --- API fetch ---

  /**
   * Resolves a /home/post/p-{id} URL by following the redirect
   * to the real article URL (https://{pub}.substack.com/p/{slug}).
   */
  private async resolveHomeUrl(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fetchTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": config.userAgent },
        signal: controller.signal,
        redirect: "manual",
      });

      const location = response.headers.get("location");
      if (!location) {
        throw new SubstackUnavailableError(url);
      }

      this.logger.log(`Resolved home URL: ${url} → ${location}`);
      return location;
    } catch (error) {
      if (error instanceof SubstackUnavailableError) throw error;
      throw new SubstackUnavailableError(url);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchPost(url: string): Promise<SubstackPostResponse> {
    const parsed = parseSubstackUrl(url);
    if (!parsed) {
      throw new SubstackInvalidUrlError(url);
    }

    const apiUrl = `https://${parsed.domain}/api/v1/posts/${parsed.slug}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fetchTimeoutMs);

    try {
      const response = await fetch(apiUrl, {
        headers: { "User-Agent": config.userAgent },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`Substack API returned ${response.status}: ${response.statusText}`);
      }

      return await response.json() as SubstackPostResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new SubstackUnavailableError(`Request timed out after ${config.fetchTimeoutMs}ms`);
      }
      const reason = error instanceof Error ? error.message : "Unknown error";
      throw new SubstackUnavailableError(reason);
    } finally {
      clearTimeout(timeout);
    }
  }

  // --- HTML→Markdown with custom Substack rules ---

  /**
   * Pre-process HTML to handle empty-element Substack components that turndown
   * skips (it doesn't call filters for elements with no children).
   *
   * LaTeX, Twitter, and mention components render as empty <div>/<span> with
   * data in data-attrs. We replace them with placeholder text before turndown.
   */
  private preprocessHtml(html: string): string {
    let result = html;

    // LaTeX blocks → $$LaTeX$$ (empty divs, data-attrs before data-component-name)
    result = result.replace(
      /<div[^>]*data-attrs="([^"]*)"[^>]*data-component-name="LatexBlockToDOM"[^>]*><\/div>/g,
      (_, attrs: string) => {
        const decoded = this.decodeHtmlEntities(attrs);
        try {
          const parsed = JSON.parse(decoded) as Record<string, unknown>;
          const expr = parsed.persistentExpression;
          return typeof expr === "string" ? `<p>$$${expr}$$</p>` : "";
        } catch {
          return "";
        }
      },
    );

    // Twitter embeds → blockquote placeholder
    result = result.replace(
      /<div[^>]*data-attrs="([^"]*)"[^>]*data-component-name="Twitter2ToDOM"[^>]*><\/div>/g,
      (_, attrs: string) => {
        const decoded = this.decodeHtmlEntities(attrs);
        try {
          const parsed = JSON.parse(decoded) as Record<string, unknown>;
          const url = typeof parsed.url === "string" ? parsed.url : "";
          const text = typeof parsed.full_text === "string" ? parsed.full_text : "";
          const username = typeof parsed.username === "string" ? parsed.username : "";
          if (!url) return "";
          const header = username ? `**@${username}**` : "";
          const body = text.replace(/\n/g, "\n> ");
          return `<blockquote><p>${header}: ${body}</p><p><a href="${url}">Tweet</a></p></blockquote>`;
        } catch {
          return "";
        }
      },
    );

    // Mentions → link placeholder
    result = result.replace(
      /<span[^>]*data-attrs="([^"]*)"[^>]*data-component-name="MentionToDOM"[^>]*><\/span>/g,
      (_, attrs: string) => {
        const decoded = this.decodeHtmlEntities(attrs);
        try {
          const parsed = JSON.parse(decoded) as Record<string, unknown>;
          const name = typeof parsed.name === "string" ? parsed.name : "";
          const id = parsed.id;
          return name && typeof id === "number" ? `<a href="https://substack.com/profile/${id}">@${name}</a>` : "";
        } catch {
          return "";
        }
      },
    );

    // YouTube embeds → link placeholder (empty div case)
    result = result.replace(
      /<div[^>]*data-attrs="([^"]*)"[^>]*data-component-name="Youtube2ToDOM"[^>]*><\/div>/g,
      (_, attrs: string) => {
        const decoded = this.decodeHtmlEntities(attrs);
        try {
          const parsed = JSON.parse(decoded) as Record<string, unknown>;
          const videoId = typeof parsed.videoId === "string" ? parsed.videoId : "";
          return videoId ? `<p><a href="https://youtube.com/watch?v=${videoId}">YouTube video</a></p>` : "";
        } catch {
          return "";
        }
      },
    );

    return result;
  }

  /** Decode HTML entities in data-attrs attribute values. */
  private decodeHtmlEntities(s: string): string {
    return s
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  /**
   * Clean up markdown output — strip leftover empty spans and whitespace.
   */
  private cleanupMarkdown(md: string): string {
    return md
      // Remove empty span tags (turndown doesn't strip them)
      .replace(/<span[^>]*>([^<]*)<\/span>/g, "$1")
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, "\n\n");
  }

  private createTurndownService(): TurndownService {
    const td = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    });

    // Strip subscribe buttons/widgets (marketing, not content)
    td.remove([
      "button",
      '[data-component-name="ButtonCreateButton"]',
      '[data-component-name="SubscribeWidgetToDOM"]',
    ]);

    // Image captions → italic text below image
    td.addRule("imageCaption", {
      filter: (node) =>
        node.nodeName === "FIGCAPTION" &&
        (node.getAttribute("class")?.includes("image-caption") ?? false),
      replacement: (_content, node) => {
        const text = node.textContent?.trim() ?? "";
        return text ? `\n\n*${text}*` : "";
      },
    });

    // Footnote anchors → [^N]
    td.addRule("footnoteAnchor", {
      filter: (node) =>
        node.nodeName === "A" &&
        node.getAttribute("data-component-name") === "FootnoteAnchorToDOM",
      replacement: (_content, node) => {
        const id = node.getAttribute("id")?.replace("footnote-anchor-", "") ?? "";
        return id ? `[^${id}]` : "";
      },
    });

    // Footnote definitions → [^N]: definition
    td.addRule("footnoteDefinition", {
      filter: (node) =>
        node.nodeName === "DIV" &&
        node.getAttribute("data-component-name") === "FootnoteToDOM",
      replacement: (_content, node) => {
        const anchor = node.querySelector("a.footnote-number");
        const id = anchor?.getAttribute("id")?.replace("footnote-", "") ?? "";
        const contentDiv = node.querySelector(".footnote-content");
        const text = contentDiv?.textContent?.trim() ?? "";
        return id ? `\n\n[^${id}]: ${text}` : "";
      },
    });

    // LaTeX, Twitter, mentions: handled in preprocessHtml() before turndown
    // (turndown skips empty elements — filters never fire for <div></div>)

    // YouTube embeds → [YouTube video](url)
    // YouTube divs have children (iframe), so turndown fires — preprocessHtml
    // only catches the empty-div edge case.
    td.addRule("youtubeEmbed", {
      filter: (node) =>
        node.nodeName === "DIV" &&
        node.getAttribute("data-component-name") === "Youtube2ToDOM",
      replacement: (_content, node) => {
        const raw = node.getAttribute("data-attrs");
        if (!raw) return "";
        try {
          const decoded = this.decodeHtmlEntities(raw);
          const parsed = JSON.parse(decoded) as Record<string, unknown>;
          const videoId = typeof parsed.videoId === "string" ? parsed.videoId : "";
          return videoId ? `\n\n[YouTube video](https://youtube.com/watch?v=${videoId})\n\n` : "";
        } catch {
          return "";
        }
      },
    });

    // Embedded Substack posts → [title](url)
    td.addRule("embeddedPost", {
      filter: (node) =>
        node.nodeName === "A" &&
        node.getAttribute("data-component-name") === "EmbeddedPostToDOM",
      replacement: (_content, node) => {
        const href = node.getAttribute("href") ?? "";
        const title = node.textContent?.trim() ?? "";
        return href ? `[${title || "Embedded post"}](${href})` : "";
      },
    });

    return td;
  }

  // --- Metadata ---

  private buildMetadata(post: SubstackPostResponse, fallbackUrl: string): ArticleMetadata {
    const author = post.publishedBylines?.[0]?.name ?? "Unknown";

    return {
      title: post.title,
      subtitle: post.subtitle || undefined,
      author,
      published: post.post_date,
      date: post.post_date,
      updated: post.updated_at ?? undefined,
      reading_time: undefined,
      source_url: post.canonical_url || fallbackUrl,
      provider: "substack",
      tags: [],
      free: post.audience === "everyone",
    };
  }

  /**
   * Inject cover image at the top of the body.
   * Substack body_html does not contain an H1 (title is metadata, not body),
   * so we inject the cover before all content.
   */
  private injectCoverImage(body: string, coverImage: string | null): string {
    if (!coverImage) return body;
    return `![Cover image](${coverImage})\n\n${body}`;
  }

  // --- Cache parsing ---

  private parseCachedResult(cached: string, url: string): ConvertResult {
    const match = cached.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      throw new SubstackParseError(`Cache corruption: no frontmatter for ${url}`);
    }

    const fm = match[1] ?? "";

    const get = (key: string): string | undefined => {
      const doubleMatch = fm.match(new RegExp(`^${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m"));
      if (doubleMatch) return doubleMatch[1]?.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

      const singleMatch = fm.match(new RegExp(`^${key}:\\s*'((?:[^']|'')*)'`, "m"));
      if (singleMatch) return singleMatch[1]?.replace(/''/g, "'");

      const plainMatch = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      if (plainMatch) return plainMatch[1]?.trim();

      return undefined;
    };

    const metadata: ArticleMetadata = {
      title: get("title") ?? "",
      subtitle: get("subtitle"),
      author: get("author"),
      published: get("published"),
      date: get("date"),
      updated: get("updated"),
      reading_time: get("reading_time"),
      source_url: get("source_url") ?? url,
      provider: "substack",
      tags: [],
      free: get("free") === "true",
    };

    return { metadata, markdown: cached };
  }
}
