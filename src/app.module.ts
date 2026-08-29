import { Module } from "@nestjs/common";
import { MediumModule } from "./modules/medium/medium.module.ts";
import { DevtoModule } from "./modules/devto/devto.module.ts";

@Module({
  imports: [MediumModule, DevtoModule],
})
export class AppModule {}
