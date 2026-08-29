# mdingest

[![CI](https://img.shields.io/github/actions/workflow/status/LOsioChico/mdingest/ci.yml?style=flat-square&label=CI)](https://github.com/LOsioChico/mdingest/actions)
[![License: MIT](https://img.shields.io/github/license/LOsioChico/mdingest?style=flat-square)](LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg?url=https://deepwiki.com/LOsioChico/mdingest)](https://deepwiki.com/LOsioChico/mdingest)
[![Last Commit](https://img.shields.io/github/last-commit/LOsioChico/mdingest?style=flat-square)](https://github.com/LOsioChico/mdingest/commits)

API that ingests blog/article/newsletter pages to clean Markdown for LLM consumption.
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

Substack reader URLs are also supported (resolved via 302 redirect):

```bash
curl "https://mdingest.knightker.workers.dev/v1/substack?url=https://substack.com/home/post/p-212696442"
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

### Local development

```bash
bun run dev
curl "http://localhost:3000/v1/medium?url=https://medium.com/@user/article-id"
```

The web UI is at `http://localhost:3000/` — paste a URL, auto-detects the provider,
and shows the output with md/json tabs and line numbers.

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

shared/
  providers.ts      Single source of truth: MEDIUM_DOMAINS, PROVIDERS, detectProvider(), error codes

web/                 Astro static site (React islands)
  src/
    islands/        Ingestor.tsx — URL input, provider selector, output display
    pages/          index.astro (landing), ingest.astro (ingest UI), docs.astro (API docs)
    layouts/        Base.astro — shared header (sticky, backdrop-blur), footer, meta tags
    styles/         global.css — design tokens, base styles, shared components
  public/
    icons/          Provider SVG logos (medium, devto, substack)
```

Each provider implements a `Provider` interface (`matches`, `convert`). Adding a provider = new folder under `modules/`, no changes to core or common. Service classes work with direct `new` outside NestJS, enabling future CLI and MCP entry points without duplication.

URL detection is centralized in `shared/providers.ts` — `detectProvider(url)` is the single source of truth used by both the frontend (auto-detect) and all 3 backend DTOs (`isValid*Url` delegate to it).

Errors return `{ code, message, details?, traceId }` with namespaced codes (`MEDIUM.INVALID_URL`, `SUBSTACK.PAID_POST`, `VALIDATION.FAILED`, etc.). Full contract in [`AGENTS.md`](AGENTS.md).

## Tech stack

### Backend

| Tool | Role |
|---|---|
| Bun | Runtime |
| NestJS + Fastify | Framework (modules, DI, controllers) |
| Zod | Runtime validation (config, params, metadata) |
| lru-cache | In-memory cache with TTL |
| turndown | HTML→Markdown (Substack provider) |
| oxlint | Linting |
| @cloudflare/containers | Cloudflare Containers deployment |

### Frontend

| Tool | Role |
|---|---|
| Astro | Static site generator with React island support |
| React | Interactive islands (Ingestor component) |
| motion | Enter/exit animations |
| lucide-react + @lucide/astro | Icons |
| Geist + Geist Mono | Self-hosted fonts |

### UI quality

The `verify` script runs `impeccable` to scan the built frontend for UI anti-patterns
(WCAG AA contrast, line-height). Current state: 0 anti-patterns.

## Roadmap

| Feature | Status | How |
|---|---|---|
| HTTP API | Deployed — runtime-verified | `https://mdingest.knightker.workers.dev/v1/medium?url=...` — Cloudflare Containers |
| Medium provider | Runtime-verified | `GET /v1/medium?url=...` — Freedium dual-source, 48 unit tests |
| Dev.to provider | Runtime-verified | `GET /v1/devto?url=...` — Forem API, liquid tag transform, 38 unit tests |
| Substack provider | Runtime-verified | `GET /v1/substack?url=...` — public API + turndown HTML→Markdown, free posts only, home URL redirect resolution, 32 unit tests |
| Web UI | Runtime-verified | Astro + React islands — landing page, ingest page with md/json tabs + line numbers, API docs |
| CLI | Planned | `bun run src/cli.ts <url>` — direct `new` services, print markdown |
| MCP server | Planned | Expose `ingest_article` tool — same services, `@modelcontextprotocol/sdk` |

## Development

```bash
bun run verify    # typecheck + lint + impeccable (UI anti-pattern scan)
bun run dev       # start backend dev server with hot reload (port 3000)
bun run dev:web   # start Astro dev server (frontend only, port 4321)
bun run build:web # build Astro frontend to web/dist/
bun run test      # run unit tests (vitest)
```

## Attribution

Medium articles fetched via [Freedium](https://codeberg.org/Freedium-cfd/web).
