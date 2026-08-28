import { Module } from "@nestjs/common";
import { MediumController } from "./medium.controller.ts";
import { MediumService } from "./medium.service.ts";
import { FreediumModule } from "../../integrations/freedium/freedium.module.ts";
import { CacheModule } from "../../core/cache/cache.module.ts";

@Module({
  imports: [FreediumModule, CacheModule],
  controllers: [MediumController],
  providers: [MediumService],
  exports: [MediumService],
})
export class MediumModule {}
