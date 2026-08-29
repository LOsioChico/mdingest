import { describe, it, expect, vi } from "vitest";
import { DevtoService } from "./devto.service.ts";
import { CacheService } from "../../core/cache/cache.service.ts";

const SAMPLE_ARTICLE = {
  title: "Test Dev.to Article",
  description: "A test article about testing",
  body_markdown: `---
description: A test article about testing
published: true
---

# Test Dev.to Article

Some body text with a {% youtube dQw4w9WgXcQ %} liquid tag.

{% embed https://dev.to/lovestaco/some-post %}

{% github=https://github.com/user/repo %}

More text.`,
  published_timestamp: "2026-08-25T13:36:11Z",
  edited_at: "2026-08-26T10:00:00Z" as string | null,
  reading_time_minutes: 4,
  canonical_url: "https://dev.to/testuser/test-devto-article-abc",
  url: "https://dev.to/testuser/test-devto-article-abc",
  cover_image: "https://media2.dev.to/dynamic/image/cover.png" as string | null,
  tag_list: "python, testing, webdev",
  user: {
    name: "Test User",
    username: "testuser",
  },
};

function makeMockFetch(article: typeof SAMPLE_ARTICLE | null): ReturnType<typeof vi.fn> {
  if (article) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(article),
    });
  }
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    statusText: "Not Found",
  });
}

function makeService(article: typeof SAMPLE_ARTICLE | null = SAMPLE_ARTICLE): DevtoService {
  const cache = new CacheService();
  const service = new DevtoService(cache);
  // Mock the global fetch
  globalThis.fetch = makeMockFetch(article) as never;
  return service;
}

const TEST_URL = "https://dev.to/testuser/test-devto-article-abc";

