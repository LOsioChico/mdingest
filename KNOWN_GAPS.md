# KNOWN_GAPS.md — mdingest

## Known issues

| Issue | Severity | Status |
|---|---|---|
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up. Returns 502 for non-existent Medium URLs (correct), 200 for real ones. |
| Substack API rate-limits Cloudflare edge IPs | Medium | External — `wrangler dev` (local egress) ingests fine; the deployed Worker intermittently gets upstream 429 from substack.com. Not fixable from our side without a proxy; retry may succeed. |
| Workers migration (2026-10-17) | — | **Done** — NestJS/Fastify/Containers removed; Worker serves `/v1/*` + ASSETS directly. Old container app + DO namespace deleted via `wrangler containers delete` + `wrangler delete` redeploy. Zero container billing. |
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
| MCP server (HTTP) (`src/mcp/http.ts`) | Runtime-verified | `POST /v1/mcp` → stateless Streamable HTTP (fresh transport + server per request, no session IDs — required on Workers); `initialize` handshake verified; `tools/list` returns both tools; `tools/call ingest_article` with real dev.to URL → markdown text — all verified on `wrangler dev` AND the live deployment |
| Upstream response validation | Runtime-verified | Zod schemas on Dev.to/Substack JSON + Freedium extracted metadata + final `ArticleMetadata` on all 3 providers (incl. cache paths); 114 unit tests pass (8 new validation cases: missing/wrong-typed upstream fields -> `*ParseError` naming the field); live-verified via CLI: real Dev.to article -> `{metadata, markdown}` OK, real Substack post (pragmaticengineer.com) -> full markdown + metadata OK, real Medium article via Freedium -> enriched author/reading_time OK |
| Error shaping (`shapeError()`) | Runtime-verified | Extracted from AllExceptionsFilter; 118 tests pass; `curl` bad URL → `{code, message, traceId}` shape unchanged; CLI + MCP reuse same function |
| Rate limiting (`[[ratelimits]]` binding) | Runtime-verified | 35 rapid `curl /v1` on `wrangler dev` → 30×200 then 429 `{ code: "RATE_LIMITED", details: { retryAfter: 60 }, traceId }`; keyed by `cf-connecting-ip`; per-location, eventually consistent (platform semantics) |
| LLM visibility (`src/http/llm-visibility.ts`) | Runtime-verified | `curl /index.md` → 200 `text/markdown; charset=utf-8` + `Link: </>; rel="alternate"; type="text/html"`; `curl -H "Accept: text/markdown" /` → markdown (content negotiation); `curl -H "Accept: text/html" /` → HTML; q-value test passes both directions; `Accept: */*` → HTML (no false flip); `Link` + `Vary: Accept` on all 3 pages; 406 for `Accept: application/json` on web pages only; `.well-known/` paths skip negotiation (404 not 406); `robots.txt` + `llms.txt` + `llms-full.txt` + `sitemap-index.xml` served; `<link rel="alternate">` in HTML head; hidden markdown pointer in DOM; freshness date in footer; 7 FAQ items on landing page; `bun run verify` 0 errors; 118 tests pass; `build:web` succeeds with sitemap |
| Agent discovery (`.well-known/`) | Runtime-verified | `curl /.well-known/mcp/server-card.json` → 200 `application/json` (MCP Server Card with serverInfo.name + transport + capabilities); `curl /.well-known/ai-catalog.json` → 200 `application/json` (AI Catalog with 1 MCP entry); `curl /.well-known/api-catalog` → 200 `application/linkset+json` (RFC 9727 linkset with service-desc, sitemap, describedby, alternate rels); `Link: </.well-known/api-catalog>; rel="api-catalog"` header on all HTML pages; isitagentready.com scan: Agent-Readable L3 — robots.txt pass, sitemap pass, Link headers pass, markdown negotiation pass, content signals pass, AI bot rules pass, ARD pass |
