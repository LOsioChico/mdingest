<!-- Mirror of src/pages/index.astro — update both when changing content -->

# Articles to clean Markdown. For LLMs, RAG, or reading.

Paste a URL from Medium, Dev.to, or Substack. Get clean Markdown with YAML frontmatter: title, author, dates, tags, cover image.

## The problem

Web pages are noisy. LLMs need clean text.

- **No paywalls** — Medium articles via Freedium mirror. Full content, not truncated previews.
- **No UI noise** — Strips ads, nav, sidebars, popups, cookie banners. Just the article body.
- **Structured metadata** — YAML frontmatter with title, author, dates, reading time, tags, cover image.
- **RAG-ready** — Clean Markdown. Drop it into your vector DB, LLM context, or CI.

## Supported sources

Three sources, one API.

| Source | Endpoint | Backend | Example |
|---|---|---|---|
| Medium | `/v1/medium` | Freedium mirror | `https://medium.com/@user/article` |
| Dev.to | `/v1/devto` | Forem API | `https://dev.to/user/post` |
| Substack | `/v1/substack` | Public API | `https://example.substack.com/p/post` |

## Three ways to ingest

Same logic, four entry points. HTTP API for your code, CLI for your terminal, MCP for your AI tools.

### HTTP API

For your code, RAG pipeline, or CI.

```javascript
const res = await fetch(
  "https://mdingest.knightker.workers.dev/v1/devto?url=https://dev.to/user/post"
);
const { metadata, markdown } = await res.json();
```

### CLI

Pipe-friendly, markdown to stdout.

```bash
$ bun run src/cli.ts https://dev.to/user/post > article.md
# --json for {metadata, markdown}
# --provider medium to override
```

### MCP server

For Claude, Cursor, and other AI tools.

```json
{ "url": "https://mdingest.knightker.workers.dev/v1/mcp" }
```

Tools: `ingest_article`, `list_providers`.

## FAQ

### What is mdingest?

mdingest is an API that converts blog, article, and newsletter pages from Medium, Dev.to, and Substack into clean Markdown with YAML frontmatter. It strips ads, navigation, and UI noise so the output is ready for LLM ingestion, RAG pipelines, or reading.

### What sources are supported?

Three sources: Medium (via Freedium mirror, 42 accepted domains including custom domains like `itnext.io` and `towardsdatascience.com`), Dev.to (via public Forem API), and Substack (via public API, free posts only).

### Can I use this for RAG?

Yes. The default output is clean Markdown with structured YAML frontmatter (title, author, dates, reading time, tags, cover image). Drop it directly into your vector database, LLM context window, or CI pipeline. Use `format=json` to get `{ metadata, markdown }` as separate fields.

### Is there a rate limit?

Yes. 30 requests per minute per IP. When exceeded, the API returns HTTP 429 with `{ code: "RATE_LIMITED", details: { retryAfter } }` where `retryAfter` is seconds until the limit resets.

### Can I self-host?

Yes. The entire codebase is MIT licensed and on [GitHub](https://github.com/LOsioChico/mdingest). Deploy it on Cloudflare Containers (Worker + Docker container), or run it locally with `bun run dev`. The CLI and MCP server work standalone without the HTTP server.

### Does it work with paywalled Medium articles?

Yes. Medium articles are fetched via the Freedium mirror, which provides full article content regardless of Medium's paywall. The dual-source approach combines the download endpoint (markdown body, tags, dates) with the `__data.json` endpoint (author, reading time, cover image).

### Does it work with paid Substack posts?

No. Substack's public API only returns full content for free posts. Paid posts are server-side truncated, so the API returns `SUBSTACK.PAID_POST` (403) when a post is behind the paywall. Only free Substack posts can be converted.

## Source code

MIT licensed. Self-hostable. The entire codebase is on GitHub. Deploy it on Cloudflare, run it locally, or just read how it works.

- [github.com/LOsioChico/mdingest](https://github.com/LOsioChico/mdingest)
- [API Docs](/docs.md)
