import { Module } from "@nestjs/common";
import { CacheService } from "./cache.service.ts";

@Module({
  exports: [CacheService],
  providers: [CacheService],
})
export class CacheModule {}
