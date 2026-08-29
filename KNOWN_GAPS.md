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
| Additional providers (Substack, Dev.to) | Not started — `Provider` interface ready in `common/types/`. Dev.to research in [`docs/devto-extraction.md`](docs/devto-extraction.md) — no paywall, free Forem API returns native Markdown + full metadata in one unauthenticated call (simplest provider, ~50 lines liquid tag transform). Substack research in [`docs/substack-extraction.md`](docs/substack-extraction.md) — free posts extractable (HTML→Markdown needs `turndown` dep + 8+ custom component handlers for footnotes/LaTeX/embeds), paid posts hard server-side paywall, no native table support. Full coverage matrix in [`docs/markdown-coverage-matrix.md`](docs/markdown-coverage-matrix.md) |
