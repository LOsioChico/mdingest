import { describe, it, expect } from "vitest";
import { isValidSubstackUrl, parseSubstackUrl } from "./substack.dto.ts";

describe("isValidSubstackUrl", () => {
  it("accepts standard substack.com URL", () => {
    expect(isValidSubstackUrl("https://platformer.substack.com/p/why-leaving")).toBe(true);
  });

  it("accepts custom domain URL", () => {
    expect(isValidSubstackUrl("https://www.argmin.net/p/microconferences")).toBe(true);
  });

  it("accepts noahpinion.blog custom domain", () => {
    expect(isValidSubstackUrl("https://www.noahpinion.blog/p/some-post")).toBe(true);
  });

  it("rejects non-Substack domain without /p/ path", () => {
    expect(isValidSubstackUrl("https://example.com/article")).toBe(false);
  });

  it("rejects substack.com root (no /p/ path)", () => {
    expect(isValidSubstackUrl("https://platformer.substack.com/")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidSubstackUrl("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSubstackUrl("")).toBe(false);
  });
});

describe("parseSubstackUrl", () => {
  it("extracts domain and slug from substack.com URL", () => {
    expect(parseSubstackUrl("https://platformer.substack.com/p/why-leaving")).toEqual({
      domain: "platformer.substack.com",
      slug: "why-leaving",
    });
  });

  it("extracts domain and slug from custom domain URL", () => {
    expect(parseSubstackUrl("https://www.argmin.net/p/microconferences")).toEqual({
      domain: "www.argmin.net",
      slug: "microconferences",
    });
  });

  it("returns null for invalid URL", () => {
    expect(parseSubstackUrl("not a url")).toBeNull();
  });

  it("returns null for URL without /p/ path", () => {
    expect(parseSubstackUrl("https://example.com/article")).toBeNull();
  });
});
