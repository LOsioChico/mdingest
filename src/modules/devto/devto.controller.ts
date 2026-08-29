import { Controller, Get, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { DevtoService } from "./devto.service.ts";
import { DevtoConvertQuerySchema, type DevtoConvertQuery } from "./devto.dto.ts";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.ts";

/**
 * Dev.to provider REST controller.
 *
 * GET /v1/devto?url=<devto_url>&format=markdown|json
 *
 * - format=markdown (default): returns text/markdown with frontmatter + body
 * - format=json: returns application/json { metadata, markdown }
 *
 * Controller is thin: validate input, delegate to service, shape response.
 */

@Controller({ path: "devto", version: "1" })
export class DevtoController {
  constructor(private readonly devtoService: DevtoService) {}

  @Get()
  async convert(
    @Query(new ZodValidationPipe(DevtoConvertQuerySchema))
    query: DevtoConvertQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.devtoService.convert(query.url);

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
