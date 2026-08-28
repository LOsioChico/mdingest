import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { VersioningType } from "@nestjs/common";
import { AppModule } from "./app.module.ts";
import { config } from "./core/config/config.ts";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.ts";

/**
 * Bootstrap: NestJS + Fastify on Bun runtime.
 * - URI versioning (/v1/...)
 * - Global exception filter for standard error contract
 */

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(config.port, "0.0.0.0");

  console.log(`\n  mdingest running on http://localhost:${config.port}`);
  console.log(`  Try: curl "http://localhost:${config.port}/v1/medium?url=https://medium.com/@user/article"`);
}

bootstrap();
