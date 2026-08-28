import { describe, it, expect } from "vitest";
import { FreediumService, type FreediumArticleMetadata } from "./freedium.service.ts";

// Access private methods for direct unit testing of pure functions.
// These are pure functions with no side effects — testing them directly
// is faster and more targeted than going through fetchArticleData (HTTP).
type FreediumInternals = {
  resolveRef: (ref: unknown, data: unknown[]) => unknown;
  extractMetadata: (
    article: Record<string, unknown>,
    data: unknown[],
    mediumUrl: string,
  ) => FreediumArticleMetadata;
  countEmbeddedPlaceholders: (markdown: string) => number;
};

function makeService(): FreediumInternals {
  return new FreediumService() as unknown as FreediumInternals;
}

describe("FreediumService.resolveRef", () => {
  it("resolves numeric ref to array index", () => {
    const service = makeService();
    const data = ["a", "b", "c"];
    expect(service.resolveRef(2, data)).toBe("c");
  });

  it("resolves -1 to undefined", () => {
    const service = makeService();
    const data = ["a", "b"];
    expect(service.resolveRef(-1, data)).toBeUndefined();
  });

  it("returns literal value for non-number ref", () => {
    const service = makeService();
    const data: unknown[] = [];
    expect(service.resolveRef("hello", data)).toBe("hello");
    expect(service.resolveRef({ name: "test" }, data)).toEqual({ name: "test" });
    expect(service.resolveRef(true, data)).toBe(true);
  });
});

describe("FreediumService.countEmbeddedPlaceholders", () => {
  it("returns 0 for clean markdown", () => {
    const service = makeService();
    expect(service.countEmbeddedPlaceholders("# Title\n\nSome text.")).toBe(0);
  });

  it("counts single placeholder", () => {
    const service = makeService();
    const md = "Some text\n[Embedded content: a1b2c3d4]\nMore text";
    expect(service.countEmbeddedPlaceholders(md)).toBe(1);
  });

  it("counts multiple placeholders", () => {
    const service = makeService();
    const md = "[Embedded content: a1b2]\n[Embedded content: c3d4]\n[Embedded content: e5f6]";
    expect(service.countEmbeddedPlaceholders(md)).toBe(3);
  });

  it("does not match non-hex characters in hash", () => {
    const service = makeService();
    const md = "[Embedded content: xyz123]";
    expect(service.countEmbeddedPlaceholders(md)).toBe(0);
  });
});

describe("FreediumService.extractMetadata", () => {
  it("extracts all fields with resolved refs", () => {
    const service = makeService();
    // Simulate SvelteKit devalue structure:
    // data[0] = { slug, eager: 1 }  (eager is a ref to data[1])
    // data[1] = { article: 2 }      (article is a ref to data[2])
    // data[2] = { title: 3, authors: [4], url: "https://medium.com/@user/test", ... }
    // data[3] = "Test Article"      (title ref)
    // data[4] = { name: 5 }         (first author ref)
    // data[5] = "Jane Doe"          (author name ref)
    const data: unknown[] = [
      { slug: "test", eager: 1 },
      { article: 2 },
      {
        title: 3,
        subtitle: "A subtitle",
        authors: [4],
        readingTime: "5 min read",
        date: "2026-01-15",
        publishedAt: "2026-01-15",
        updatedAt: "2026-01-20",
        isFree: true,
        postImage: "/img/cover.jpg",
        url: "https://medium.com/@user/test",
      },
      "Test Article",
      { name: 5 },
      "Jane Doe",
    ];

    const metadata = service.extractMetadata(
      data[2] as Record<string, unknown>,
      data,
      "https://medium.com/@user/test",
    );

    expect(metadata.title).toBe("Test Article");
    expect(metadata.subtitle).toBe("A subtitle");
    expect(metadata.authorName).toBe("Jane Doe");
    expect(metadata.readingTime).toBe("5 min read");
    expect(metadata.date).toBe("2026-01-15");
    expect(metadata.publishedAt).toBe("2026-01-15");
    expect(metadata.updatedAt).toBe("2026-01-20");
    expect(metadata.isFree).toBe(true);
    expect(metadata.postImage).toContain("/img/cover.jpg");
    expect(metadata.sourceUrl).toBe("https://medium.com/@user/test");
  });

  it("falls back to mediumUrl when article.url is missing", () => {
    const service = makeService();
    const data: unknown[] = [
      { title: "No URL Article", authors: [] },
    ];

    const metadata = service.extractMetadata(
      data[0] as Record<string, unknown>,
      data,
      "https://medium.com/@user/fallback",
    );

    expect(metadata.sourceUrl).toBe("https://medium.com/@user/fallback");
  });

  it("returns undefined authorName when authors array is empty", () => {
    const service = makeService();
    const data: unknown[] = [
      { title: "Test", authors: [] },
    ];

    const metadata = service.extractMetadata(
      data[0] as Record<string, unknown>,
      data,
      "https://medium.com/@user/test",
    );

    expect(metadata.authorName).toBeUndefined();
  });

  it("prefixes postImage with freedium base URL", () => {
    const service = makeService();
    const data: unknown[] = [
      { postImage: "/img/cover.jpg" },
    ];

    const metadata = service.extractMetadata(
      data[0] as Record<string, unknown>,
      data,
      "https://medium.com/@user/test",
    );

    expect(metadata.postImage).toMatch(/^https:\/\//);
    expect(metadata.postImage).toContain("/img/cover.jpg");
  });

  it("returns undefined postImage when not present", () => {
    const service = makeService();
    const data: unknown[] = [
      { title: "No cover" },
    ];

    const metadata = service.extractMetadata(
      data[0] as Record<string, unknown>,
      data,
      "https://medium.com/@user/test",
    );

    expect(metadata.postImage).toBeUndefined();
  });
});
