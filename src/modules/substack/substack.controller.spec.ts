import { describe, it, expect, vi } from "vitest";
import { SubstackController } from "./substack.controller.ts";
import type { ConvertResult } from "../../common/types/provider.interface.ts";
import { SubstackInvalidUrlError, SubstackPaidPostError } from "./errors/substack-errors.ts";

function makeResult(): ConvertResult {
  return {
    metadata: {
      title: "Test Article",
      author: "Jane Doe",
      source_url: "https://platformer.substack.com/p/test-article",
      provider: "substack",
      tags: [],
      free: true,
    },
    markdown: "---\ntitle: \"Test Article\"\n---\n\n# Test Article\n\nBody text.",
  };
}

function makeController(result: ConvertResult = makeResult()): {
  controller: SubstackController;
  convertMock: ReturnType<typeof vi.fn>;
} {
  const convertMock = vi.fn().mockResolvedValue(result);
  const controller = new SubstackController({ convert: convertMock } as never);
  return { controller, convertMock };
}

function makeReply(): {
  reply: Record<string, unknown>;
  headers: Record<string, string>;
  sent: { value: string | unknown };
} {
  const headers: Record<string, string> = {};
  const sent = { value: undefined as string | unknown };
  const reply = {
    header: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    send: vi.fn((payload: string | unknown) => {
      sent.value = payload;
      return reply;
    }),
  };
  return { reply, headers, sent };
}

describe("SubstackController", () => {
  describe("GET /v1/substack (format=markdown, default)", () => {
    it("returns text/markdown content type", async () => {
      const { controller } = makeController();
      const { reply, headers } = makeReply();

      await controller.convert(
        { url: "https://pub.substack.com/p/article", format: "markdown" },
        reply as never,
      );

      expect(headers["Content-Type"]).toBe("text/markdown; charset=utf-8");
    });

    it("sends the markdown body as response", async () => {
      const { controller } = makeController();
      const { reply, sent } = makeReply();

      await controller.convert(
        { url: "https://pub.substack.com/p/article", format: "markdown" },
        reply as never,
      );

      expect(sent.value).toBe(makeResult().markdown);
    });

    it("calls substackService.convert with the URL", async () => {
      const { controller, convertMock } = makeController();
      const { reply } = makeReply();

      await controller.convert(
        { url: "https://pub.substack.com/p/article", format: "markdown" },
        reply as never,
      );

      expect(convertMock).toHaveBeenCalledWith("https://pub.substack.com/p/article");
    });
  });

  describe("GET /v1/substack (format=json)", () => {
    it("returns object with metadata and markdown", async () => {
      const { controller } = makeController();
      const { reply } = makeReply();

      const result = await controller.convert(
        { url: "https://pub.substack.com/p/article", format: "json" },
        reply as never,
      );

      expect(result).toEqual({
        metadata: makeResult().metadata,
        markdown: makeResult().markdown,
      });
    });

    it("does not set Content-Type header for json format", async () => {
      const { controller } = makeController();
      const { reply, headers } = makeReply();

      await controller.convert(
        { url: "https://pub.substack.com/p/article", format: "json" },
        reply as never,
      );

      expect(headers["Content-Type"]).toBeUndefined();
    });
  });

  describe("error propagation", () => {
    it("propagates SubstackInvalidUrlError from service", async () => {
      const convertMock = vi.fn().mockRejectedValue(new SubstackInvalidUrlError("https://example.com"));
      const controller = new SubstackController({ convert: convertMock } as never);
      const { reply } = makeReply();

      await expect(
        controller.convert(
          { url: "https://example.com", format: "markdown" },
          reply as never,
        ),
      ).rejects.toThrow(SubstackInvalidUrlError);
    });

    it("propagates SubstackPaidPostError from service", async () => {
      const convertMock = vi.fn().mockRejectedValue(new SubstackPaidPostError("https://pub.substack.com/p/paid"));
      const controller = new SubstackController({ convert: convertMock } as never);
      const { reply } = makeReply();

      await expect(
        controller.convert(
          { url: "https://pub.substack.com/p/paid", format: "markdown" },
          reply as never,
        ),
      ).rejects.toThrow(SubstackPaidPostError);
    });

    it("propagates generic errors from service", async () => {
      const convertMock = vi.fn().mockRejectedValue(new Error("Substack API down"));
      const controller = new SubstackController({ convert: convertMock } as never);
      const { reply } = makeReply();

      await expect(
        controller.convert(
          { url: "https://pub.substack.com/p/article", format: "markdown" },
          reply as never,
        ),
      ).rejects.toThrow("Substack API down");
    });
  });
});
