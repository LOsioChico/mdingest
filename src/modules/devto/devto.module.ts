import { Module } from "@nestjs/common";
import { DevtoController } from "./devto.controller.ts";
import { DevtoService } from "./devto.service.ts";
import { CacheModule } from "../../core/cache/cache.module.ts";

@Module({
  imports: [CacheModule],
  controllers: [DevtoController],
  providers: [DevtoService],
  exports: [DevtoService],
})
export class DevtoModule {}
