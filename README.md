# mdingest

[![CI](https://img.shields.io/github/actions/workflow/status/LOsioChico/mdingest/ci.yml?style=flat-square&label=CI)](https://github.com/LOsioChico/mdingest/actions)
[![License: MIT](https://img.shields.io/github/license/LOsioChico/mdingest?style=flat-square)](LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg?url=https://deepwiki.com/LOsioChico/mdingest)](https://deepwiki.com/LOsioChico/mdingest)
[![Last Commit](https://img.shields.io/github/last-commit/LOsioChico/mdingest?style=flat-square)](https://github.com/LOsioChico/mdingest/commits)

API that converts blog/article/newsletter pages to clean Markdown for LLM ingestion.

Currently supports **Medium** (via [Freedium](https://codeberg.org/Freedium-cfd/web) paywall bypass), **Dev.to** (via Forem API), and **Substack** (free posts via public API + HTML→Markdown).
Designed for future providers.

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
curl "https://mdingest.knightker.workers.dev/v1/devto?url=https://dev.to/user/article-slug"
curl "https://mdingest.knightker.workers.dev/v1/substack?url=https://pub.substack.com/p/article-slug"
```

### Local development

```bash
bun run dev
curl "http://localhost:3000/v1/medium?url=https://medium.com/@user/article-id"
curl "http://localhost:3000/v1/devto?url=https://dev.to/user/article-slug"
curl "http://localhost:3000/v1/substack?url=https://pub.substack.com/p/article-slug"
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
    devto/          Dev.to feature: controller, service, DTOs, errors
    substack/       Substack feature: controller, service, DTOs, errors
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
Adding a new provider only requires a new folder under `modules/`
— no changes to core or common modules.

**Multi-entry-point:** Service classes use `@Injectable()` (NestJS DI metadata) but
work with direct `new` instantiation — no NestJS boot required. This enables three
entry points sharing the same conversion logic: HTTP API (current), CLI (planned),
MCP server (planned).

**Error contract:** All errors return `{ code, message, details?, traceId }` with
namespaced codes (`VALIDATION.FAILED`, `MEDIUM.INVALID_URL`, `MEDIUM.FREEDIUM_UNAVAILABLE`,
`MEDIUM.PARSE_FAILED`, `DEVTO.INVALID_URL`, `DEVTO.UNAVAILABLE`, `DEVTO.PARSE_FAILED`,
`SUBSTACK.INVALID_URL`, `SUBSTACK.PAID_POST`, `SUBSTACK.UNAVAILABLE`, `SUBSTACK.PARSE_FAILED`,
`INTERNAL.ERROR`).

## Tech stack

- **Runtime:** Bun
- **Framework:** NestJS + Fastify
- **Validation:** Zod
- **Caching:** lru-cache (in-memory)
- **HTML→Markdown:** turndown (Substack provider)
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
| HTTP API | Deployed — runtime-verified | `https://mdingest.knightker.workers.dev/v1/medium?url=...` — Cloudflare Containers |
| Medium provider | Runtime-verified | `GET /v1/medium?url=...` — Freedium dual-source, 28 unit tests |
| Dev.to provider | Runtime-verified | `GET /v1/devto?url=...` — Forem API, liquid tag transform, 38 unit tests |
| Substack provider | Runtime-verified | `GET /v1/substack?url=...` — public API + turndown HTML→Markdown, free posts only, 32 unit tests |
| CLI | Planned | `bun run src/cli.ts <url>` — direct `new` services, print markdown |
| MCP server | Planned | Expose `convert_article` tool — same services, `@modelcontextprotocol/sdk` |

## Development

```bash
bun run verify    # typecheck + lint
bun run typecheck # tsc --noEmit only
bun run lint      # oxlint only
bun run dev       # start dev server with hot reload
bun run start     # start server (no hot reload)
```
