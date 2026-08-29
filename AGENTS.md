# AGENTS.md — mdingest Operating Contract

> API that converts blog/article/newsletter pages to clean Markdown for LLM ingestion.
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
- Functional style: pure functions where possible, no classes except NestJS modules/services/controllers.
- Use TypeScript features: type narrowing, discriminated unions, `satisfies`, `as const`.

## What this project is

An API that converts blog/article/newsletter pages to clean Markdown for LLM ingestion.
Medium articles are fetched via Freedium mirror using a dual-source
approach: the download endpoint for finished markdown + the `__data.json` endpoint for
metadata (author, reading_time, cover image). Output includes YAML frontmatter with rich metadata.

**The goal:** give LLMs and deep research workflows clean, structured Markdown from any
article source — no paywalls, no UI noise, no ads, just content.

**What it is NOT:** a scraper, a CMS, or a full-text search engine.

## Architecture

### Multi-entry-point design

The conversion logic lives in service classes (`MediumService`, `DevtoService`,
`SubstackService`, `FreediumService`, `CacheService`) decorated with `@Injectable()`.
The decorator is just DI metadata — it does NOT prevent direct instantiation.
All services work with `new` outside NestJS:

```typescript
const service = new MediumService(new FreediumService(), new CacheService());
const result = await service.convert(url);  // works without booting NestJS
```

This enables three entry points sharing the same logic, no duplication:

| Entry point | File | How it works |
|---|---|---|
| HTTP API | `src/main.ts` | NestJS + Fastify, DI wires services, controller delegates to service |
| CLI | `src/cli.ts` (planned) | `new` services directly, call `convert()`, print to stdout |
| MCP server | `src/mcp.ts` (planned) | `new` services directly, expose `convert_article` tool |

No refactor needed — the classes already work standalone. CLI and MCP are thin shells
that instantiate the same services and call the same `convert()` method.

### Layer separation

```
core/config/          → Config (Zod-validated at boot, frozen object)
core/cache/           → In-memory LRU cache (app-wide infra)
integrations/freedium/→ HTTP client for Freedium mirror (download + data endpoints)
common/types/         → Shared types: ArticleMetadata schema, Provider interface
common/pipes/         → ZodValidationPipe (validates controller input)
common/filters/       → AllExceptionsFilter (shapes errors to { code, message, details?, traceId })
modules/medium/       → Medium feature: controller, service, DTOs, errors
modules/devto/        → Dev.to feature: controller, service, DTOs, errors
modules/substack/     → Substack feature: controller, service, DTOs, errors
```

**The separation rule (NestJS 6-bucket layout):**
- `core/` — app-wide infrastructure (config, cache). Could be `@Global()`.
- `integrations/` — external service clients (Freedium). Thin wrappers, no business logic.
- `common/` — generic, domain-less utilities (types, pipes, filters). No business logic.
- `modules/` — business features (Medium, Dev.to, Substack). Owns its controllers, services, DTOs, errors.

Provider-specific logic (metadata extraction, image replacement, URL validation) lives in
`modules/<name>/`. If you're tempted to add a Medium-specific concern in `common/`, stop.

### Data flow (dual-source)

```
GET /v1/medium?url=...
  → ZodValidationPipe (validate query params + URL domain, throw VALIDATION.FAILED on bad input)
  → MediumController (thin: delegate to service, shape response)
  → MediumService.convert(url)
    → CacheService.get(url) — return cached if hit
    → FreediumService.fetchMarkdown(url) — GET /api/download?url=...
        Returns finished markdown with frontmatter, tags, pipe tables, code languages
        Retries up to 5 times if [Embedded content] placeholders detected (~20% failure rate)
    → FreediumService.fetchArticleData(url) — GET /<url>/__data.json
        Returns SvelteKit devalue data: article metadata (author, reading_time, postImage)
    → Merge: parse download frontmatter + enrich with article metadata
    → Replace <picture> HTML tags with markdown image syntax
    → Inject cover image (from postImage) after H1
    → buildFrontmatter(merged metadata) + enriched body → full markdown string
    → CacheService.set(url, markdown)
  → Response: text/markdown or application/json
  → On error: AllExceptionsFilter shapes to { code, message, details?, traceId }
```

### Why dual-source

