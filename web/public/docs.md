<!-- Mirror of src/pages/docs.astro — update both when changing content -->

# API Docs

REST API, CLI, and MCP server. Or use the [web interface](/ingest).

## Base URL

```
https://mdingest.knightker.workers.dev
```

## Endpoints

All endpoints share the same query parameters:

| Param | Required | Type | Description |
|---|---|---|---|
| `url` | yes | string | Article URL to ingest |
| `format` | no | `markdown` \| `json` | Response format (default: markdown) |

### Medium

`GET /v1/medium` — Medium via Freedium mirror.

```bash
$ curl "https://mdingest.knightker.workers.dev/v1/medium?url=https://medium.com/@user/article"
```

### Dev.to

`GET /v1/devto` — Dev.to via Forem API.

```bash
$ curl "https://mdingest.knightker.workers.dev/v1/devto?url=https://dev.to/user/post"
```

### Substack

`GET /v1/substack` — Substack via public API.

```bash
$ curl "https://mdingest.knightker.workers.dev/v1/substack?url=https://example.substack.com/p/post"
```

## Response

When `format=markdown` (default), returns `text/markdown` with YAML frontmatter:

```markdown
---
title: Article Title
author: Jane Doe
published: 2024-03-15
reading_time: 8 min
tags: [api, backend]
cover_image: https://...
---

# Article Title

Article body in clean Markdown...
```

When `format=json`, returns `application/json` with `{ metadata, markdown }`.

### Frontmatter fields

| Field | Type | Description |
|---|---|---|
| `title` | string | Article title |
| `author` | string | Author name |
| `published` | date | Publication date (ISO) |
| `updated` | date | Last updated date (ISO) |
| `reading_time` | string | Estimated reading time |
| `tags` | string[] | Article tags (Medium only) |
| `cover_image` | string | Cover image URL |

## CLI

Same ingestion logic, from the terminal. Auto-detects provider from URL.

```bash
$ bun run src/cli.ts https://dev.to/user/post > article.md

# JSON output (metadata + markdown)
$ bun run src/cli.ts https://dev.to/user/post --json

# Override provider auto-detection
$ bun run src/cli.ts https://example.com/post --provider medium

# List supported providers
$ bun run src/cli.ts providers
```

## MCP server

For AI tools (Claude, Cursor). Two ways to connect: remote (zero setup) or local (stdio).

### Remote (HTTP)

Register the deployed endpoint directly. No local install needed:

```json
{
  "mcpServers": {
    "mdingest": {
      "url": "https://mdingest.knightker.workers.dev/v1/mcp"
    }
  }
}
```

### Local (stdio)

Run the CLI as a local process:

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
| `ingest_article` | Ingest a URL into clean Markdown. Auto-detects provider. Returns markdown text by default; `json: true` for `{ metadata, markdown }`. |
| `list_providers` | List supported providers with source, example URL, and accepted domains. |

## Errors

All errors return `{ code, message, details?, traceId }`:

| Code | HTTP | When |
|---|---|---|
| `VALIDATION.FAILED` | 422 | Bad query params (Zod pipe) |
| `MEDIUM.INVALID_URL` | 400 | URL is not a Medium article |
| `MEDIUM.FREEDIUM_UNAVAILABLE` | 503 | Freedium mirror down or timed out |
| `MEDIUM.PARSE_FAILED` | 502 | Article data parsing failed |
| `DEVTO.INVALID_URL` | 400 | URL is not a Dev.to article |
| `DEVTO.UNAVAILABLE` | 503 | Dev.to API down or timed out |
| `DEVTO.PARSE_FAILED` | 502 | Article data parsing failed |
| `SUBSTACK.INVALID_URL` | 400 | URL is not a Substack article |
| `SUBSTACK.PAID_POST` | 403 | Post is not available for conversion |
| `SUBSTACK.UNAVAILABLE` | 503 | Substack API down or timed out |
| `SUBSTACK.PARSE_FAILED` | 502 | Article data parsing failed |
| `INTERNAL.ERROR` | 500 | Unexpected error |
| `NOT_FOUND` | 404 | Unknown route |
| `RATE_LIMITED` | 429 | Too many requests (30/min per IP) |

## Provider notes

- **Medium**: Freedium mirror (dual-source: download for markdown, data endpoint for metadata). Full article access.
- **Dev.to**: Public Forem API. No restrictions. Returns native Markdown.
- **Substack**: Public Substack API. Posts not available for conversion return `SUBSTACK.PAID_POST` (403).

## FAQ

### What is mdingest?

mdingest is an API that converts blog, article, and newsletter pages from Medium, Dev.to, and Substack into clean Markdown with YAML frontmatter. It strips ads, navigation, and UI noise so the output is ready for LLM ingestion, RAG pipelines, or reading.

### What sources are supported?

Three sources: Medium (via Freedium mirror, 42 accepted domains including custom domains like itnext.io and towardsdatascience.com), Dev.to (via public Forem API), and Substack (via public API, free posts only).

### Can I use this for RAG?

Yes. The default output is clean Markdown with structured YAML frontmatter (title, author, dates, reading time, tags, cover image). Drop it directly into your vector database, LLM context window, or CI pipeline. Use `format=json` to get `{ metadata, markdown }` as separate fields.

### Is there a rate limit?

Yes. 30 requests per minute per IP. When exceeded, the API returns HTTP 429 with `{ code: "RATE_LIMITED", message, details: { retryAfter }, traceId }` where `retryAfter` is seconds until the limit resets.

### Can I self-host?

Yes. The entire codebase is MIT licensed and on [GitHub](https://github.com/LOsioChico/mdingest). Deploy it on Cloudflare Containers (Worker + Docker container), or run it locally with `bun run dev`. The CLI and MCP server work standalone without the HTTP server.

### Does it work with paywalled Medium articles?

Yes. Medium articles are fetched via the Freedium mirror, which provides full article content regardless of Medium's paywall. The dual-source approach combines the download endpoint (markdown body, tags, dates) with the `__data.json` endpoint (author, reading time, cover image).

### Does it work with paid Substack posts?

No. Substack's public API only returns full content for free posts. Paid posts are server-side truncated, so the API returns `SUBSTACK.PAID_POST` (403) when a post is behind the paywall. Only free Substack posts can be converted.
