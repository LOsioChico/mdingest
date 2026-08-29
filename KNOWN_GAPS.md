# KNOWN_GAPS.md — mdingest

## Known issues

| Issue | Severity | Status |
|---|---|---|
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up. Returns 502 for non-existent Medium URLs (correct), 200 for real ones. |
| "Pipe tables" claim in AGENTS.md / service comments | Medium | **Unverified** — Freedium renderer source (`renderer.py`) shows no TABLE paragraph type. Medium's data model has no tables. The `/api/download` endpoint code is not in the GitHub repo. No article tested so far contained a table. See [`docs/markdown-coverage-matrix.md`](docs/markdown-coverage-matrix.md) |
| `--ink-dim` low contrast | Low | `oklch(50% 0.02 260)` = 3.3:1 on dark bg (below WCAG AA 4.5:1). Must NOT be used for body text — only for non-essential UI like line numbers (with `opacity: 0.5`). Use `--ink-muted` for any text that needs to be readable. |
| `--space-10` / `--space-14` undefined | Low | NOT in the spacing scale. Use `--space-8` (32px) or `--space-12` (48px) instead. Documented in AGENTS.md design system section. |

## Verification status

| Component | Status | Verified by |
|---|---|---|
| Medium provider | Runtime-verified | `curl /v1/medium?url=<real-url>` → HTTP 200, 48 unit tests pass |
| Dev.to provider | Runtime-verified | `curl /v1/devto?url=<real-url>` → HTTP 200, 38 unit tests pass |
| Substack provider | Runtime-verified | `curl /v1/substack?url=<real-url>` → HTTP 200, 32 unit tests pass |
| Substack home URL resolution | Runtime-verified | `curl /v1/substack?url=https://substack.com/home/post/p-212696442` → 302 redirect resolved → HTTP 200 with full article |
| URL detection centralization | Runtime-verified | All 3 DTOs delegate to `detectProvider()`, 118 tests pass, all 3 providers return correct validation results |
| Frontend build | Runtime-verified | `bun run build` → 3 pages built, 0 errors |
| UI anti-patterns | Runtime-verified | `impeccable detect web/dist/` → 0 anti-patterns (WCAG AA contrast + line-height) |
| TypeScript | Runtime-verified | `tsc --noEmit` → 0 errors |
| Linting | Runtime-verified | `oxlint` → 0 warnings, 0 errors |

## Not yet implemented

| Feature | Status |
|---|---|
| CLI (`src/cli.ts`) | Not started — direct instantiation pattern verified feasible: `new MediumService(new FreediumService(), new CacheService())` works without NestJS boot |
| MCP server (`src/mcp.ts`) | Not started — same direct instantiation, wrap in `server.tool()` |
