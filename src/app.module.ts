import { Module } from "@nestjs/common";
import { MediumModule } from "./modules/medium/medium.module.ts";

@Module({
  imports: [MediumModule],
})
export class AppModule {}
