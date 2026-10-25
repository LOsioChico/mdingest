# AGENTS.md — mdingest Operating Contract

> API that ingests blog/article/newsletter pages to clean Markdown for LLM consumption.
> Currently supports Medium (via Freedium), Dev.to (via Forem API),
> and Substack (free posts via public API + HTML→Markdown).
> Designed for future providers.

Operating contract for any AI agent (Devin, Claude Code, Cursor) working on this repo.
Read this file before writing code.

## Communication style

1. Lead with the next action. First line is something the reader can do.
2. Number multi-step tasks. Each step is one bounded action.
3. End with one concrete next step.
4. Suppress tangents. Finish the first issue, then offer the second.
5. Restate state every turn. One-line status before the new action.
6. Specific time estimates. "About 15 minutes if tests cover this" — not "a bit".
7. Make wins visible. When something works, say so with evidence.
8. Matter-of-fact errors. State cause and fix. No "Uh oh" or "Oh no".
9. Cap lists at 5 items. Group into sub-lists or split into steps if longer.
10. No preamble, no recap, no closers.

## Code style

- Named exports only. No default exports. Greppable, explicit imports.
- Short files. One responsibility per file. If a file exceeds ~150 lines, split it.
- Tables over paragraphs in docs and comments. Scannable, not readable.
- Flat folder structure. Max 2 levels deep under `src/`.
- File names say what's inside. `freedium.service.ts` fetches from Freedium. No `utils.ts`.
- No walls of text in comments. If a comment exceeds 3 lines, it's a doc — move it to `docs/`.
- Functional style: pure functions where possible, no classes except provider services (kept as classes for the `Provider` interface).
- Use TypeScript features: type narrowing, discriminated unions, `satisfies`, `as const`.

## Terminology

This project uses **ingest** terminology, not "convert":

| Term         | Use            | Don't use       |
| ------------ | -------------- | --------------- |
| Feature name | ingest         | convert         |
| UI component | `Ingestor.tsx` | `Converter.tsx` |
| Route        | `/ingest`      | `/convert`      |
| Function     | `handleIngest` | `handleConvert` |
| Result type  | `IngestResult` | `ConvertResult` |
| CSS class    | `ingestor-*`   | `converter-*`   |
| Button text  | "Ingest"       | "Convert"       |

The `Provider` interface still uses `convert(url)` as the method name — this is the
internal API contract and changing it would break all services. The rename is
UI/facing only.

## What this project is

An API that ingests blog/article/newsletter pages to clean Markdown for LLM consumption.
Medium articles are fetched via Freedium mirror using a dual-source
approach: the download endpoint for finished markdown + the `__data.json` endpoint for
metadata (author, reading_time, cover image). Output includes YAML frontmatter with rich metadata.

**The goal:** give LLMs and deep research workflows clean, structured Markdown from any
article source — no paywalls, no UI noise, no ads, just content.

**What it is NOT:** a scraper, a CMS, or a full-text search engine.

## Architecture

### Multi-entry-point design

The ingestion logic lives in plain service classes (`MediumService`, `DevtoService`,
`SubstackService`, `FreediumService`, `CacheService`) — no framework, no DI container.
All services work with `new`:

```typescript
const service = new MediumService(new FreediumService(), new CacheService());
const result = await service.convert(url); // works in Worker, CLI, or MCP
```

This enables four entry points sharing the same logic, no duplication:

| Entry point        | File                    | How it works                                                                                                                                                                                          |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP API           | `src/worker.ts`         | Cloudflare Worker: `/v1/*` → `src/http/api.ts` router → Zod schema → `ingest()` → service. Everything else → `src/http/llm-visibility.ts` → ASSETS binding.                                           |
| CLI                | `src/cli.ts`            | citty binary: `mdingest <url>` → markdown to stdout, `--json` for `{metadata, markdown}`, `--provider` override. Routes to shared `ingest()` in `src/ingest.ts`. Services log to stderr only.          |
| MCP server (stdio) | `src/cli.ts mcp`        | `mdingest mcp` subcommand → stdio JSON-RPC (`src/mcp/stdio.ts`). Two tools: `ingest_article` + `list_providers`.                                                                                        |
| MCP server (HTTP)  | `src/mcp/http.ts`       | `ALL /v1/mcp` → stateless Streamable HTTP transport (`WebStandardStreamableHTTPServerTransport`, `sessionIdGenerator: undefined`, fresh transport per request). Same tools as stdio, remote, zero setup. |

API, CLI and MCP are thin shells over `src/ingest.ts` — a shared router that instantiates
the services once at module load and delegates to `convert()`. Error shaping is shared
via `src/common/errors/shape-error.ts` (`shapeError()`), reused by the Worker error
boundary, CLI, and MCP.