Freedium exposes two access modes, each with different data:

| Source | Gives us | Misses |
|---|---|---|
| `/api/download` | Tags, pipe tables, code languages, frontmatter, published/updated dates, free flag, inline images as `<picture>` HTML | Author name, reading time, cover image |
| `__data.json` | Author name, reading time, postImage (cover) | Tags, pipe tables, code languages |

Combining both gives us everything accessible. Tags and pipe tables are not recoverable
from any other source (Medium's GraphQL API is Cloudflare-blocked without auth).

### Freedium renderer non-determinism

Freedium's `/api/download` endpoint is non-deterministic — ~20% of requests return
`[Embedded content: <hash>]` placeholders instead of rendered pipe tables. We retry
up to 5 times and keep the response with the fewest placeholders. At ~80% clean rate
per attempt, 5 retries = ~99.97% chance of a clean fetch.

### Accepted Medium domains

URL validation accepts 42 domains sourced from Freedium's `KNOWN_MEDIUM_DOMAINS` +
`KNOWN_MEDIUM_CUSTOM_DOMAINS` (medium-parser/medium_parser/utils.py). Includes
`medium.com`, `*.medium.com`, and publication custom domains like `itnext.io`,
`levelup.gitconnected.com`, `betterprogramming.pub`, `towardsdatascience.com`, etc.
Full list in `modules/medium/medium.dto.ts`.

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
interface, and register in `app.module.ts`. Common modules don't change.

### Error contract

All errors follow the standard shape: `{ code, message, details?, traceId }`

| Code | HTTP | When |
|---|---|---|
| `VALIDATION.FAILED` | 422 | Bad query params (Zod pipe) |
| `MEDIUM.INVALID_URL` | 400 | URL is not a Medium article (service-level check) |
| `MEDIUM.FREEDIUM_UNAVAILABLE` | 503 | Freedium mirror down or timed out |
| `MEDIUM.PARSE_FAILED` | 502 | Article data parsing failed (e.g. cache corruption) |
| `DEVTO.INVALID_URL` | 400 | URL is not a Dev.to article |
| `DEVTO.UNAVAILABLE` | 503 | Dev.to API down or timed out |
| `DEVTO.PARSE_FAILED` | 502 | Article data parsing failed (e.g. cache corruption) |
| `SUBSTACK.INVALID_URL` | 400 | URL is not a Substack article |
| `SUBSTACK.PAID_POST` | 403 | Post is behind a paywall (only free posts convertible) |
| `SUBSTACK.UNAVAILABLE` | 503 | Substack API down or timed out |
| `SUBSTACK.PARSE_FAILED` | 502 | Article data parsing failed (e.g. cache corruption) |
| `INTERNAL.ERROR` | 500 | Unexpected error |
| `NOT_FOUND` | 404 | Unknown route (NestJS NotFoundException) |

Typed domain errors in `modules/<provider>/errors/` extend semantic Nest exceptions
(`BadRequestException`, `ForbiddenException`, `ServiceUnavailableException`, `BadGatewayException`).
The global `AllExceptionsFilter` in `common/filters/` shapes every error to the standard contract.

### API versioning

URI versioning: `/v1/medium?url=...`. Bump to `/v2/` on breaking changes.
Configured in `main.ts` via `app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })`.

## Dependencies and why each

| Dep | What it solves | Why not alternatives |
|---|---|---|
| `@nestjs/common` + `@nestjs/core` | Framework: modules, DI, controllers, validation | Hono is lighter but loses NestJS module/DI structure. Luis's stack prefers NestJS. |
| `@nestjs/platform-fastify` + `fastify` | HTTP server adapter | Faster than express, lower overhead. NestJS supports it officially. |
| `lru-cache` | In-memory LRU cache for fetched articles | Custom Map-based cache lacks TTL. lru-cache is the standard, 11.5.2, actively maintained. |
| `zod` | Runtime validation of request params and response shape | Hand-written validation drifts. Zod schemas infer TS types. 3.25.76. |
| `@cloudflare/containers` | Container class for Cloudflare Containers deployment | Worker routes requests to the NestJS+Bun Docker container. 0.3.7. |
| `@cloudflare/workers-types` (dev) | TypeScript types for Cloudflare Workers APIs (`DurableObjectNamespace`, `ExportedHandler`) | Required for `src/worker.ts` typechecking. |
| `turndown` | HTML→Markdown for Substack provider (body_html → markdown) | Substack API returns HTML only. turndown's `addRule()` API enables per-component custom rules for Substack's 8+ custom HTML components (footnotes, LaTeX, embeds, mentions). Alternatives: `html-to-md` (no custom rule API, only skip tags), `node-html-markdown` (limited `customTranslators`). turndown has `turndown-plugin-gfm` (already installed) for GFM tables/strikethrough. 7.2.4, 1 dep (`@mixmark-io/domino`). |
| `@types/turndown` (dev) | TypeScript types for turndown | Required for typechecking. 5.0.6. |

**What we deliberately did NOT add:**

| Rejected | Why |
|---|---|
| `cheerio` | No longer needed — image replacement done with regex on `<picture>` tags in markdown body. No HTML parsing required. |
| `@nestjs/config` | Overkill for 6 config values. Hardcoded defaults + env override is simpler. |
| `@nestjs/platform-express` | Fastify is faster and officially supported by NestJS. |
| `redis` | In-memory LRU is sufficient for a personal API. No external service to manage. |
| `html-to-md` | No custom rule API — only supports `renderCustomTags: 'SKIP'`. Can't transform Substack's custom components (footnotes→`[^N]`, LaTeX→`$$...$$`, etc.). |
| `node-html-markdown` | `customTranslators` is less flexible than turndown's `addRule(filter, replacement)`. Larger dependency tree (`node-html-parser`). |

## Engineering discipline

### Verify before you assert (G2, G12)
Never say "working" or "done" without running `bun run verify` (typecheck + lint) AND
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

Zod-validated env vars with hardcoded defaults. No config files — invalid env crashes at boot.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `FREEDIUM_BASE_URL` | `https://freedium-mirror.cfd` | Freedium mirror base URL |
| `CACHE_TTL_SECONDS` | `300` (5 min) | Cache entry TTL |
| `CACHE_MAX_ENTRIES` | `200` | Max cache entries |
| `FETCH_TIMEOUT_MS` | `20000` (20s) | Freedium fetch timeout |
| `USER_AGENT` | Chrome 120 UA | User-Agent for Freedium requests |

## Attribution

| Provider | Source | Notes |
|---|---|---|
| Medium | [Freedium](https://codeberg.org/Freedium-cfd/web) | Open-source Medium article fetcher. Two endpoints: `/api/download` (markdown) + `__data.json` (metadata). |
| Dev.to | [Forem API](https://developers.forem.com/api) | Public, unauthenticated. `GET /api/articles/{username}/{slug}` returns native markdown + metadata. |
| Substack | Substack public API | `GET https://{domain}/api/v1/posts/{slug}`. Free posts only — paid posts are server-side truncated. |

## Deployment

| Entry point | Status | Target |
|---|---|---|
| HTTP API (`src/main.ts`) | Deployed | Cloudflare Containers — `https://mdingest.knightker.workers.dev` |
| CLI (`src/cli.ts`) | Planned | `bun run src/cli.ts <url>` → markdown to stdout |
| MCP server (`src/mcp.ts`) | Planned | Expose `convert_article` tool for AI agents |

HTTP API runs on Cloudflare Containers. A Worker (`src/worker.ts`) routes all requests
to a NestJS + Bun Docker container. The Worker extends the `Container` class from
`@cloudflare/containers` with `defaultPort = 3000` (matching the Dockerfile's EXPOSE).

Deploy: `bun x wrangler deploy --containers-rollout=immediate` — builds the Docker image,
pushes to Cloudflare registry, and deploys the Worker with an immediate rollout (100% of
instances updated at once). The default rolling strategy (10% then 90%) can leave stale
instances serving requests during the transition — `immediate` avoids that.

After deploy, verify the live endpoint (G2): `curl -s -w "\nHTTP %{http_code}\n" "https://mdingest.knightker.workers.dev/v1/medium?url=<real-url>"`. First request after deploy may take ~15s (cold start).

Files: `src/worker.ts` + `Dockerfile` + `wrangler.toml`.

## References

- [Freedium source code](https://codeberg.org/Freedium-cfd/web) — Medium article fetcher
