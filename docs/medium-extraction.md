# Medium extraction — Freedium + dual-source metadata

> Centralized reference for the Medium provider. Documents the Freedium
> dependency, dual-source data flow, content fidelity, and known limitations.
> The provider is **implemented and deployed** — this doc describes what exists.

## Architecture overview

Medium articles are fetched via the [Freedium](https://codeberg.org/Freedium-cfd/web)
mirror, which bypasses Medium's paywall. Freedium exposes two endpoints that
we combine for full coverage:

| Source | Endpoint | Gives us | Misses |
|---|---|---|---|
| Download | `GET /api/download?url=<medium_url>` | Markdown body, frontmatter (title, subtitle, published, updated, free, source_url), tags, code languages, images as `<picture>` HTML | Author name, reading time, cover image |
| Data | `GET /<medium_url>/__data.json` | Author name, reading time, postImage (cover), isFree, dates | Tags, body content |

Combining both gives everything accessible. Neither endpoint alone is sufficient.

### Data flow

```
MediumService.convert(url)
  → CacheService.get(url) — return cached if hit
  → FreediumService.fetchMarkdown(url)
      GET {FREEDIUM_BASE_URL}/api/download?url={url}
      Retries up to 5x if [Embedded content] placeholders detected (~20% failure rate)
      Returns: markdown string with YAML frontmatter + <picture> image tags
  → FreediumService.fetchArticleData(url)
      GET {FREEDIUM_BASE_URL}/{url}/__data.json
      Parses SvelteKit devalue format (index references)
      Returns: metadata object (author, reading_time, postImage)
  → Merge: parse download frontmatter + enrich with article metadata
  → Replace <picture> HTML tags with markdown image syntax
  → Inject cover image (from postImage) after H1
  → buildFrontmatter(merged metadata) + enriched body → full markdown
  → CacheService.set(url, markdown)
```

### Why dual-source (not single)

The download endpoint has the body content but lacks author and cover image.
The data endpoint has metadata but its `eager.markdown` field is a rawer
version without tags or code languages. Using both gives the richest output.

## Freedium renderer — what it produces

Freedium's renderer (`freedium-library/src/freedium_library/services/medium/renderer.py`)
converts Medium's GraphQL paragraph data to Markdown. Medium's data model
defines 12 paragraph types and 4 markup types — that's the entire content
surface.

### Medium paragraph types (from `ParagraphType` class)

| Type | Markdown output | Notes |
|---|---|---|
| `H2` | `## heading` | Medium has no H1 — starts at H2 |
| `H3` | `### heading` | |
| `H4` | `#### heading` | H4 is also used for tags (Freedium extracts them) |
| `P` | Plain paragraph text | |
| `IMG` | `<picture>` HTML (converted by our service) | Responsive sources: 700px, 2000px, 4000px |
| `ULI` | `- item` | Unordered list |
| `OLI` | `1. item` | Ordered list |
| `PRE` | ` ```language\ncode\n``` ` | Language from `codeBlockMetadata.lang` |
| `BQ` | `> quote` | Blockquote |
| `PQ` | `> quote` | Pull quote — rendered as blockquote |
| `MIXTAPE_EMBED` | `[**title**](url)\n*description*` | Link card with title + description |
| `IFRAME` | `<iframe src="...">` HTML | Embeds (YouTube, Twitter, CodePen, etc.) |

### Medium markup types (inline formatting)

| Type | Markdown output | Notes |
|---|---|---|
| `A` | `[text](href)` | Links |
| `STRONG` | `**text**` | Bold |
| `EM` | `*text*` | Italic |
| `CODE` | `` `code` `` | Inline code |

That's it — 4 markup types. No strikethrough, no sub, no sup, no mark, no kbd.

## Content fidelity — what Medium supports and doesn't

### Supported (extracted correctly)

| Feature | Status | How |
|---|---|---|
| Headings (H2-H4) | Yes | `H2`/`H3`/`H4` paragraph types |
| Paragraphs | Yes | `P` type |
| Bold | Yes | `STRONG` markup |
| Italic | Yes | `EM` markup |
| Inline code | Yes | `CODE` markup |
| Code blocks (with language) | Yes | `PRE` type + `codeBlockMetadata.lang` |
| Blockquotes | Yes | `BQ` type |
| Pull quotes | Yes | `PQ` type (rendered as blockquote) |
| Ordered lists | Yes | `OLI` type |
| Unordered lists | Yes | `ULI` type |
| Links | Yes | `A` markup |
| Images | Yes | `IMG` type → `<picture>` → `![](url)` |
| Image captions | Yes | Via `data-caption` attribute |
| Embeds (YouTube, Twitter, etc.) | Yes | `IFRAME` type → `<iframe>` HTML |
| Link cards | Yes | `MIXTAPE_EMBED` → `[**title**](url) *desc*` |
| Tags | Yes | Extracted from H4 paragraphs by Freedium |
| Cover image | Yes | From `__data.json` `postImage`, injected after H1 |

### NOT supported (Medium platform limitation)

| Feature | Status | Reason |
|---|---|---|
| H1 headings | Not in Medium | Medium's editor starts at H2 |
| Tables | Not in Medium | No `TABLE` paragraph type in data model |
| Footnotes | Not in Medium | No footnote markup or paragraph type |
| Math/LaTeX | Not in Medium | No math rendering in editor |
| Strikethrough | Not in Medium | No `DEL`/`S` markup type |
| Horizontal rules | Not in Medium | No `HR` paragraph type |
| `<sub>`/`<sup>` | Not in Medium | No markup types for these |
| `<mark>`/`<kbd>` | Not in Medium | No markup types for these |
| `<details>`/`<summary>` | Not in Medium | No collapsible section support |
| Task lists | Not in Medium | No checkbox list type |
| TOC | Not native | Freedium extracts one from H2/H3 (metadata, not content) |

These are **Medium platform limitations**, not extraction gaps. Medium's
editor is intentionally minimal — 12 paragraph types, 4 markup types.

### Unverified claim: "pipe tables"

`AGENTS.md` and service comments mention "pipe tables" from the download
endpoint. The Freedium renderer source (`renderer.py`) shows **no TABLE
paragraph type** and no table rendering logic. Medium's data model
fundamentally has no tables.

The `/api/download` endpoint code is not in the [GitHub repo](https://github.com/Freedium-cfd/web)
— it may be custom to the `freedium-mirror.cfd` deployment. This claim
needs curl verification when the Freedium mirror is back online. Flagged
in `KNOWN_GAPS.md`.

**Hypothesis:** The "pipe tables" claim may have come from an older
Freedium version, or from content where authors used preformatted text
with `|` characters inside a `PRE` block (which would look like a table
but is actually a code block).

## `<picture>` image conversion

Freedium renders images as responsive `<picture>` HTML:

```html
<picture>
  <source srcset="/img/1.webp">
  <source srcset="/img/1.jpg">
  <img src="/img/1.jpg" alt="A diagram" />
</picture>
```

Our `MediumService.replaceImages()` converts this to:

```markdown
![A diagram](https://freedium-mirror.cfd/img/1.jpg)
```

- Relative URLs (`/img/...`) are prefixed with `FREEDIUM_BASE_URL`
- `alt="None"` is treated as empty string
- Cover image (from `__data.json` `postImage`) is injected after H1

Regex used (in `medium.service.ts`):

```
/<picture>\s*<source[^>]*>\s*<source[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/>\s*<\/picture>/g
```

## `__data.json` parsing (SvelteKit devalue)

The `__data.json` endpoint returns SvelteKit's devalue format — a JSON
structure with index references instead of nested objects.

Structure:
```
json.nodes[1].data = [
  { slug, eager: <ref>, streamed: <ref> },  // data[0]
  { html, markdown, article: <ref>, ... },  // data[eager] — the eager object
  { title, subtitle, authors: <ref>, ... }, // data[article] — the article object
  [{ name: <ref>, avatar: <ref> }, ...],    // data[authors] — authors array
  "Author Name",                             // data[author.name]
  ...
]
```

References are resolved by `FreediumService.resolveRef()`:
- Numbers → array indices (`data[ref]`)
- `-1` → `undefined`
- Anything else → literal value

Fields extracted from the article object:

| Field | Type | Notes |
|---|---|---|
| `title` | string | Article title |
| `subtitle` | string | Article subtitle |
| `authors` | array of `{ name, avatar }` | We take first author's name |
| `readingTime` | string | e.g. "5 min read" |
| `date` | string | Display date |
| `publishedAt` | string | ISO date |
| `updatedAt` | string | ISO date |
| `isFree` | boolean | Whether article is free |
| `postImage` | string | Cover image path (relative to Freedium base) |
| `url` | string | Source URL |

## Frontmatter output

The merged metadata produces YAML frontmatter:

```yaml
---
title: "Article Title"
subtitle: "A subtitle"
author: "Jane Doe"
date: "2026-01-15"
published: "2026-01-15"
updated: "2026-01-20"
reading_time: "5 min read"
free: true
source_url: "https://medium.com/@user/article"
provider: "medium"
tags:
  - "Distributed Systems"
  - "System Design"
---
```

Fields from download endpoint: `title`, `subtitle`, `published`, `updated`,
`free`, `source_url`, `tags`.

Fields from `__data.json`: `author`, `reading_time`, cover image (injected
into body, not frontmatter).

Field from our service: `provider: "medium"`.

## Retry logic (Freedium non-determinism)

Freedium's `/api/download` renderer is non-deterministic — ~20% of requests
return `[Embedded content: <hash>]` placeholders instead of rendered
content (tables, embeds).

Strategy in `FreediumService.fetchMarkdown()`:
1. Fetch up to 5 times sequentially
2. Count `[Embedded content: <hex>]` placeholders per response
3. Return immediately if 0 placeholders
4. Otherwise keep the response with fewest placeholders
5. After 5 attempts, return the best one

At ~80% clean rate per attempt, 5 retries = ~99.97% chance of a clean fetch.

## URL validation

42 accepted domains sourced from Freedium's `KNOWN_MEDIUM_DOMAINS` +
`KNOWN_MEDIUM_CUSTOM_DOMAINS` (in `medium-parser/medium_parser/utils.py`).

Categories:
1. `medium.com` and `*.medium.com` — core Medium domains
2. Publication custom domains — `itnext.io`, `towardsdatascience.com`,
   `betterprogramming.pub`, `levelup.gitconnected.com`, etc.

Full list in `shared/providers.ts` (`MEDIUM_DOMAINS` set). URL validation is centralized
in `detectProvider()` — `medium.dto.ts` delegates to it via `isValidMediumUrl`.

## Error handling

| Error code | HTTP | When | File |
|---|---|---|---|
| `VALIDATION.FAILED` | 422 | Bad query params (Zod pipe) | `common/pipes/` |
| `MEDIUM.INVALID_URL` | 400 | URL is not a Medium article | `modules/medium/errors/` |
| `MEDIUM.FREEDIUM_UNAVAILABLE` | 503 | Freedium mirror down or timed out | `modules/medium/errors/` |
| `MEDIUM.PARSE_FAILED` | 502 | Article data parsing failed (cache corruption) | `modules/medium/errors/` |
| `INTERNAL.ERROR` | 500 | Unexpected error | `common/filters/` |

The `__data.json` fetch is **non-fatal** — if it fails, we proceed with
download markdown only (missing author, reading_time, cover image). This
is logged as a warning, not thrown.

## Dependencies

| Dependency | What it solves | Why not alternatives |
|---|---|---|
| Freedium mirror (external) | Paywall bypass + markdown rendering | Medium's GraphQL API is Cloudflare-blocked without auth. Freedium pays for subscriptions and shares access. |
| `lru-cache` | In-memory cache for fetched articles | Avoids re-fetching on repeated requests. TTL 5 min, max 200 entries. |

**No `turndown` needed** — Freedium's download endpoint returns finished
markdown directly. The only HTML we handle is `<picture>` image tags
(regex replacement, no HTML parser).

**No `cheerio` needed** — image replacement is a single regex on
`<picture>` tags. No DOM parsing required.

## Config

| Env var | Default | Purpose |
|---|---|---|
| `FREEDIUM_BASE_URL` | `https://freedium-mirror.cfd` | Freedium mirror base URL |
| `FETCH_TIMEOUT_MS` | `20000` (20s) | Freedium fetch timeout |
| `USER_AGENT` | Chrome 120 UA | User-Agent for Freedium requests |
| `CACHE_TTL_SECONDS` | `300` (5 min) | Cache entry TTL |
| `CACHE_MAX_ENTRIES` | `200` | Max cache entries |

## Known issues

| Issue | Severity | Status |
|---|---|---|
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up |
| "Pipe tables" claim unverified | Medium | Renderer source shows no TABLE type. Needs curl verification when Freedium is back. See `KNOWN_GAPS.md` |
| `__data.json` SvelteKit format may change | Low | Freedium controls both endpoints. If format breaks, both sources fail together. |

## Comparison with Dev.to and Substack

| Concern | Medium | Dev.to | Substack |
|---|---|---|---|
| Auth required | No (Freedium) | No | No |
| Paywall | Bypassed (Freedium) | None | Yes (hard, server-side) |
| Body format | Markdown (from Freedium) | Markdown (native) | HTML (needs `turndown`) |
| New dependency needed | No | No | Yes (`turndown`) |
| Custom component handling | `<picture>` regex (~10 lines) | Liquid tags (~50 lines) | 8+ Substack components (~100 lines) |
| Tables | Not in Medium | Yes (pipe tables) | No (platform limitation) |
| Footnotes | Not in Medium | Yes (Redcarpet) | Yes (custom HTML) |
| LaTeX/math | Not in Medium | Yes (KaTeX liquid tag) | Yes (MathJax, custom HTML) |
| Retries needed | Yes (5x for placeholders) | No | No |
| Dual-source merge | Yes (download + data) | No (single endpoint) | No (single endpoint) |
| Implementation status | **Deployed** | Not started | Not started |

Full coverage matrix: [`docs/markdown-coverage-matrix.md`](markdown-coverage-matrix.md)

## References

- [Freedium source code](https://codeberg.org/Freedium-cfd/web) — Medium article fetcher
- [Freedium GitHub mirror](https://github.com/Freedium-cfd/web) — includes `renderer.py`
- Freedium renderer: `freedium-library/src/freedium_library/services/medium/renderer.py`
- Our service: `src/modules/medium/medium.service.ts`
- Our Freedium client: `src/integrations/freedium/freedium.service.ts`
- URL validation: `shared/providers.ts` (`detectProvider`) → `src/modules/medium/medium.dto.ts` (`isValidMediumUrl` delegates)
- Metadata schema: `src/common/types/metadata.types.ts`
