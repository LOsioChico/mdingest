# KNOWN_GAPS.md — mdingest

## Known issues

| Issue | Severity | Status |
|---|---|---|
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up |
| "Pipe tables" claim in AGENTS.md / service comments | Medium | **Unverified** — Freedium renderer source (`renderer.py`) shows no TABLE paragraph type. Medium's data model has no tables. The `/api/download` endpoint code is not in the GitHub repo. Needs curl verification when Freedium mirror is back online. See [`docs/markdown-coverage-matrix.md`](docs/markdown-coverage-matrix.md) |

## Not yet implemented

| Feature | Status |
|---|---|
| CLI (`src/cli.ts`) | Not started — verified feasible: `new MediumService(new FreediumService(), new CacheService())` works without NestJS boot |
| MCP server (`src/mcp.ts`) | Not started — same direct instantiation, wrap in `server.tool()` |
| Additional providers (Substack, Dev.to) | Both **implemented**. Dev.to: `GET /v1/devto?url=...`, 38 unit tests, live-verified. Substack: `GET /v1/substack?url=...`, 32 unit tests, live-verified — free posts only (paid posts return `SUBSTACK.PAID_POST` 403), HTML→Markdown via `turndown` + 8 custom component handlers (footnotes, LaTeX, YouTube, Twitter, mentions, embeds, subscribe buttons, image captions). Full coverage matrix in [`docs/markdown-coverage-matrix.md`](docs/markdown-coverage-matrix.md) |
