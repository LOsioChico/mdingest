import { Injectable } from "@nestjs/common";
import { LRUCache } from "lru-cache";
import { config } from "../config/config.ts";

/**
 * In-memory LRU cache for converted articles.
 * Key: canonical article URL
 * Value: the full markdown output (frontmatter + body)
 *
 * Cache TTL and max entries are configurable via env vars.
 * Lost on restart — acceptable for a personal API.
 */

@Injectable()
export class CacheService {
  private readonly cache: LRUCache<string, string>;

  constructor() {
    this.cache = new LRUCache<string, string>({
      max: config.cacheMaxEntries,
      ttl: config.cacheTtlSeconds * 1000,
    });
  }

  get(url: string): string | undefined {
    return this.cache.get(url);
  }

  set(url: string, value: string): void {
    this.cache.set(url, value);
  }
}
