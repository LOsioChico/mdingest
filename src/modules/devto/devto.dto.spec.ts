import { describe, it, expect } from "vitest";
import { isValidDevtoUrl } from "./devto.dto.ts";

describe("isValidDevtoUrl", () => {
  it("accepts standard dev.to URL", () => {
    expect(isValidDevtoUrl("https://dev.to/username/article-slug-123")).toBe(true);
  });

  it("accepts dev.to URL with long path", () => {
    expect(isValidDevtoUrl("https://dev.to/googleai/stop-wrestling-with-asr-1m6i")).toBe(true);
  });

  it("rejects non-dev.to domain", () => {
    expect(isValidDevtoUrl("https://example.com/article")).toBe(false);
  });

  it("rejects dev.to root (no article path)", () => {
    expect(isValidDevtoUrl("https://dev.to/")).toBe(false);
  });

  it("rejects dev.to with only username (no slug)", () => {
    expect(isValidDevtoUrl("https://dev.to/username")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidDevtoUrl("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidDevtoUrl("")).toBe(false);
  });
});
