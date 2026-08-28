# mdingest

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/Runtime-Bun-000000.svg)](https://bun.sh)
[![Framework: NestJS](https://img.shields.io/badge/Framework-NestJS-e0234e.svg)](https://nestjs.com)
[![Deployed: Cloudflare](https://img.shields.io/badge/Deployed-Cloudflare-F38020.svg)](https://mdingest.knightker.workers.dev)
[![TypeScript: strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.json)

API that converts blog/article/newsletter pages to clean Markdown for LLM ingestion.

Currently supports **Medium** (via [Freedium](https://codeberg.org/Freedium-cfd/web) paywall bypass).
Designed for future Substack, Dev.to, and other providers.

## Quick start

```bash
bun install
bun run dev
```

## Usage

### Live API

Deployed at `https://mdingest.knightker.workers.dev`:

```bash
curl "https://mdingest.knightker.workers.dev/v1/medium?url=https://medium.com/@user/article-id"
```

### Local development

```bash
bun run dev
curl "http://localhost:3000/v1/medium?url=https://medium.com/@user/article-id"
```

Returns `text/markdown` with YAML frontmatter + clean body:

```markdown
---
title: "Article Title"
subtitle: "Article subtitle"
author: "Author Name"
date: "2026-01-15"
published: "2026-01-15"
updated: "2026-01-20"
reading_time: "5 min read"
free: true
source_url: "https://medium.com/@user/article-id"
provider: "medium"
tags:
  - "Distributed Systems"
  - "System Design"
---

# Article content in clean Markdown...
```

### Get JSON response (metadata + markdown)

```bash
curl "https://mdingest.knightker.workers.dev/v1/medium?url=https://medium.com/@user/article-id&format=json"
```

Returns `application/json`:

```json
{
  "metadata": {
    "title": "Article Title",
    "subtitle": "Article subtitle",
    "author": "Author Name",
    "date": "2026-01-15",
    "published": "2026-01-15",
    "updated": "2026-01-20",
    "reading_time": "5 min read",
    "free": true,
    "source_url": "https://medium.com/@user/article-id",
    "provider": "medium",
    "tags": ["Distributed Systems", "System Design"]
  },
  "markdown": "---\ntitle: \"Article Title\"...\n"
}
```

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `FREEDIUM_BASE_URL` | `https://freedium-mirror.cfd` | Freedium mirror base URL |
| `CACHE_TTL_SECONDS` | `300` | Cache entry TTL (seconds) |
| `CACHE_MAX_ENTRIES` | `200` | Max cache entries |
| `FETCH_TIMEOUT_MS` | `20000` | Freedium fetch timeout (ms) |
| `USER_AGENT` | Chrome 120 UA | User-Agent for Freedium requests |

## Architecture

```
src/
  core/
    config/         Zod-validated config (boot-time, frozen object)
    cache/          In-memory LRU cache
  integrations/
    freedium/       HTTP client for Freedium mirror (download + data endpoints)
  common/
    types/          Shared types: ArticleMetadata schema, Provider interface
    pipes/          ZodValidationPipe (validates controller input)
    filters/        AllExceptionsFilter (shapes errors to { code, message, details?, traceId })
  modules/
    medium/         Medium feature: controller, service, DTOs, errors
  app.module.ts     Root module
  main.ts           Bootstrap (NestJS + Fastify + Bun, URI versioning, global filter)
  worker.ts         Cloudflare Worker — routes requests to the Docker container
```

**6-bucket layout** (following NestJS dev guidelines):
- `core/` — app-wide infrastructure
- `integrations/` — external service clients (thin wrappers)
- `common/` — generic, domain-less utilities (types, pipes, filters)
- `modules/` — business features (own controllers, services, DTOs, errors)

**Dual-source approach:** Medium articles are fetched from two Freedium endpoints:
1. `/api/download?url=...` — finished markdown with tags, pipe tables, code languages, inline images as `<picture>` HTML
2. `/<url>/__data.json` — SvelteKit data with author, reading time, and cover image URL

The download endpoint gives us 90% of the content. We enrich it with author, reading time,
and cover image from the data endpoint. We also replace `<picture>` HTML tags with clean
markdown image syntax. The download endpoint retries up to 5 times if Freedium's renderer
returns `[Embedded content]` placeholders instead of rendered tables (~20% failure rate).

Tags and pipe tables are not recoverable from any other source (Medium's GraphQL API is
Cloudflare-blocked without auth).

**Accepted domains:** 42 Medium domains sourced from Freedium's `KNOWN_MEDIUM_DOMAINS` +
`KNOWN_MEDIUM_CUSTOM_DOMAINS`. Includes `medium.com`, `*.medium.com`, and publication
custom domains (`itnext.io`, `levelup.gitconnected.com`, `betterprogramming.pub`, etc.).

**Provider pattern:** Each content source implements the `Provider` interface.
Adding a new provider (Substack, Dev.to) only requires a new folder under `modules/`
— no changes to core or common modules.

**Multi-entry-point:** Service classes use `@Injectable()` (NestJS DI metadata) but
work with direct `new` instantiation — no NestJS boot required. This enables three
entry points sharing the same conversion logic: HTTP API (current), CLI (planned),
MCP server (planned).

**Error contract:** All errors return `{ code, message, details?, traceId }` with
namespaced codes (`VALIDATION.FAILED`, `MEDIUM.INVALID_URL`, `MEDIUM.FREEDIUM_UNAVAILABLE`,
`MEDIUM.PARSE_FAILED`, `INTERNAL.ERROR`).

## Tech stack

- **Runtime:** Bun
- **Framework:** NestJS + Fastify
- **Validation:** Zod
- **Caching:** lru-cache (in-memory)
- **Linting:** oxlint
- **Deployment:** Cloudflare Containers

## Attribution

This project depends on [Freedium](https://codeberg.org/Freedium-cfd/web) for Medium
paywall bypass. Freedium is an open-source service that fetches Medium articles via
their GraphQL API and renders them as accessible HTML and downloadable Markdown.
We use two Freedium endpoints: `/api/download` (finished markdown) and `__data.json`
(SvelteKit SSR data with metadata).

## Roadmap

| Feature | Status | How |
|---|---|---|
| HTTP API | Deployed | `https://mdingest.knightker.workers.dev/v1/medium?url=...` — Cloudflare Containers |
| CLI | Planned | `bun run src/cli.ts <url>` — direct `new` services, print markdown |
| MCP server | Planned | Expose `convert_article` tool — same services, `@modelcontextprotocol/sdk` |
| Additional providers | Planned | Substack, Dev.to — new folder under `modules/` |

## Development

```bash
bun run verify    # typecheck + lint
bun run typecheck # tsc --noEmit only
bun run lint      # oxlint only
bun run dev       # start dev server with hot reload
bun run start     # start server (no hot reload)
```
