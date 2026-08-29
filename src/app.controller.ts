import { Controller, Get, VERSION_NEUTRAL, Version } from "@nestjs/common";
import pkg from "../package.json" with { type: "json" };

const API_VERSION = "1";

interface ApiInfo {
  name: string;
  version: string;
  endpoints: Record<string, string>;
  source: string;
}

const sourceUrl = typeof pkg.repository === "object"
  ? pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")
  : "";

// Update endpoints when adding a new provider
const apiInfo: ApiInfo = {
  name: pkg.name,
  version: `v${API_VERSION}`,
  endpoints: {
    medium: `/v${API_VERSION}/medium?url=article-url`,
    devto: `/v${API_VERSION}/devto?url=article-url`,
    substack: `/v${API_VERSION}/substack?url=article-url`,
  },
  source: sourceUrl,
};

@Controller()
export class AppController {
  @Get()
  @Version([API_VERSION, VERSION_NEUTRAL])
  info(): ApiInfo {
    return apiInfo;
  }
}
