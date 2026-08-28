import { describe, it, expect, vi } from "vitest";
import { MediumService } from "./medium.service.ts";
import { CacheService } from "../../core/cache/cache.service.ts";
import type { FreediumMarkdownResponse, FreediumArticleData } from "../../integrations/freedium/freedium.service.ts";

const SAMPLE_DOWNLOAD_MD = `---
title: "Test Article"
subtitle: "A subtitle"
published: "2026-01-15"
updated: "2026-01-20"
free: true
source_url: "https://medium.com/@user/test-article"
tags:
  - "Distributed Systems"
  - "System Design"
---

# Test Article

Some body text here.

<picture><source srcset="/img/1.webp"><source srcset="/img/1.jpg"><img src="/img/1.jpg" alt="A diagram" /></picture>

More text after image.`;

const SAMPLE_ARTICLE_DATA: FreediumArticleData = {
  metadata: {
    title: "Test Article",
    subtitle: "A subtitle",
    authorName: "Jane Doe",
    readingTime: "5 min read",
    date: "2026-01-15",
    publishedAt: "2026-01-15",
    updatedAt: "2026-01-20",
    isFree: true,
    postImage: "https://freedium-mirror.cfd/img/cover.jpg",
    sourceUrl: "https://medium.com/@user/test-article",
    tags: [],
  },
};

function makeMockFreedium(markdown: string, articleData: FreediumArticleData | null): {
  fetchMarkdown: ReturnType<typeof vi.fn>;
  fetchArticleData: ReturnType<typeof vi.fn>;
} {
  const response: FreediumMarkdownResponse = { markdown, url: "http://test" };
  return {
    fetchMarkdown: vi.fn().mockResolvedValue(response),
    fetchArticleData: articleData ? vi.fn().mockResolvedValue(articleData) : vi.fn().mockRejectedValue(new Error("no data")),
  };
}

function makeService(markdown: string, articleData: FreediumArticleData | null): MediumService {
  const mocks = makeMockFreedium(markdown, articleData);
  const cache = new CacheService();
  return new MediumService(mocks as unknown as never, cache);
}

describe("MediumService.convert", () => {
  describe("happy path with both sources", () => {
    it("returns markdown with enriched frontmatter", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, SAMPLE_ARTICLE_DATA);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.markdown).toContain('title: "Test Article"');
      expect(result.markdown).toContain('author: "Jane Doe"');
      expect(result.markdown).toContain('reading_time: "5 min read"');
      expect(result.markdown).toContain('published: "2026-01-15"');
      expect(result.markdown).toContain('free: true');
    });

    it("parses tags from download frontmatter", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, SAMPLE_ARTICLE_DATA);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.metadata.tags).toEqual(["Distributed Systems", "System Design"]);
      expect(result.markdown).toContain('  - "Distributed Systems"');
    });

    it("replaces <picture> HTML with markdown image syntax", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, SAMPLE_ARTICLE_DATA);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.markdown).not.toContain("<picture>");
      expect(result.markdown).toContain("![A diagram](https://freedium-mirror.cfd/img/1.jpg)");
    });

    it("injects cover image after H1", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, SAMPLE_ARTICLE_DATA);
      const result = await service.convert("https://medium.com/@user/test-article");

      const h1Idx = result.markdown.indexOf("# Test Article");
      const coverIdx = result.markdown.indexOf("![Post cover image]");
      expect(coverIdx).toBeGreaterThan(h1Idx);
    });

    it("returns metadata with provider=medium", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, SAMPLE_ARTICLE_DATA);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.metadata.provider).toBe("medium");
    });
  });

  describe("download-only (article data fetch fails)", () => {
    it("still returns markdown without author/reading_time", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, null);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.markdown).toContain('title: "Test Article"');
      expect(result.markdown).toContain('published: "2026-01-15"');
      expect(result.metadata.author).toBeUndefined();
      expect(result.metadata.reading_time).toBeUndefined();
    });

    it("does not inject cover image when article data is missing", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, null);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.markdown).not.toContain("Post cover image");
    });
  });

  describe("cache behavior", () => {
    it("caches result and returns cached on second call", async () => {
      const mocks = makeMockFreedium(SAMPLE_DOWNLOAD_MD, SAMPLE_ARTICLE_DATA);
      const cache = new CacheService();
      const service = new MediumService(mocks as unknown as never, cache);

      await service.convert("https://medium.com/@user/test-article");
      await service.convert("https://medium.com/@user/test-article");

      expect(mocks.fetchMarkdown).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL validation", () => {
    it("throws MediumInvalidUrlError for non-Medium URL", async () => {
      const service = makeService(SAMPLE_DOWNLOAD_MD, SAMPLE_ARTICLE_DATA);
      await expect(service.convert("https://example.com/article")).rejects.toThrow();
    });
  });

  describe("Freedium failure", () => {
    it("throws when fetchMarkdown fails", async () => {
      const mocks = {
        fetchMarkdown: vi.fn().mockRejectedValue(new Error("Freedium down")),
        fetchArticleData: vi.fn().mockResolvedValue(SAMPLE_ARTICLE_DATA),
      };
      const cache = new CacheService();
      const service = new MediumService(mocks as unknown as never, cache);

      await expect(service.convert("https://medium.com/@user/test-article")).rejects.toThrow();
    });
  });

  describe("multi-line subtitle parsing", () => {
    it("parses single-quoted multi-line subtitle without truncation", async () => {
      const multiLineMd = `---
title: "Test Article"
subtitle: 'Line 1
Line 2'
published: "2026-01-15"
source_url: "https://medium.com/@user/test-article"
---

# Test Article

Body text.`;
      const service = makeService(multiLineMd, null);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.metadata.subtitle).toBe("Line 1\nLine 2");
    });

    it("parses double-quoted multi-line subtitle without truncation", async () => {
      const multiLineMd = `---
title: "Test Article"
subtitle: "Line 1
Line 2"
published: "2026-01-15"
source_url: "https://medium.com/@user/test-article"
---

# Test Article

Body text.`;
      const service = makeService(multiLineMd, null);
      const result = await service.convert("https://medium.com/@user/test-article");

      expect(result.metadata.subtitle).toBe("Line 1\nLine 2");
    });
  });

  describe("matches()", () => {
    it("returns true for medium.com URL", () => {
      const service = makeService("", null);
      expect(service.matches("https://medium.com/@user/article")).toBe(true);
    });

    it("returns false for non-Medium URL", () => {
      const service = makeService("", null);
      expect(service.matches("https://example.com/article")).toBe(false);
    });
  });
});
