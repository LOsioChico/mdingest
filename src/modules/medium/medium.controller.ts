import { Controller, Get, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { MediumService } from "./medium.service.ts";
import { MediumConvertQuerySchema, type MediumConvertQuery } from "./medium.dto.ts";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.ts";

/**
 * Medium provider REST controller.
 *
 * GET /v1/medium?url=<medium_url>&format=markdown|json
 *
 * - format=markdown (default): returns text/markdown with frontmatter + body
 * - format=json: returns application/json { metadata, markdown }
 *
 * Controller is thin: validate input, delegate to service, shape response.
 * Errors thrown by the service are caught by the global exception filter.
 */

@Controller({ path: "medium", version: "1" })
export class MediumController {
  constructor(private readonly mediumService: MediumService) {}

  @Get()
  async convert(
    @Query(new ZodValidationPipe(MediumConvertQuerySchema))
    query: MediumConvertQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.mediumService.convert(query.url);

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
