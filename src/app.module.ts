import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MediumModule } from "./modules/medium/medium.module.ts";
import { DevtoModule } from "./modules/devto/devto.module.ts";
import { SubstackModule } from "./modules/substack/substack.module.ts";
import { AppController } from "./app.controller.ts";
import { McpController } from "./mcp.controller.ts";
import { RateLimitGuard } from "./common/guards/rate-limit.guard.ts";

@Module({
  imports: [MediumModule, DevtoModule, SubstackModule],
  controllers: [AppController, McpController],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}

