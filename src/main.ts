import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { VersioningType } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import { AppModule } from "./app.module.ts";
import { config } from "./core/config/config.ts";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.ts";
import { createLlmVisibilityHook } from "./common/llm-visibility.ts";

/**
 * Bootstrap: NestJS + Fastify on Bun runtime.
 * - URI versioning (/v1/...)
 * - Global exception filter for standard error contract
 * - @fastify/static serves Astro build output (web/dist/) for the UI
 */

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      genReqId: () => randomUUID(),
      trustProxy: true,
    }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  // Register @fastify/static AFTER NestFactory.create() to serve Astro build output.
  // Must be called before app.listen() so the /* wildcard route is registered.
  // Fastify's find-my-way router prioritizes static routes (NestJS /v1/medium, etc.)
  // over the /* wildcard, so API routes are not affected.
  const webDist = join(process.cwd(), "web", "dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
    });

    // LLM visibility: Accept: text/markdown content negotiation + Link headers.
    // preHandler runs before @fastify/static's wildcard — if reply.send() is
    // called, the static handler is skipped. Otherwise falls through to HTML.
    const fastifyInstance = app.getHttpAdapter().getInstance();
    fastifyInstance.addHook("preHandler", createLlmVisibilityHook(webDist));
  }

  app.enableShutdownHooks();

  await app.listen(config.port, "0.0.0.0");

  console.log(`\n  mdingest running on http://localhost:${config.port}`);
  console.log(`  UI:  http://localhost:${config.port}/`);
  console.log(`  API: http://localhost:${config.port}/v1/medium?url=...`);
}

bootstrap();