### Layer separation

```
core/config/          → Config (Zod-validated, frozen object; defaults on Workers, env override in CLI)
core/cache/           → In-memory LRU cache (per-isolate on Workers)
integrations/freedium/→ HTTP client for Freedium mirror (download + data endpoints)
common/types/         → Shared types: ArticleMetadata schema, Provider interface
common/errors/        → IngestError base + shapeError() — shared error contract (API, CLI, MCP)
http/api.ts           → /v1 router: provider endpoints, /v1/mcp dispatch, 404/405 shaping
http/llm-visibility.ts→ Accept: text/markdown negotiation, Link headers, Vary, 406 — over ASSETS
modules/medium/       → Medium feature: service, DTOs, errors
modules/devto/        → Dev.to feature: service, DTOs, errors
modules/substack/     → Substack feature: service, DTOs, errors, domino.d.ts (type shim)
mcp/                  → server.ts (createMcpServer), stdio.ts, http.ts (stateless transport), tools.ts
ingest.ts             → Shared router: service registry + ingest(url, opts?) — used by API, CLI, MCP
cli.ts                → CLI entry: citty binary, `mdingest <url>` + `mdingest mcp` subcommand
worker.ts             → Worker entrypoint: /v1/* → API + rate limit; else → ASSETS + negotiation
```

**The separation rule:**

- `core/` — app-wide infrastructure (config, cache).
- `integrations/` — external service clients (Freedium). Thin wrappers, no business logic.
- `common/` — generic, domain-less utilities (types, errors). No business logic.
- `http/` — the Worker's HTTP surface (API router, content negotiation).
- `modules/` — business features (Medium, Dev.to, Substack). Owns its service, DTOs, errors.

Provider-specific logic (metadata extraction, image replacement, URL validation) lives in
`modules/<name>/`. If you're tempted to add a Medium-specific concern in `common/`, stop.

### Shared code (`shared/providers.ts`)

Single source of truth for values used by both backend and frontend:

| Export                         | Purpose                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `MEDIUM_DOMAINS`               | 42 Medium domains (from Freedium's known list)                                                               |
| `PROVIDERS`                    | Provider metadata: id, label, endpoint, source, url, icon, example                                           |
| `detectProvider(url)`          | URL → provider id mapping. Used by frontend (auto-detect) + all 3 backend DTOs (`isValid*Url` delegate here) |
| `ProviderId`                   | Type: `"medium" \| "devto" \| "substack"`                                                                    |
| `BASE_URL`, `GITHUB_URL`, etc. | Site constants                                                                                               |
| `ERROR_CODES`                  | Error code reference (used by docs page)                                                                     |
| `FRONTMATTER_FIELDS`           | Frontmatter field reference (used by docs page)                                                              |

**Why centralized:** `detectProvider` was previously duplicated in 4 places (frontend
`Ingestor.tsx` + 3 backend DTOs). All had the same `pathParts` / hostname logic. Now
the DTOs are thin wrappers: `isValidDevtoUrl = (url) => detectProvider(url) === "devto"`.

### Root route (`GET /`)

Returns API metadata as JSON: `{ name, version, endpoints, source }`. Implemented in
`src/http/api.ts` (`apiInfo`). Endpoints object lists all REST provider routes
(`/v1/medium`, `/v1/devto`, `/v1/substack`). The MCP endpoint (`/v1/mcp`) is not listed
here — it uses JSON-RPC, not REST query params.

### Data flow (dual-source)

```
GET /v1/medium?url=...
  → src/http/api.ts: MediumConvertQuerySchema.safeParse (422 VALIDATION.FAILED on bad input)
  → ingest(url, { provider: "medium" })
  → MediumService.convert(url)
    → CacheService.get(url) — return cached if hit
    → FreediumService.fetchMarkdown(url) — GET /api/download?url=...
        Returns finished markdown with frontmatter, tags, code languages
        Retries up to 5 times if [Embedded content] placeholders detected (~20% failure rate)
    → FreediumService.fetchArticleData(url) — GET /<url>/__data.json
        Returns SvelteKit devalue data: article metadata (author, reading_time, postImage)
    → Merge: parse download frontmatter + enrich with article metadata
    → Replace <picture> HTML tags with markdown image syntax
    → Inject cover image (from postImage) after H1
    → buildFrontmatter(merged metadata) + enriched body → full markdown string
    → CacheService.set(url, markdown)
  → Response: text/markdown or application/json
  → On error: worker error boundary shapes to { code, message, details?, traceId }
```

### Substack home URL resolution

Substack reader URLs (`https://substack.com/home/post/p-{id}`) redirect (302) to the
real article URL (`https://{pub}.substack.com/p/{slug}`). The service resolves this
redirect before fetching the API:

```
GET /v1/substack?url=https://substack.com/home/post/p-212696442
  → isValidSubstackUrl (accepts /home/post/p-{id} pattern via detectProvider)
  → isSubstackHomeUrl → true
  → resolveHomeUrl: fetch with redirect: "manual", extract Location header
  → resolvedUrl = https://{pub}.substack.com/p/{slug}
  → fetchPost(resolvedUrl) → normal flow
```

### Why dual-source

Freedium exposes two access modes, each with different data:

| Source          | Gives us                                                                                                 | Misses                                 |
| --------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `/api/download` | Tags, code languages, frontmatter, published/updated dates, free flag, inline images as `<picture>` HTML | Author name, reading time, cover image |
| `__data.json`   | Author name, reading time, postImage (cover)                                                             | Tags, code languages                   |

Combining both gives us everything accessible. Tags are not recoverable
from any other source (Medium's GraphQL API is Cloudflare-blocked without auth).

### Freedium renderer non-determinism

Freedium's `/api/download` endpoint is non-deterministic — ~20% of requests return
`[Embedded content: <hash>]` placeholders instead of rendered content. We retry
up to 5 times and keep the response with the fewest placeholders. At ~80% clean rate
per attempt, 5 retries = ~99.97% chance of a clean fetch.

### Accepted Medium domains

URL validation accepts 42 domains sourced from Freedium's `KNOWN_MEDIUM_DOMAINS` +
`KNOWN_MEDIUM_CUSTOM_DOMAINS` (medium-parser/medium_parser/utils.py). Includes
`medium.com`, `*.medium.com`, and publication custom domains like `itnext.io`,
`levelup.gitconnected.com`, `betterprogramming.pub`, `towardsdatascience.com`, etc.
Full list in `shared/providers.ts` (`MEDIUM_DOMAINS`).

### Provider interface

Every content source implements the `Provider` interface:

```typescript
interface Provider {
  readonly name: string;
  matches(url: string): boolean;
  convert(url: string): Promise<ConvertResult>;
}
```

Future providers add a new folder under `modules/`, implement the
interface, and register in `src/ingest.ts` + `PROVIDER_SCHEMAS` in `src/http/api.ts`.
Common modules don't change.

### Error contract

All errors follow the standard shape: `{ code, message, details?, traceId }`

| Code                          | HTTP | When                                                                             |
| ----------------------------- | ---- | -------------------------------------------------------------------------------- |
| `VALIDATION.FAILED`           | 422  | Bad query params (Zod schema). `details[]` contains Zod issue messages.          |
| `MEDIUM.INVALID_URL`          | 400  | URL is not a Medium article (service-level check)                                |
| `MEDIUM.FREEDIUM_UNAVAILABLE` | 503  | Freedium mirror down or timed out                                                |
| `MEDIUM.PARSE_FAILED`         | 502  | Article data parsing failed (e.g. cache corruption)                              |
| `DEVTO.INVALID_URL`           | 400  | URL is not a Dev.to article                                                      |
| `DEVTO.UNAVAILABLE`           | 503  | Dev.to API down or timed out                                                     |
| `DEVTO.PARSE_FAILED`          | 502  | Article data parsing failed (e.g. cache corruption)                              |
| `SUBSTACK.INVALID_URL`        | 400  | URL is not a Substack article                                                    |
| `SUBSTACK.PAID_POST`          | 403  | Post is behind a paywall (only free posts ingested)                              |
| `SUBSTACK.UNAVAILABLE`        | 503  | Substack API down or timed out                                                   |
| `SUBSTACK.PARSE_FAILED`       | 502  | Article data parsing failed (e.g. cache corruption)                              |
| `INTERNAL.ERROR`              | 500  | Unexpected error                                                                 |
| `NOT_FOUND`                   | 404  | Unknown route                                                                    |
| `RATE_LIMITED`                | 429  | Too many requests (30/min per IP). `details.retryAfter` has seconds until reset. |

Typed domain errors in `modules/<provider>/errors/` extend `IngestError`
(`src/common/errors/ingest-error.ts`), which carries `httpStatus` + `code` + `details`.
The error boundary in `src/worker.ts` shapes every error to the standard contract.

**Frontend error handling:** The Ingestor component maps error codes to human-readable
messages via `ERROR_MESSAGES`. For `VALIDATION.FAILED`, the first Zod detail message is
appended (e.g. "That URL doesn't match the expected format. Must be a Substack article URL").

### API versioning

URI versioning: `/v1/medium?url=...`. Bump to `/v2/` on breaking changes.
The prefix is matched literally in `src/worker.ts` and dispatched in `src/http/api.ts`.

### Rate limiting

Native `[[ratelimits]]` binding (`env.RATE_LIMITER`) — 30 requests per 60s per client IP
(`cf-connecting-ip`) across `/v1/*` paths. Enforced in `src/worker.ts` before dispatch.
Counters are per-Cloudflare-location and eventually consistent (platform behavior —
protection, not accounting). On limit: 429 `{ code: "RATE_LIMITED", details: { retryAfter: 60 }, traceId }`.

## Frontend (`web/`)

Astro static site with React islands. Served by the Worker via the `ASSETS` binding (`web/dist`).

### Structure

```
web/
  public/
    favicon.svg          SVG favicon — accent-colored rounded square with white "m"
    og.svg               Open Graph image
    icons/               Provider SVG logos (medium, devto, substack, bun, cloudflare)
    robots.txt           Allow all crawlers + Content-Signal directive + sitemap reference
    llms.txt             Curated markdown index for AI-mediated conversations
    llms-full.txt        All 3 pages concatenated for single-fetch LLM ingestion
    index.md             Markdown twin of homepage (for .md route + content negotiation)
    ingest.md            Markdown twin of ingest page
    docs.md              Markdown twin of docs page
    .well-known/
      ai-catalog.json    AI Catalog — domain-level discovery of agent capabilities (MCP, A2A)
      api-catalog        RFC 9727 API Catalog — linkset+json pointing to service-desc, sitemap, llms.txt
      mcp/server-card.json  MCP Server Card — pre-connection metadata for MCP clients (serverInfo + transport + capabilities)
  src/
    components/
      CodeBlock.astro    Terminal-style code block with copy button (currently unused)
    islands/
      Ingestor.tsx       React island — URL input, provider selector, output display
    layouts/
      Base.astro         Shared layout — header (sticky, backdrop-blur), footer, meta tags
    pages/
      index.astro        Landing page — hero, the problem, supported sources, three access methods (HTTP API, CLI, MCP), FAQ (7 items), source code
      ingest.astro       Ingest page — Ingestor island + supported sources + output formats
      docs.astro         API documentation — endpoints, response formats, error codes (incl. RATE_LIMITED), frontmatter fields, CLI usage, MCP server config + tools, /ingest link
    styles/
      global.css         Design tokens, base styles, shared components (.btn, .provider-icon, .terminal)
```

### Astro config (`astro.config.mjs`)

| Setting                         | Value                                      | Purpose                                                                           |
| ------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `output`                        | `'static'`                                 | Static site generation (no SSR)                                                   |
| `site`                          | `'https://mdingest.knightker.workers.dev'` | Canonical URL — required by `@astrojs/sitemap` for absolute URLs in sitemap       |
| `integrations`                  | `[react(), sitemap()]`                     | React island support + sitemap generation (`sitemap-index.xml` + `sitemap-0.xml`) |
| `build.format`                  | `'directory'`                              | Directory-based output (`/ingest/index.html`)                                     |
| `build.inlineStylesheets`       | `'always'`                                 | Inline all CSS — no external stylesheet requests                                  |
| `devToolbar`                    | `{ enabled: false }`                       | Disable Astro dev toolbar in dev mode                                             |
| `vite.resolve.alias['@shared']` | `../shared/`                               | Alias for importing `shared/providers.ts` in islands/pages                        |

### Design system

| Token             | Value                      | Purpose                                                                                              |
| ----------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--accent`        | `oklch(63% 0.20 250)`      | Primary accent (WCAG AA compliant, 4.5:1 on dark bg)                                                 |
| `--accent-hover`  | `oklch(68% 0.20 250)`      | Lighter on hover (not darker — dark bg)                                                              |
| `--accent-subtle` | `oklch(63% 0.20 250 / 8%)` | Subtle accent background (8% opacity)                                                                |
| `--bg`            | `oklch(15% 0.02 260)`      | Page background                                                                                      |
| `--bg-surface`    | `oklch(19% 0.02 260)`      | Card/terminal background                                                                             |
| `--bg-elevated`   | `oklch(23% 0.02 260)`      | Button background                                                                                    |
| `--ink`           | `oklch(95% 0.01 260)`      | Primary text                                                                                         |
| `--ink-muted`     | `oklch(65% 0.02 260)`      | Secondary text (WCAG AA compliant)                                                                   |
| `--ink-dim`       | `oklch(58% 0.02 260)`      | Tertiary text (4.6:1 — AA compliant, non-essential UI like line numbers, placeholders, footer links) |
| `--border`        | `oklch(28% 0.02 260)`      | Default border                                                                                       |
| `--border-bright` | `oklch(35% 0.02 260)`      | Hover border                                                                                         |
| `--font-display`  | Geist Variable             | Display/headings                                                                                     |
| `--font-body`     | Geist Variable             | Body text                                                                                            |
| `--font-mono`     | Geist Mono Variable        | Monospace (buttons, code, labels)                                                                    |

**Spacing scale:** `--space-1` (4px), `--space-2` (8px), `--space-3` (12px), `--space-4` (16px),
`--space-6` (24px), `--space-8` (32px), `--space-12` (48px), `--space-16` (64px), `--space-24` (96px),
`--space-32` (128px). Note: `--space-10` and `--space-14` are NOT defined — use `--space-8` or
`--space-12` instead.

### Provider icons

Provider logos use CSS mask technique (not `<img>` tags) so they inherit text color:

```css
.provider-icon {
  background: currentColor;
  mask-image: var(--icon-url);
  mask-size: contain;
  /* ... */
}
```

Usage: `<span class="provider-icon" style="--icon-url: url(/icons/medium.svg)"></span>`

**Why mask, not `<img>`:** `<img>` can't inherit CSS `color` — SVGs with `fill="currentColor"`
resolve to black/default, invisible on dark backgrounds. The mask technique uses the SVG
shape as a mask and fills with `currentColor`, so icons match text color in any state
(active/inactive/hover).

All provider SVGs in `web/public/icons/` use `fill="currentColor"` internally.

### Ingestor component (`Ingestor.tsx`)

React island with:

- URL input with auto-detect (calls `detectProvider` from `shared/providers.ts`)
- Segmented control for manual provider override (3 segments in one bordered container)
- Terminal-style output with md/json tabs, line numbers, copy/download actions
- Error display with human-readable messages mapped from API error codes

### UI verification (`impeccable`)

The `verify` script runs `npx impeccable detect web/dist/` to scan the built frontend
for UI anti-patterns:

| Anti-pattern  | What it checks                                    |
| ------------- | ------------------------------------------------- |
| Low contrast  | WCAG AA (4.5:1 for body text, 3:1 for large text) |
| Tight leading | `line-height` below 1.5 on text elements          |

**Current state:** 0 anti-patterns. Previous fixes:

- `--accent` raised from `oklch(55% 0.20 250)` to `oklch(63% 0.20 250)` for AA compliance
- `--accent-hover` changed from darker (58%) to lighter (68%) — dark bg means hover should brighten
- Explicit `line-height: 1.5` added to `.lead`, `.btn`, and form element resets

### LLM visibility (`src/http/llm-visibility.ts`)

The marketing site practices what the API preaches — clean Markdown for LLM ingestion.
Implements the 6 proven techniques from [Evil Martians](https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms):

| Technique           | Implementation                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `robots.txt`        | `web/public/robots.txt` — allow all + `Content-Signal: search=yes, ai-input=yes, ai-train=yes` + sitemap reference                                                                                                                                                                                                                                               |
| `llms.txt`          | `web/public/llms.txt` — curated markdown index (README for AI-mediated conversations, not a sitemap)                                                                                                                                                                                                                                                             |
| `.md` routes        | `web/public/{index,ingest,docs}.md` — markdown twins of each HTML page, served at `/{page}.md`                                                                                                                                                                                                                                                                   |
| `Link` headers      | `serveSite()` in the Worker sets `Link: <{path}.md>; rel="alternate"; type="text/markdown"` on all HTML responses, and reverse link on `.md` responses                                                                                                                                                                                                              |
| Hidden pointer      | `<div class="visually-hidden">` in `Base.astro` — announces `.md` URL to scrapers that read DOM text                                                                                                                                                                                                                                                             |
| Content negotiation | `Accept: text/markdown` → serves `.md` file instead of HTML. Uses q-value comparison (not substring). `hasExplicitType` guard prevents `*/*` (browsers) from flipping to markdown. 406 only when path has a `.md` twin and neither HTML nor markdown is acceptable. `.well-known/` paths skip negotiation entirely (machine-readable endpoints, not HTML pages). |

**Why the Worker, not Astro:** Astro `output: 'static'` generates HTML files only. Content negotiation and `Link` headers must happen at request time, so `run_worker_first = true` routes every request through the Worker, which calls `env.ASSETS.fetch()` for the actual files.

Additional LLM visibility features:

- `llms-full.txt` — all 3 pages concatenated for single-fetch ingestion (3-4x more traffic than `llms.txt` per Mintlify CDN analysis)
- `<link rel="alternate" type="text/markdown">` in HTML `<head>` (Base.astro)
- `Vary: Accept` on all web responses
- FAQ section on landing page (7 Q&A pairs in JS-controlled accordion — single-open, smooth height via `grid-template-rows: 0fr→1fr`, text in DOM regardless of collapse state)
- Freshness signal: "Last updated: 2026-08-29" in footer
- `@astrojs/sitemap` generates `sitemap-index.xml` + `sitemap-0.xml` at build time
- `.well-known/ai-catalog.json` — AI Catalog for domain-level agent discovery (links to MCP Server Card)
- `.well-known/mcp/server-card.json` — MCP Server Card for pre-connection MCP client discovery (`serverInfo.name` + `transport` + `capabilities`)
- `.well-known/api-catalog` — RFC 9727 API Catalog served as `application/linkset+json` (linkset pointing to service-desc, sitemap, llms.txt). Extensionless file — `serveSite()` overrides the Content-Type. Advertised via `Link: </.well-known/api-catalog>; rel="api-catalog"` header on all HTML pages.

**Anti-patterns refused** (no evidence they work): `<meta name="ai-content-url">`, `ai.txt`, HTML comments for AI, AI toggle buttons, User-Agent sniffing (cloaking), JSON-LD for LLM visibility.

## Dependencies and why each

### Backend (`package.json`)

| Dep                               | What it solves                                                                             | Why not alternatives                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Workers (platform)     | Runtime: routing, static assets, rate limiting                                             | `worker.ts` + `src/http/` replace the old framework HTTP layer. Assets via `ASSETS` binding, rate limit via native `[[ratelimits]]` binding.                                                                                                                                                                                            |
| `lru-cache`                       | In-memory LRU cache for fetched articles                                                   | Custom Map-based cache lacks TTL. lru-cache is the standard, 11.5.2, actively maintained.                                                                                                                                                                                                                                              |
| `zod`                             | Runtime validation of request params and response shape                                    | Hand-written validation drifts. Zod schemas infer TS types. 3.25.76.                                                                                                                                                                                                                                                                   |

| `citty`                           | CLI arg parsing + `--help` generation                                                      | Commander is heavier. citty is ~3KB, works on Bun + Node. 0.2.2.                                                                                                                                                                                                                                                                       |
| `@modelcontextprotocol/sdk`       | MCP server over stdio + HTTP for AI tools (Claude, Cursor)                                 | Official spec implementation. Same services + `ingest()` router as CLI, wrapped as JSON-RPC tools. Stdio transport for local; stateless `WebStandardStreamableHTTPServerTransport` (fresh transport per request) for remote `/v1/mcp`. 1.30.0.                                                                                         |
| `@cloudflare/workers-types` (dev) | TypeScript types for Workers APIs (`Fetcher`, `RateLimit`, `ExportedHandler`)               | Required for `src/worker.ts` typechecking.                                                                                                                                                                                                                                                                                             |
| `turndown` + `@mixmark-io/domino` | HTML→Markdown for Substack provider (body_html → markdown)                                 | Substack API returns HTML only. domino supplies the DOM turndown needs on Workers (no DOMParser there). turndown's `addRule()` API enables per-component custom rules for Substack's 8+ custom HTML components (footnotes, LaTeX, embeds, mentions). Alternatives: `html-to-md` (no custom rule API, only skip tags), `node-html-markdown` (limited `customTranslators`). 7.2.4, 1 dep (`@mixmark-io/domino`). |
| `@types/turndown` (dev)           | TypeScript types for turndown                                                              | Required for typechecking. 5.0.6.                                                                                                                                                                                                                                                                                                      |
| `vitest` (dev)                    | Test runner                                                                                | Used by `bun run test`. Fast, Vite-based, supports Bun runtime. 3.2.7.                                                                                                                                                                                                                                                                 |
| `@types/bun` (dev)                | TypeScript types for Bun runtime APIs                                                      | Required for `tsconfig.json` types. 1.4.0.                                                                                                                                                                                                                                                                                             |
| `oxlint` (dev)                    | Linter                                                                                     | Fast Rust-based linter. Config in `.oxlintrc.json`. 1.80.0.                                                                                                                                                                                                                                                                            |
| `impeccable` (dev)                | UI anti-pattern scanner                                                                    | Scans built frontend for WCAG AA contrast + line-height issues. Used in `verify` script. 3.6.0.                                                                                                                                                                                                                                        |

### Frontend (`web/package.json`)

| Dep                                         | What it solves                                      | Why not alternatives                                                                                                                                 |
| ------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `astro`                                     | Static site generator with React island support     | Next.js is heavier. Astro gives zero-JS by default with selective hydration. 7.2.9.                                                                  |
| `@astrojs/react`                            | React integration for Astro islands                 | Required for `Ingestor.tsx` (client:load). 6.0.4.                                                                                                    |
| `@astrojs/sitemap`                          | Sitemap generation for search engines + AI crawlers | Generates `sitemap-index.xml` + `sitemap-0.xml` at build time. Referenced from `robots.txt`. Required `site` config option for absolute URLs. 3.7.3. |
| `react` + `react-dom`                       | UI library for interactive islands                  | Needed for the Ingestor component (state, effects). 19.2.8.                                                                                          |
| `lucide-react`                              | Icon library (React)                                | Used in Ingestor for Copy, Download, AlertCircle, etc. 1.33.0.                                                                                       |
| `@lucide/astro`                             | Icon library (Astro)                                | Used in static pages for ChevronRight, ArrowRight, LockOpen, Broom, Braces, Database, FileInput, BookOpen, Star, Heart, GitHub icon. 1.33.0.         |
| `@fontsource-variable/geist` + `geist-mono` | Font loading                                        | Geist (body) + Geist Mono (code/buttons/labels). Self-hosted, no Google Fonts.                                                                       |
| `@types/react` + `@types/react-dom` (dev)   | TypeScript types for React                          | Required for typechecking the Ingestor island. 19.2.18 / 19.2.5.                                                                                     |

**What we deliberately did NOT add:**

| Rejected                   | Why                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cheerio`                  | No longer needed — image replacement done with regex on `<picture>` tags in markdown body. No HTML parsing required.                                                                                                                |
| `@nestjs/config`           | Overkill for 5 config values. Hardcoded defaults + env override is simpler.                                                                                                                                                         |
| `@nestjs/*`, `fastify`     | Removed in the Workers migration — the HTTP layer is a native `fetch` handler now.                                                                                                                                                  |
| `@cloudflare/containers`   | Removed — the Worker serves requests directly; no Docker container to run or pay for.                                                                                                                                               |
| `redis`                    | In-memory LRU is sufficient for a personal API. No external service to manage.                                                                                                                                                      |
| `html-to-md`               | No custom rule API — only supports `renderCustomTags: 'SKIP'`. Can't transform Substack's custom components (footnotes→`[^N]`, LaTeX→`$$...$$`, etc.).                                                                              |
| `node-html-markdown`       | `customTranslators` is less flexible than turndown's `addRule(filter, replacement)`. Larger dependency tree (`node-html-parser`).                                                                                                   |
| `tailwindcss`              | Project uses CSS custom properties (design tokens in `global.css`). Tailwind would add build complexity for a 3-page site.                                                                                                          |
| `motion` (framer-motion)   | Removed — was 37 KB gzipped for 2 fade-ins. Replaced with CSS `opacity` + `transform` transitions + `requestAnimationFrame` for enter/exit. FAQ accordion uses `grid-template-rows: 0fr→1fr` + vanilla JS for single-open behavior. |

## Engineering discipline

### Verify before you assert (G2, G12)

Never say "working" or "done" without running `bun run verify` (typecheck + lint + impeccable) AND
the actual command/flow. Show the output.

### curl first, code second (G13)

Before writing any fetch logic:

1. `curl` the real endpoint
2. Check HTTP status AND response body
3. Only then write the service function

### One change, one verification (G17)

Don't stack 5 changes and then build. After each significant change:

1. Typecheck (`tsc --noEmit`)
2. Run the specific command that changed
3. Only then move to the next change

### Read before you edit (G10)

Never edit from memory. Read the file first, then edit.

### YAGNI ladder (G6)

Before writing code, stop at the first rung that holds:

1. Does this need to exist?
2. Already in codebase?
3. stdlib?
4. native platform (Bun/Node APIs)?
5. installed dep?
6. one line?
7. minimum code that works

### No unrequested abstractions (G19)

Shortest working diff wins. Don't add boilerplate, interfaces, or patterns nobody asked for.

## Config

Zod-validated env vars with hardcoded defaults. No config files — invalid env throws at load.
On Workers the defaults apply (`process.env` is absent); env override still works under Bun (CLI).

| Env var             | Default                       | Purpose                          |
| ------------------- | ----------------------------- | -------------------------------- |
| `FREEDIUM_BASE_URL` | `https://freedium-mirror.cfd` | Freedium mirror base URL         |
| `CACHE_TTL_SECONDS` | `300` (5 min)                 | Cache entry TTL                  |
| `CACHE_MAX_ENTRIES` | `200`                         | Max cache entries                |
| `FETCH_TIMEOUT_MS`  | `20000` (20s)                 | Freedium fetch timeout           |
| `USER_AGENT`        | Chrome 120 UA                 | User-Agent for upstream requests |

## Linting

`.oxlintrc.json` configures oxlint with:

- `correctness` category: error
- `suspicious` + `perf` categories: warn
- `no-default-export`: error (enforces named exports)
- `ignorePatterns`: `["web/.astro/**"]` (Astro-generated files trigger triple-slash-reference errors)

## Attribution

| Provider | Source                                            | Notes                                                                                                                                                          |
| -------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium   | [Freedium](https://codeberg.org/Freedium-cfd/web) | Open-source Medium article fetcher. Two endpoints: `/api/download` (markdown) + `__data.json` (metadata).                                                      |
| Dev.to   | [Forem API](https://developers.forem.com/api)     | Public, unauthenticated. `GET /api/articles/{username}/{slug}` returns native markdown + metadata.                                                             |
| Substack | Substack public API                               | `GET https://{domain}/api/v1/posts/{slug}`. Free posts only — paid posts are server-side truncated. Home URLs (`/home/post/p-{id}`) resolved via 302 redirect. |

## Deployment

| Entry point                                             | Status           | Target                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP API (`src/worker.ts`)                              | Deployed         | Cloudflare Workers — `https://mdingest.knightker.workers.dev`                                                                                                                                                                                                                                                                                                                                                                               |
| CLI (`src/cli.ts`)                                      | Runtime-verified | `bun run src/cli.ts <url>` → markdown to stdout; `--json` for `{metadata, markdown}`; `--provider` override                                                                                                                                                                                                                                                                                                                                    |
| MCP server (stdio) (`src/cli.ts mcp`)                   | Runtime-verified | `bun run src/cli.ts mcp` → stdio JSON-RPC; two tools: `ingest_article` (auto-detect, markdown default, `json: true` for structured) + `list_providers` (discover sources + example URLs)                                                                                                                                                                                                                                                       |
| MCP server (HTTP) (`src/mcp/http.ts`)                   | Runtime-verified | `POST /v1/mcp` → stateless Streamable HTTP transport (fresh transport per request, no session IDs); `initialize` handshake; `tools/list` returns both tools; `ingest_article` with real URL → markdown text, `isError: false`; bad URL → `isError: true` with `[CODE] message`                                                                                                                                      |
| Rate limiting (`[[ratelimits]]` binding)                 | Runtime-verified | Native binding, 30 req/60s per `cf-connecting-ip` on `/v1/*`; overflow returns 429 `{ code: "RATE_LIMITED", details: { retryAfter: 60 }, traceId }`; per-location, eventually consistent (platform semantics)                                                                                                                                                                                                                           |
| LLM visibility (`src/http/llm-visibility.ts`)           | Runtime-verified | `curl /index.md` → 200 `text/markdown`; `curl -H "Accept: text/markdown" /` → markdown (content negotiation); `curl -H "Accept: text/html" /` → HTML; q-value test passes; `Link` + `Vary: Accept` headers on all pages; 406 for `Accept: application/json` on web pages; `.well-known/` paths skip negotiation (404 not 406); `robots.txt` + `llms.txt` + `llms-full.txt` + sitemap all served                                                |
| Agent discovery (`.well-known/`)                        | Runtime-verified | `curl /.well-known/mcp/server-card.json` → 200 `application/json` (MCP Server Card with serverInfo.name + transport + capabilities); `curl /.well-known/ai-catalog.json` → 200 `application/json` (AI Catalog with MCP entry); `curl /.well-known/api-catalog` → 200 `application/linkset+json` (RFC 9727 linkset); `Link: </.well-known/api-catalog>; rel="api-catalog"` header on all HTML pages; isitagentready.com scan: Agent-Readable L3 |

HTTP API runs on Cloudflare Workers — no container, no framework. `src/worker.ts`
routes `/v1/*` to `src/http/api.ts` (rate-limited via the `[[ratelimits]]` binding)
and everything else to `src/http/llm-visibility.ts`, which serves the Astro build
(`web/dist/`) through the `ASSETS` binding with content negotiation.

History: the API used to run in a Docker container behind a proxy Worker (NestJS + Bun,
`@cloudflare/containers`). Migrated 2026-10-17 to pure Workers to drop container billing;
`wrangler delete` + redeploy removed the leftover container app and DO namespace.

`wrangler.toml` config:

| Setting                    | Value             | Purpose                                                          |
| -------------------------- | ----------------- | ---------------------------------------------------------------- |
| `observability.enabled`    | `true`            | Worker observability (logs, metrics)                             |
| `assets.directory`         | `./web/dist`      | Static Astro build served via the `ASSETS` binding               |
| `assets.run_worker_first`  | `true`            | Every request enters `fetch` (needed for Accept negotiation)     |
| `ratelimits`               | 30 req / 60s      | Native rate limiting on `/v1/*`, keyed by `cf-connecting-ip`     |

Deploy: `bun run deploy` (builds `web/dist`, then `wrangler deploy` uploads worker + assets).

After deploy, verify the live endpoint (G2): `curl -s -w "\nHTTP %{http_code}\n" "https://mdingest.knightker.workers.dev/v1/devto?url=<real-url>"`. New code is live within ~20s of deploy.

Files: `src/worker.ts` + `src/http/` + `wrangler.toml`.

## References

- [Freedium source code](https://codeberg.org/Freedium-cfd/web) — Medium article fetcher
