# mdingest

[![CI](https://img.shields.io/github/actions/workflow/status/LOsioChico/mdingest/ci.yml?style=flat-square&label=CI)](https://github.com/LOsioChico/mdingest/actions)
[![License: MIT](https://img.shields.io/github/license/LOsioChico/mdingest?style=flat-square)](LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg?url=https://deepwiki.com/LOsioChico/mdingest)](https://deepwiki.com/LOsioChico/mdingest)
[![Last Commit](https://img.shields.io/github/last-commit/LOsioChico/mdingest?style=flat-square)](https://github.com/LOsioChico/mdingest/commits)

API that converts blog/article/newsletter pages to clean Markdown for LLM ingestion.
Supports **Medium** (via [Freedium](https://codeberg.org/Freedium-cfd/web)), **Dev.to** (Forem API), and **Substack** (free posts via public API + HTML→Markdown).

## Quick start

```bash
bun install
bun run dev
```

## Usage

Deployed at `https://mdingest.knightker.workers.dev`:

```bash
curl "https://mdingest.knightker.workers.dev/v1/medium?url=https://medium.com/@user/article-id"
curl "https://mdingest.knightker.workers.dev/v1/devto?url=https://dev.to/user/article-slug"
curl "https://mdingest.knightker.workers.dev/v1/substack?url=https://pub.substack.com/p/article-slug"
```

Default response is `text/markdown` with YAML frontmatter + clean body:

```markdown
---
title: "Article Title"
author: "Author Name"
date: "2026-01-15"
reading_time: "5 min read"
free: true
source_url: "https://medium.com/@user/article-id"
provider: "medium"
tags:
  - "Distributed Systems"
---

# Article content in clean Markdown...
```

### JSON response (metadata + markdown)

Add `&format=json` to get `{ metadata, markdown }` as `application/json` instead of raw markdown:

```bash
curl "https://mdingest.knightker.workers.dev/v1/medium?url=https://medium.com/@user/article-id&format=json"
```

```json
{
  "metadata": {
    "title": "Article Title",
    "author": "Author Name",
    "date": "2026-01-15",
    "reading_time": "5 min read",
    "free": true,
    "source_url": "https://medium.com/@user/article-id",
    "provider": "medium",
    "tags": ["Distributed Systems"]
  },
  "markdown": "---\ntitle: \"Article Title\"...\n"
}
```

```markdown
---
title: "Article Title"
author: "Author Name"
date: "2026-01-15"
reading_time: "5 min read"
free: true
source_url: "https://medium.com/@user/article-id"
provider: "medium"
tags:
  - "Distributed Systems"
---

# Article content in clean Markdown...
```

### Local development

```bash
bun run dev
curl "http://localhost:3000/v1/medium?url=https://medium.com/@user/article-id"
```

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `FREEDIUM_BASE_URL` | `https://freedium-mirror.cfd` | Freedium mirror base URL |
| `CACHE_TTL_SECONDS` | `300` | Cache entry TTL (seconds) |
| `CACHE_MAX_ENTRIES` | `200` | Max cache entries |
| `FETCH_TIMEOUT_MS` | `20000` | Fetch timeout (ms) |
| `USER_AGENT` | Chrome 120 UA | User-Agent for upstream requests |

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

Each provider implements a `Provider` interface (`matches`, `convert`). Adding a provider = new folder under `modules/`, no changes to core or common. Service classes work with direct `new` outside NestJS, enabling future CLI and MCP entry points without duplication.

Errors return `{ code, message, details?, traceId }` with namespaced codes (`MEDIUM.INVALID_URL`, `SUBSTACK.PAID_POST`, `VALIDATION.FAILED`, etc.). Full contract in [`AGENTS.md`](AGENTS.md).

## Tech stack

| Tool | Role |
|---|---|
| Bun | Runtime |
| NestJS + Fastify | Framework (modules, DI, controllers) |
| Zod | Runtime validation (config, params, metadata) |
| lru-cache | In-memory cache with TTL |
| turndown | HTML→Markdown (Substack provider) |
| oxlint | Linting |
| @cloudflare/containers | Cloudflare Containers deployment |

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
bun run dev       # start dev server with hot reload
bun run test      # run unit tests
```

## Attribution

Medium articles fetched via [Freedium](https://codeberg.org/Freedium-cfd/web).
