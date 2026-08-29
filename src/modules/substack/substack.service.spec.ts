import { describe, it, expect, vi } from "vitest";
import { SubstackService } from "./substack.service.ts";
import { CacheService } from "../../core/cache/cache.service.ts";
import { SubstackPaidPostError } from "./errors/substack-errors.ts";

const SAMPLE_POST = {
  title: "Test Substack Post",
  subtitle: "A test post about testing",
  slug: "test-substack-post",
  canonical_url: "https://platformer.substack.com/p/test-substack-post",
  post_date: "2026-08-25T13:36:11Z",
  updated_at: "2026-08-26T10:00:00Z" as string | null,
  audience: "everyone",
  wordcount: 1000,
  body_html: `<h1>Test Substack Post</h1><p>This is a <strong>bold</strong> paragraph with a <a href="https://example.com">link</a>.</p><blockquote><p>A quote.</p></blockquote><h2>Section</h2><p>More text with <em>italic</em> and <code>inline code</code>.</p><pre><code>const x = 1;</code></pre><ul><li>Item 1</li><li>Item 2</li></ul>`,
  cover_image: "https://substackcdn.com/image/fetch/cover.png" as string | null,
  publishedBylines: [{ name: "Test Author", handle: "testauthor" }],
};

const PAID_POST = {
  ...SAMPLE_POST,
  audience: "only_paid",
  body_html: "<p>Truncated preview only...</p>",
};

function makeMockFetch(post: typeof SAMPLE_POST | null): ReturnType<typeof vi.fn> {
  if (post) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(post),
    });
  }
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    statusText: "Not Found",
  });
}

function makeService(post: typeof SAMPLE_POST | null = SAMPLE_POST): SubstackService {
  const cache = new CacheService();
  const service = new SubstackService(cache);
  globalThis.fetch = makeMockFetch(post) as never;
  return service;
}

const TEST_URL = "https://platformer.substack.com/p/test-substack-post";

describe("SubstackService.convert", () => {
  describe("happy path", () => {
    it("returns markdown with frontmatter", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).toContain('title: "Test Substack Post"');
      expect(result.markdown).toContain('author: "Test Author"');
      expect(result.markdown).toContain('published: "2026-08-25T13:36:11Z"');
    });

    it("returns metadata with provider=substack", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.metadata.provider).toBe("substack");
      expect(result.metadata.free).toBe(true);
    });

    it("converts HTML to markdown", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).toContain("**bold**");
      expect(result.markdown).toContain("*italic*");
      expect(result.markdown).toContain("`inline code`");
      expect(result.markdown).toContain("```");
      expect(result.markdown).toContain("Item 1");
      expect(result.markdown).toContain("Item 2");
      expect(result.markdown).toContain("> A quote.");
      expect(result.markdown).toContain("[link](https://example.com)");
    });

    it("maps updated_at to updated field", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.metadata.updated).toBe("2026-08-26T10:00:00Z");
    });

    it("injects cover image at top of body", async () => {
      const service = makeService();
      const result = await service.convert(TEST_URL);

      expect(result.markdown).toContain("![Cover image]");
      const fmEnd = result.markdown.indexOf("---\n", 4) + 4;
      const coverIdx = result.markdown.indexOf("![Cover image]");
      expect(coverIdx).toBeGreaterThan(fmEnd);
    });
  });

  describe("paid post detection", () => {
    it("throws SubstackPaidPostError for only_paid audience", async () => {
      const service = makeService(PAID_POST);
      await expect(service.convert(TEST_URL)).rejects.toThrow(SubstackPaidPostError);
    });
  });

  describe("cache behavior", () => {
    it("caches result and returns cached on second call", async () => {
      const cache = new CacheService();
      const service = new SubstackService(cache);
      const fetchMock = makeMockFetch(SAMPLE_POST);
      globalThis.fetch = fetchMock as never;

      await service.convert(TEST_URL);
      await service.convert(TEST_URL);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("URL validation", () => {
    it("throws SubstackInvalidUrlError for non-Substack URL", async () => {
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

  describe("cover image edge cases", () => {
    it("does not inject cover image when null", async () => {
      const noCoverPost = { ...SAMPLE_POST, cover_image: null };
      const service = makeService(noCoverPost);
      const result = await service.convert(TEST_URL);

      expect(result.markdown).not.toContain("![Cover image]");
    });
  });

  describe("matches()", () => {
    it("returns true for substack.com URL", () => {
      const service = makeService();
      expect(service.matches("https://pub.substack.com/p/some-slug")).toBe(true);
    });

    it("returns true for custom domain URL", () => {
      const service = makeService();
      expect(service.matches("https://www.argmin.net/p/some-slug")).toBe(true);
    });

    it("returns false for non-Substack URL", () => {
      const service = makeService();
      expect(service.matches("https://example.com/article")).toBe(false);
    });
  });
});
