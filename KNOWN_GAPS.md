# KNOWN_GAPS.md — mdingest

## Known issues

| Issue | Severity | Status |
|---|---|---|
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up. Returns 502 for non-existent Medium URLs (correct), 200 for real ones. |
| "Pipe tables" claim in AGENTS.md / service comments | Medium | **Unverified** — Freedium renderer source (`renderer.py`) shows no TABLE paragraph type. Medium's data model has no tables. The `/api/download` endpoint code is not in the GitHub repo. No article tested so far contained a table. See [`docs/markdown-coverage-matrix.md`](docs/markdown-coverage-matrix.md) |

## Not yet implemented

| Feature | Status |
|---|---|
| CLI (`src/cli.ts`) | Not started — direct instantiation pattern verified feasible: `new MediumService(new FreediumService(), new CacheService())` works without NestJS boot |
| MCP server (`src/mcp.ts`) | Not started — same direct instantiation, wrap in `server.tool()` |
