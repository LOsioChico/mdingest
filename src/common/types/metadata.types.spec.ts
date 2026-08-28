import { describe, it, expect } from "vitest";
import { buildFrontmatter, type ArticleMetadata } from "./metadata.types.ts";

function makeMeta(overrides: Partial<ArticleMetadata> = {}): ArticleMetadata {
  return {
    title: "Test Article",
    source_url: "https://medium.com/@user/test-article",
    provider: "medium",
    tags: [],
    ...overrides,
  };
}

describe("buildFrontmatter", () => {
  it("outputs only required fields when no optionals", () => {
    const fm = buildFrontmatter(makeMeta());
    expect(fm).toBe('---\ntitle: "Test Article"\nsource_url: "https://medium.com/@user/test-article"\nprovider: "medium"\n---');
  });

  it("includes optional fields when present", () => {
    const fm = buildFrontmatter(makeMeta({
      subtitle: "Sub",
      author: "Author",
      date: "2026-01-01",
      published: "2026-01-01",
      updated: "2026-01-02",
      reading_time: "3 min read",
      free: true,
    }));
    expect(fm).toContain('subtitle: "Sub"');
    expect(fm).toContain('author: "Author"');
    expect(fm).toContain('date: "2026-01-01"');
    expect(fm).toContain('published: "2026-01-01"');
    expect(fm).toContain('updated: "2026-01-02"');
    expect(fm).toContain('reading_time: "3 min read"');
    expect(fm).toContain("free: true");
  });

  it("omits free when undefined", () => {
    const fm = buildFrontmatter(makeMeta({ free: undefined }));
    expect(fm).not.toContain("free:");
  });

  it("outputs tags as YAML list when non-empty", () => {
    const fm = buildFrontmatter(makeMeta({ tags: ["System Design", "Backend"] }));
    expect(fm).toContain("tags:");
    expect(fm).toContain('  - "System Design"');
    expect(fm).toContain('  - "Backend"');
  });

  it("omits tags section when empty", () => {
    const fm = buildFrontmatter(makeMeta({ tags: [] }));
    expect(fm).not.toContain("tags:");
  });

  it("escapes double quotes in values", () => {
    const fm = buildFrontmatter(makeMeta({ title: 'He said "hello"' }));
    expect(fm).toContain('title: "He said \\"hello\\""');
  });

  it("uses single-quoted style for multi-line subtitle with '' escaping", () => {
    const fm = buildFrontmatter(makeMeta({ subtitle: "it's\na test" }));
    expect(fm).toContain("subtitle: 'it''s\na test'");
  });

  it("uses double-quoted style for single-line subtitle", () => {
    const fm = buildFrontmatter(makeMeta({ subtitle: "Simple" }));
    expect(fm).toContain('subtitle: "Simple"');
  });
});
