# mdingest

[![CI](https://img.shields.io/github/actions/workflow/status/LOsioChico/mdingest/ci.yml?style=flat-square&label=CI)](https://github.com/LOsioChico/mdingest/actions)
[![License: MIT](https://img.shields.io/github/license/LOsioChico/mdingest?style=flat-square)](LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg?url=https://deepwiki.com/LOsioChico/mdingest)](https://deepwiki.com/LOsioChico/mdingest)
[![Last Commit](https://img.shields.io/github/last-commit/LOsioChico/mdingest?style=flat-square)](https://github.com/LOsioChico/mdingest/commits)

API that ingests blog/article/newsletter pages to clean Markdown for LLM consumption.
Supports **Medium** (via [Freedium](https://codeberg.org/Freedium-cfd/web)), **Dev.to** (Forem API), and **Substack** (free posts via public API + HTML→Markdown).
Four entry points: **HTTP API**, **CLI**, **MCP server (stdio)**, and **MCP server (HTTP)** — all sharing the same ingestion logic.

## Quick start

```bash
bun install
bun run dev          # HTTP API + web UI on port 3000
```

## Usage

### HTTP API

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

### CLI

```bash
# Ingest any article URL → markdown to stdout (auto-detects provider)
bun run src/cli.ts https://dev.to/user/post > article.md

# JSON output (metadata + markdown)
bun run src/cli.ts https://dev.to/user/post --json

# Override provider auto-detection
bun run src/cli.ts https://example.com/post --provider medium

# List supported providers
bun run src/cli.ts providers
```

Pipe-friendly: `mdingest https://dev.to/user/post > article.md` gives you clean Markdown with no log noise.

### MCP server

For AI tools (Claude, Cursor, etc.) — two ways to connect:

**Remote (zero setup):** Register the deployed endpoint directly:

```json
{
  "mcpServers": {
    "mdingest": {
      "url": "https://mdingest.knightker.workers.dev/v1/mcp"
    }
  }
}
```

**Local (stdio):** Run the CLI as a local process:

```json
{
  "mcpServers": {
    "mdingest": {
      "command": "bun",
      "args": ["run", "src/cli.ts", "mcp"]
    }
  }
}
```

Both expose the same two tools:

| Tool | Description |
|---|---|
| `ingest_article` | Ingest a URL into clean Markdown. Auto-detects provider. Returns markdown text by default; `json: true` for `{metadata, markdown}`. |
| `list_providers` | List supported providers with source, example URL, and accepted domains. |

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
    guards/         RateLimitGuard (30 req/min per IP, global via APP_GUARD)
    llm-visibility.ts  Fastify preHandler: Accept: text/markdown negotiation, Link headers, Vary, 406
    errors/         shapeError() — shared error shaping (filter, CLI, MCP)
  modules/
    medium/         Medium feature: controller, service, DTOs, errors
    devto/          Dev.to feature: controller, service, DTOs, errors
    substack/       Substack feature: controller, service, DTOs, errors
  mcp/              MCP server: server.ts (createMcpServer/startMcpServer/handleHttpRequest), tools.ts (ingest_article, list_providers)
  app.module.ts     Root module
  main.ts           Bootstrap (NestJS + Fastify + Bun, URI versioning, global filter)
  ingest.ts         Shared router: service registry + ingest(url) — used by CLI + MCP
  cli.ts            CLI entry: citty binary, `mdingest <url>` + `mdingest mcp` subcommand
  mcp.controller.ts MCP HTTP endpoint at /v1/mcp (Streamable HTTP transport)
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
    robots.txt      Allow all crawlers + Content-Signal directive + sitemap reference
    llms.txt        Curated markdown index for AI-mediated conversations
    llms-full.txt   All 3 pages concatenated for single-fetch LLM ingestion
    *.md             Markdown twins of each HTML page (index.md, ingest.md, docs.md)
    .well-known/
      ai-catalog.json          AI Catalog — domain-level agent discovery
      api-catalog              RFC 9727 API Catalog (linkset+json)
      mcp/server-card.json     MCP Server Card — pre-connection MCP client metadata
```

Four entry points share the same ingestion logic via `src/ingest.ts`:

| Entry point | File | How |
|---|---|---|
| HTTP API | `src/main.ts` | NestJS + Fastify, DI wires services, controller delegates to service |
| CLI | `src/cli.ts` | citty binary: `mdingest <url>` → markdown to stdout, `--json` for structured, `--provider` override |
| MCP server (stdio) | `src/cli.ts mcp` | stdio JSON-RPC: `ingest_article` + `list_providers` tools |
| MCP server (HTTP) | `src/mcp.controller.ts` | Streamable HTTP at `/v1/mcp` — same tools, remote, zero local setup |

Each provider implements a `Provider` interface (`matches`, `convert`). Adding a provider = new folder under `modules/`, no changes to core or common. Service classes work with direct `new` outside NestJS — CLI and MCP instantiate them via `src/ingest.ts` without booting NestJS.

URL detection is centralized in `shared/providers.ts` — `detectProvider(url)` is the single source of truth used by both the frontend (auto-detect) and all 3 backend DTOs (`isValid*Url` delegate to it).

Errors return `{ code, message, details?, traceId }` with namespaced codes (`MEDIUM.INVALID_URL`, `SUBSTACK.PAID_POST`, `VALIDATION.FAILED`, `RATE_LIMITED`, etc.). Full contract in [`AGENTS.md`](AGENTS.md). All endpoints are rate-limited at 30 req/min per IP.

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
| citty | CLI arg parsing + `--help` generation |
| @modelcontextprotocol/sdk | MCP server over stdio for AI tools |

### Frontend

| Tool | Role |
|---|---|
| Astro | Static site generator with React island support |
| @astrojs/sitemap | Sitemap generation (sitemap-index.xml + sitemap-0.xml) |
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
| CLI | Runtime-verified | `bun run src/cli.ts <url>` → markdown to stdout; `--json` for structured; `--provider` override; `mdingest providers` lists sources |
| MCP server (stdio) | Runtime-verified | `bun run src/cli.ts mcp` → stdio JSON-RPC; `ingest_article` + `list_providers` tools; all 3 providers verified |
| MCP server (HTTP) | Runtime-verified | `POST /v1/mcp` → Streamable HTTP transport; same tools; initialize handshake + session ID; all 3 providers verified |
| Rate limiting | Runtime-verified | Global `RateLimitGuard` via `APP_GUARD` — 30 req/min per IP; 31st request returns 429 `{ code: "RATE_LIMITED", details: { retryAfter } }` |
| LLM visibility | Runtime-verified | `robots.txt` + `llms.txt` + `llms-full.txt` + `.md` routes for all 3 pages + `Accept: text/markdown` content negotiation + `Link` headers + `Vary: Accept` + sitemap + FAQ on landing page. 6 Evil Martians techniques implemented. |
| Agent discovery | Runtime-verified | `.well-known/mcp/server-card.json` (MCP Server Card) + `.well-known/ai-catalog.json` (AI Catalog) + `.well-known/api-catalog` (RFC 9727 linkset). isitagentready.com: Agent-Readable L3. |

## Development

```bash
bun run verify    # typecheck + lint + impeccable (UI anti-pattern scan)
bun run dev       # start backend dev server with hot reload (port 3000)
bun run dev:web   # start Astro dev server (frontend only, port 4321)
bun run build:web # build Astro frontend to web/dist/
bun run test      # run unit tests (vitest)
bun run cli       # run CLI (bun run src/cli.ts <url>)
bun run mcp       # start MCP server (bun run src/cli.ts mcp)
```

## Attribution

Medium articles fetched via [Freedium](https://codeberg.org/Freedium-cfd/web).
