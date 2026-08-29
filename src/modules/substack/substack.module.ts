import { Module } from "@nestjs/common";
import { SubstackController } from "./substack.controller.ts";
import { SubstackService } from "./substack.service.ts";
import { CacheModule } from "../../core/cache/cache.module.ts";

@Module({
  imports: [CacheModule],
  controllers: [SubstackController],
  providers: [SubstackService],
  exports: [SubstackService],
})
export class SubstackModule {}
