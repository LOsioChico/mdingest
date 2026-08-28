import { describe, it, expect } from "vitest";
import { isValidMediumUrl } from "./medium.dto.ts";

describe("isValidMediumUrl", () => {
  it("accepts medium.com exact match", () => {
    expect(isValidMediumUrl("https://medium.com/@user/article-id")).toBe(true);
  });

  it("accepts *.medium.com subdomain", () => {
    expect(isValidMediumUrl("https://user.medium.com/article-id")).toBe(true);
  });

  it("accepts publication custom domain", () => {
    expect(isValidMediumUrl("https://itnext.io/some-article")).toBe(true);
  });

  it("rejects non-Medium domain", () => {
    expect(isValidMediumUrl("https://example.com/article")).toBe(false);
  });

  it("rejects medium.com.evil.com (not a real subdomain)", () => {
    expect(isValidMediumUrl("https://medium.com.evil.com/article")).toBe(false);
  });

  it("rejects malformed input (not a URL)", () => {
    expect(isValidMediumUrl("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidMediumUrl("")).toBe(false);
  });
});
