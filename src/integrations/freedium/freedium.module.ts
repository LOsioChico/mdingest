import { Module } from "@nestjs/common";
import { FreediumService } from "./freedium.service.ts";

@Module({
  exports: [FreediumService],
  providers: [FreediumService],
})
export class FreediumModule {}
