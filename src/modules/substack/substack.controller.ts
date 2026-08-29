import { Controller, Get, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { SubstackService } from "./substack.service.ts";
import { SubstackConvertQuerySchema, type SubstackConvertQuery } from "./substack.dto.ts";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.ts";

/**
 * Substack provider REST controller.
 *
 * GET /v1/substack?url=<substack_url>&format=markdown|json
 *
 * - format=markdown (default): returns text/markdown with frontmatter + body
 * - format=json: returns application/json { metadata, markdown }
 *
 * Only free posts can be converted. Paid posts return SUBSTACK.PAID_POST (403).
 */

@Controller({ path: "substack", version: "1" })
export class SubstackController {
  constructor(private readonly substackService: SubstackService) {}

  @Get()
  async convert(
    @Query(new ZodValidationPipe(SubstackConvertQuerySchema))
    query: SubstackConvertQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.substackService.convert(query.url);

    if (query.format === "json") {
      return {
        metadata: result.metadata,
        markdown: result.markdown,
      };
    }

    reply.header("Content-Type", "text/markdown; charset=utf-8");
    return reply.send(result.markdown);
  }
}
