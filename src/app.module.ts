import { Module } from "@nestjs/common";
import { MediumModule } from "./modules/medium/medium.module.ts";
import { DevtoModule } from "./modules/devto/devto.module.ts";
import { SubstackModule } from "./modules/substack/substack.module.ts";

@Module({
  imports: [MediumModule, DevtoModule, SubstackModule],
})
export class AppModule {}