describe("DevtoService.convert", () => {
  describe("happy path", () => {
    it("returns markdown with frontmatter", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).toContain('title: "Test Dev.to Article"');
      expect(result.markdown).toContain('author: "Test User"');
      expect(result.markdown).toContain('reading_time: "4 min read"');
      expect(result.markdown).toContain('published: "2026-08-25T13:36:11Z"');
    });

    it("returns metadata with provider=devto", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.metadata.provider).toBe("devto");
      expect(result.metadata.free).toBe(true);
    });

    it("parses tags from tag_list", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.metadata.tags).toEqual(["python", "testing", "webdev"]);
    });

    it("strips Dev.to frontmatter from body_markdown", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).not.toContain("published: true");
      expect(result.markdown).toContain("# Test Dev.to Article");
    });

    it("maps edited_at to updated field", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.metadata.updated).toBe("2026-08-26T10:00:00Z");
      expect(result.markdown).toContain('updated: "2026-08-26T10:00:00Z"');
    });

    it("injects cover image after H1", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      const h1Idx = result.markdown.indexOf("# Test Dev.to Article");
      const coverIdx = result.markdown.indexOf("![Cover image]");
      expect(coverIdx).toBeGreaterThan(h1Idx);
      expect(result.markdown).toContain("![Cover image](https://media2.dev.to/dynamic/image/cover.png)");
    });

    it("does not inject cover image when null", async () => {
      const noCoverArticle = { ...SAMPLE_ARTICLE, cover_image: null };
      const service = makeService(noCoverArticle);
      const result = await service.convert(TEST_URL);

      expect(result.markdown).not.toContain("![Cover image]");
    });

    it("sets updated to undefined when edited_at is null", async () => {
      const noEditArticle = { ...SAMPLE_ARTICLE, edited_at: null };
      const service = makeService(noEditArticle);
      const result = await service.convert(TEST_URL);

      expect(result.metadata.updated).toBeUndefined();
    });
  });

  describe("liquid tag transformation", () => {
    it("transforms youtube liquid tag to link", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).not.toContain("{% youtube");
      expect(result.markdown).toContain("[YouTube video](https://youtube.com/watch?v=dQw4w9WgXcQ)");
    });

    it("transforms embed liquid tag to link", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).not.toContain("{% embed");
      expect(result.markdown).toContain("[Embedded content](https://dev.to/lovestaco/some-post)");
    });

    it("transforms github liquid tag to link", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).not.toContain("{% github");
      expect(result.markdown).toContain("[GitHub repository](https://github.com/user/repo)");
    });
  });

  describe("liquid tag edge cases", () => {
    it("transforms details block tag", () => {
      const cache = new CacheService();
      const service = new DevtoService(cache);
      const input = "Some text\n\n{% details Click to expand %}\nHidden content here\n{% enddetails %}\n\nMore text";
      const result = service.transformLiquidTags(input);

      expect(result).toContain("<details><summary>Click to expand</summary>");
      expect(result).toContain("Hidden content here");
      expect(result).toContain("</details>");
      expect(result).not.toContain("{% details");
      expect(result).not.toContain("{% enddetails");
    });

    it("transforms cta block tag", () => {
      const cache = new CacheService();
      const service = new DevtoService(cache);
      const input = "{% cta https://example.com %}Click here!{% endcta %}";
      const result = service.transformLiquidTags(input);

      expect(result).toBe("[Click here!](https://example.com)");
    });

    it("transforms spoiler block tag", () => {
      const cache = new CacheService();
      const service = new DevtoService(cache);
      const input = "{% spoiler %}Secret text{% endspoiler %}";
      const result = service.transformLiquidTags(input);

      expect(result).toBe("> [SPOILER] Secret text");
    });

    it("transforms twitter liquid tag", () => {
      const cache = new CacheService();
      const service = new DevtoService(cache);
      const result = service.transformLiquidTags("{% twitter 123456789 %}");

      expect(result).toBe("[Tweet](https://twitter.com/i/web/status/123456789)");
    });

    it("transforms gist liquid tag", () => {
      const cache = new CacheService();
      const service = new DevtoService(cache);
      const result = service.transformLiquidTags("{% gist https://gist.github.com/user/abc123 %}");

      expect(result).toBe("[GitHub Gist](https://gist.github.com/user/abc123)");
    });

    it("leaves non-liquid-tag content unchanged", () => {
      const cache = new CacheService();
      const service = new DevtoService(cache);
      const input = "Regular **bold** and *italic* text with `code`.";
      const result = service.transformLiquidTags(input);

      expect(result).toBe(input);
    });
  });

  describe("cache behavior", () => {
    it("caches result and returns cached on second call", async () => {
      const cache = new CacheService();
      const service = new DevtoService(cache);
      const fetchMock = makeMockFetch(SAMPLE_ARTICLE);
      globalThis.fetch = fetchMock as never;

      await service.convert(TEST_URL);
      await service.convert(TEST_URL);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("preserves multi-line subtitle on cache hit", async () => {
      const multiLineArticle = {
        ...SAMPLE_ARTICLE,
        description: "Line one\nLine two",
      };
      const cache = new CacheService();
      const service = new DevtoService(cache);
      globalThis.fetch = makeMockFetch(multiLineArticle) as never;

      const first = await service.convert(TEST_URL);
      const second = await service.convert(TEST_URL);

      expect(second.metadata.subtitle).toBe(first.metadata.subtitle);
      expect(second.metadata.subtitle).toBe("Line one\nLine two");
    });
  });

  describe("URL validation", () => {
    it("throws DevtoInvalidUrlError for non-Dev.to URL", async () => {
      const service = makeService();
      await expect(service.convert("https://example.com/article")).rejects.toThrow();
    });
  });

  describe("API failure", () => {
    it("throws when API returns 404", async () => {
      const service = makeService(null);
      await expect(service.convert(TEST_URL)).rejects.toThrow();
    });
  });

  describe("body without frontmatter", () => {
    it("handles body_markdown without frontmatter", async () => {
      const noFmArticle = {
        ...SAMPLE_ARTICLE,
        body_markdown: "# Direct heading\n\nNo frontmatter here.",
      };
      const service = makeService(noFmArticle);
      const result = await service.convert(TEST_URL);

      expect(result.markdown).toContain("# Direct heading");
      expect(result.markdown).toContain('title: "Test Dev.to Article"');
    });
  });

  describe("matches()", () => {
    it("returns true for dev.to URL", () => {
      const service = makeService();
      expect(service.matches("https://dev.to/user/article-slug")).toBe(true);
    });

    it("returns false for non-Dev.to URL", () => {
      const service = makeService();
      expect(service.matches("https://example.com/article")).toBe(false);
    });
  });
});
