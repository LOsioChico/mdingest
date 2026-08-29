import { Module } from "@nestjs/common";
import { MediumModule } from "./modules/medium/medium.module.ts";
import { DevtoModule } from "./modules/devto/devto.module.ts";
import { SubstackModule } from "./modules/substack/substack.module.ts";
import { AppController } from "./app.controller.ts";
import { McpController } from "./mcp.controller.ts";

@Module({
  imports: [MediumModule, DevtoModule, SubstackModule],
  controllers: [AppController, McpController],
})
export class AppModule {}

