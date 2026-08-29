# KNOWN_GAPS.md — mdingest

## Known issues

| Issue | Severity | Status |
|---|---|---|
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up. Returns 502 for non-existent Medium URLs (correct), 200 for real ones. |
| "Pipe tables" claim in AGENTS.md / service comments | Medium | **Resolved** — claim removed from all docs and code comments. Medium's data model has no tables; Freedium renderer.py has no TABLE paragraph type. |
| `--ink-dim` low contrast | Low | **Resolved** — bumped to `oklch(58% 0.02 260)` = 4.6:1 (WCAG AA compliant). All 17 usages verified as non-essential UI (placeholders, line numbers, footer links, disabled buttons, terminal chrome). |
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
| CLI (`src/cli.ts`) | Runtime-verified | `bun run src/cli.ts <url>` → markdown to stdout (no log lines); `--json` → `{metadata, markdown}`; bad URL → stderr `Error [VALIDATION.FAILED]`, exit 1; `--provider medium` override → `MEDIUM.INVALID_URL` for non-Medium URL; `mdingest providers` → lists 3 providers with sources + example URLs; all 3 providers verified (medium, devto, substack); substack home URL redirect resolution verified |
| MCP server (stdio) (`src/mcp/server.ts`) | Runtime-verified | `bun run src/cli.ts mcp` → stdio JSON-RPC; `initialize` handshake returns serverInfo; `tools/list` returns `ingest_article` + `list_providers`; `ingest_article` with real URL → markdown text, `isError: false`; `json: true` → `{metadata, markdown}`; bad URL → `isError: true` with `[CODE] message`; `list_providers` → 3 providers with metadata + 42 Medium domains; all 3 providers verified; substack home URL verified |
| MCP server (HTTP) (`src/mcp.controller.ts`) | Runtime-verified | `POST /v1/mcp` → Streamable HTTP transport; `initialize` returns session ID (`mcp-session-id` header); `notifications/initialized` → 202; `tools/list` returns both tools; `ingest_article` with real dev.to URL → markdown text, `isError: false`; bad URL → `isError: true` with `[VALIDATION.FAILED]`; `list_providers` → 3 providers + 42 Medium domains |
| Error shaping (`shapeError()`) | Runtime-verified | Extracted from AllExceptionsFilter; 118 tests pass; `curl` bad URL → `{code, message, traceId}` shape unchanged; CLI + MCP reuse same function |
| Rate limiting (`src/common/guards/rate-limit.guard.ts`) | Runtime-verified | 35 rapid `curl /v1/medium` requests → requests 1-30 return 503 (Freedium down), request 31 returns 429 `{ code: "RATE_LIMITED", message, details: { retryAfter: 44 }, traceId }`; `trustProxy: true` reads real IP from `x-forwarded-for` |
