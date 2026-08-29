# Dev.to extraction — free public API, no paywall

> Reference for the Dev.to provider (implemented). Documents what the Forem API
> returns and confirms there is no paid content.

## Key finding: there is no paywall

Dev.to does **not** have paid posts. All published articles are free and
publicly accessible via the unauthenticated Forem API. There is no
`audience`/`only_paid` distinction like Substack, and no client-side paywall
like Medium.

### Monetization history (verified)

| Period | Mechanism | Status |
|---|---|---|
| Pre-Nov 2023 | Web Monetization (Coil / payment pointer micropayments) | **Removed Nov 2023** ([forem#20401](https://github.com/forem/forem/issues/20401)) |
| Current | None for articles | Dev.to does not pay writers; no per-article paywall exists |
| Pro Tools (`pro.forem.tools`) | Promoted Billboards (ads), org-only | Advertising surface, not content gating — does not affect article access |

References: [2024 Update on DEV.to Monetization: REMOVED](https://dev.to/bytehala/2024-update-on-devto-monetization-removed-4517), [Can You Earn Money from dev.to?](https://dev.to/code_area_9036c9663233d92/can-you-earn-money-from-devto-43l1)

## API access (no auth required for reads)

Base URL: `https://dev.to/api`. Forem API v1. All read endpoints listed here
work unauthenticated and are CORS-enabled.

Required headers (per Forem docs):
- `User-Agent` (mandatory — requests without it are rejected)
- `accept: application/vnd.forem.api-v1+json` (recommended)

### Endpoints that return full article body

| Endpoint | Returns `body_markdown`? | Returns `body_html`? |
|---|---|---|
| `GET /api/articles/{id}` | Yes | Yes |
| `GET /api/articles/{username}/{slug}` | Yes | Yes |
| `GET /api/articles?username={user}` | **No** (metadata only) | **No** |
| `GET /api/articles` (feed) | **No** (metadata only) | **No** |

The list/feed endpoints return metadata only. To get the full body, fetch each
article by `id` or by `{username}/{slug}` — both `path` and `id` are present in
list responses.

## Content fidelity (verified via curl + Forem source)

### Markdown engine — Redcarpet config (source-verified)

Read from [`app/lib/constants/redcarpet.rb`](https://github.com/forem/forem/blob/main/app/lib/constants/redcarpet.rb):

| Extension | Enabled | Effect |
|---|---|---|
| `fenced_code_blocks` | Yes | ```lang code ``` syntax |
| `tables` | Yes | Pipe tables with column alignment |
| `strikethrough` | Yes | `~~text~~` → `<del>text</del>` |
| `footnotes` | Yes | `[^1]` refs + `[^1]: def` syntax |
| `autolink` | Yes | Bare URLs become `<a>` links |
| `no_intra_emphasis` | Yes | `foo_bar_baz` stays literal (no false italics) |
| `lax_html_blocks` | Yes | HTML blocks allowed (with sanitization) |
| `lax_spacing` | Yes | Relaxed spacing rules |
| `superscript` | **No** | `^text^` does NOT work (deepwiki claimed yes — source says `false`) |

### Allowed HTML in `body_markdown` (source-verified)

From [`app/services/markdown_processor.rb`](https://github.com/forem/forem/blob/main/app/services/markdown_processor.rb) — `RENDERED_MARKDOWN_SCRUBBER` tag list:

`a abbr b blockquote br center cite code col colgroup dd del dl dt em figcaption
h1-h6 hr img kbd li ol p pre q rp rt ruby small source span strong sub sup svg
table tbody td tfoot th thead time tr u ul video`

Notable: `details`/`summary` NOT in allowed tags (but `{% details %}` liquid tag
renders them after sanitization). `mark` NOT in scrubber list (but IS in
`MARKDOWN_PROCESSOR_DEFAULT` — may pass through in some contexts).

### Block-by-block verification (189 articles scanned via curl)

| Block type | In `body_markdown`? | Format | Evidence |
|---|---|---|---|
| Code blocks | Yes | Fenced ```lang ... ``` | Art 4488685: 144 fences, 4 langs |
| Tables | Yes | Pipe tables, `\|---:` alignment | Art 4515330: 2 data tables |
| Inline images | Yes | `![alt](url)` direct S3 URLs | Art 4433940: 15 images |
| Cover image | Yes (field) | `cover_image` CDN-wrapped URL | All articles |
| Blockquotes | Yes | `> text` | 8/189 articles |
| Ordered lists | Yes | `1. item` | 9/189 articles |
| Nested lists | Yes | 2-space indent + `- item` | 2/189 articles |
| Bold/italic | Yes | `**bold**`, `*italic*` | 20/15 of 189 |
| Horizontal rules | Yes | `---` | 16/189 articles |
| Strikethrough | Yes | `~~text~~` (preserved as-is) | 1/189 articles |
| `<kbd>` | Yes | Raw HTML `<kbd>Key</kbd>` | 1/189 articles |
| `<sub>` | Yes | Raw HTML `<sub>text</sub>` | 1/189 articles |
| `<mark>` | Yes | Raw HTML `<mark>text</mark>` | 1/189 articles |
| `<sup>` | Allowed | Raw HTML (but `^text^` syntax NOT supported) | Not found in sample |
| Footnotes | Supported | `[^1]` + `[^1]: def` (Redcarpet config) | Not found in 189 articles — very rare |
| Liquid tags | **Raw** | `{% tagname args %}` unrendered | See below |

### NOT supported (verified from source)

| Feature | Status | Why |
|---|---|---|
| Task lists (`- [ ]`) | Not supported | Not in Redcarpet config, not GFM |
| TOC (`[TOC]` / `{:toc}`) | Not supported | No Redcarpet extension for this |
| `^superscript^` syntax | Not supported | `superscript: false` in config |
| `==highlight==` syntax | Not supported | Not in Redcarpet config |

## Liquid tags — the one transformation needed

Dev.to uses Shopify's Liquid templating syntax for rich embeds. In `body_markdown`,
these appear as **raw `{% %}` tags** — they are NOT converted to markdown. In
`body_html`, they render as `<iframe>`, `<div>`, `<details>`, or styled HTML.

### Complete liquid tag list (78 tags, source-verified)

Extracted from [`app/liquid_tags/`](https://github.com/forem/forem/tree/main/app/liquid_tags) directory listing:

**Embed tags (URL or ID based):**
`youtube` `tweet` (twitter) `twitter_timeline` `github` `github_issue`
`github_readme` `gist` `codepen` `codesandbox` `vimeo` `twitch` `instagram`
`spotify` `soundcloud` `reddit` `wikipedia` `stackblitz` `replit` `js_fiddle`
`jsitor` `glitch` `kotlin` `dotnet_fiddle` `next_tech` `slideshare` `speakerdeck`
`bandcamp` `blogcast` `asciinema` `livecodes` `loom` `descript` `mux`
`huggingface` `bluesky` `parler` `neon` `netlify` `lovable` `warp` `bolt`
`cloud_run` `git_pitch` `stackexchange` `stackery` `medium` `forem`

**Dev.to-internal tags:**
`link` `user` `tag` `comment` `podcast` `organization` `org_posts` `org_team`
`org_lead_form` `feed` `event` `feature` `features` `offer` `poll` `survey`
`card` `agent_session` `user_subscription` `col` `row` `slide` `slides`

**Content structure tags (paired — have `{% endX %}`):**
`cta` / `endcta` — call-to-action button
`details` / `enddetails` — collapsible section (renders `<details><summary>`)
`spoiler` / `endspoiler` — spoiler/warning collapsible
`collapsible` / `endcollapsible` — generic collapsible
`katex` / `endkatex` — math (LaTeX), supports `inline` modifier
`quote` / `quotes` — blockquote variants
`null` — renders nothing
`legacy_code` — deprecated code embed
`open_graph` — OG metadata embed

### Tags seen in the wild (verified across 189 articles)

| Tag | `body_markdown` form | `body_html` renders as | Found in |
|---|---|---|---|
| `{% embed URL %}` | Raw | Platform-specific HTML | Multiple |
| `{% youtube ID %}` | Raw | `<iframe src="youtube.com/embed/ID">` | Art 4504871 (4 embeds) |
| `{% cta URL %} text {% endcta %}` | Raw | `<a>` styled as button | Art 4433940 |
| `{% link URL %}` | Raw | Article preview card | — |
| `{% user USERNAME %}` | Raw | Profile preview card | — |
| `{% tag TAGNAME %}` | Raw | Tag preview card | — |
| `{% github=URL %}` | Raw | `<a>` link to repo | Art 4513334 |
| `{% codepen URL %}` | Raw | CodePen embed | Art 4256781 |
| `{% katex inline %}LaTeX{% endkatex %}` | Raw | KaTeX-rendered math | Art 4421071 |
| `{% details summary %} content {% enddetails %}` | Raw | `<details><summary>summary</summary>...` | Art 4415514 |

### Liquid tag transformation strategy

For LLM ingestion, raw `{% %}` tags are useless — they're Dev.to-specific syntax
that no Markdown renderer or LLM understands. Three categories of transformation:

**1. URL/ID embeds → Markdown links:**

| Liquid tag | Transform to |
|---|---|
| `{% youtube ID %}` | `[YouTube video](https://youtube.com/watch?v=ID)` |
| `{% embed URL %}` | `[URL](URL)` |
| `{% github=URL %}` | `[GitHub repo](URL)` |
| `{% codepen URL %}` | `[CodePen](URL)` |
| `{% gist URL %}` | `[GitHub Gist](URL)` |
| `{% tweet ID %}` | `[Tweet](https://twitter.com/i/web/status/ID)` |
| Other URL embeds | `[tagname: URL](URL)` |

**2. Dev.to-internal → profile/tag links:**

| Liquid tag | Transform to |
|---|---|
| `{% link URL %}` | `[URL](URL)` |
| `{% user USERNAME %}` | `[@USERNAME](https://dev.to/USERNAME)` |
| `{% tag TAGNAME %}` | `[#TAGNAME](https://dev.to/t/TAGNAME)` |
| `{% cta URL %} text {% endcta %}` | `[text](URL)` |

**3. Content structure → Markdown equivalents:**

| Liquid tag | Transform to | Rationale |
|---|---|---|
| `{% katex inline %}LaTeX{% endkatex %}` | `$LaTeX$` | Standard math Markdown |
| `{% katex %}LaTeX{% endkatex %}` | `$$LaTeX$$` | Block math |
| `{% details summary %} content {% enddetails %}` | `> **summary**\n>\n> content` | Blockquote preserves content + heading |
| `{% spoiler summary %} content {% endspoiler %}` | `> **⚠ summary**\n>\n> content` | Same, with warning marker |
| `{% collapsible summary %} content {% endcollapsible %}` | `> **summary**\n>\n> content` | Same as details |

**4. Generic fallback:**
Any `{% tagname ARGS %}` not matched above → `[tagname: ARGS]` (preserve info, don't drop)

Implementation: regex replacement on `body_markdown` before building frontmatter.
No external dependency — `String.prototype.replace()` with a handler map.
~50 lines for common tags + paired tags + generic fallback.

### Raw HTML in `body_markdown` — no transformation needed

`<kbd>`, `<sub>`, `<mark>`, `<sup>` pass through as raw HTML in `body_markdown`.
LLMs understand these tags — no conversion needed. Standard Markdown renderers
also pass them through. Leave as-is.

## Extraction strategy

1. `GET /api/articles/{username}/{slug}` (or `/{id}`) — single article, full body
2. Use `body_markdown` directly — no HTML→Markdown conversion needed
3. Transform liquid tags (`{% %}`) to standard Markdown (regex, no deps)
4. Build frontmatter from article metadata (title, tags, author, dates, cover)
5. (Optional) `GET /api/articles?username={user}` to list a user's posts, then
   fetch each by `id` for full content

No retries needed — Dev.to's API returns deterministic, fully-rendered markdown
(unlike Freedium's ~20% placeholder rate). The only post-processing is liquid
tag transformation (~50 lines, no new deps).

## Fields available from `GET /api/articles/{id}`

Verified via `curl https://dev.to/api/articles/2233` (no auth):

| Field | Type | Notes |
|---|---|---|
| `id` | number | Numeric article ID |
| `title` | string | |
| `description` | string | Short summary / subtitle |
| `slug` | string | URL slug |
| `path` | string | `/{username}/{slug}` |
| `url` | string | Full canonical URL on dev.to |
| `canonical_url` | string | Original source if cross-posted |
| `cover_image` | string \| null | Cover image URL |
| `social_image` | string | OG image |
| `published_at` | string (RFC 3339) | |
| `created_at` | string (RFC 3339) | |
| `edited_at` | string \| null | |
| `reading_time_minutes` | number | |
| `tag_list` | string (comma-separated) | e.g. `"stacksurvey17, data, statistics"` |
| `tags` | string[] | Same as `tag_list` split |
| `body_markdown` | string | **Full article body in Markdown** |
| `body_html` | string | Full article body in HTML |
| `comments_count` | number | |
| `public_reactions_count` | number | |
| `positive_reactions_count` | number | |
| `language` | string | |
| `ai_disclosure_level` | string | e.g. `"none"` |
| `ai_disclosure_label` | string | |
| `user` | object | See below |

### `user` object (author metadata)

| Field | Notes |
|---|---|
| `name` | Display name |
| `username` | Handle |
| `twitter_username` \| null | |
| `github_username` \| null | |
| `user_id` | Numeric |
| `website_url` \| null | |
| `profile_image` | Avatar URL |
| `profile_image_90` | Smaller avatar |

## Why Dev.to is the simplest provider

| Concern | Dev.to | Medium (current) | Substack |
|---|---|---|---|
| Auth required | No | No (Freedium mirror) | No |
| Paywall | None | Yes (bypassed via Freedium) | Yes (hard, server-side) |
| Body format | Markdown (native) | Markdown (via Freedium) | HTML (needs conversion) |
| Non-determinism | None | ~20% placeholder rate | None |
| Retries needed | No | Yes (up to 5) | No |
| Metadata source | Single endpoint | Dual-source (download + `__data.json`) | Single endpoint |
| Post-processing | Liquid tag → link transform (regex, no deps) | `<picture>` → `![]()` + cover injection | HTML → Markdown (needs `turndown` dep) |

Dev.to returns finished Markdown + complete metadata from one unauthenticated
call. No mirror dependency, no dual-source merge, no retry loop, no HTML
conversion. The only post-processing is liquid tag transformation (regex, ~50
lines, no new deps). Still the thinnest provider of the three.

## References

- Forem API docs: https://developers.forem.com/api/v1
- Article by ID: `GET https://dev.to/api/articles/{id}`
- Article by path: `GET https://dev.to/api/articles/{username}/{slug}`
- List by user: `GET https://dev.to/api/articles?username={user}`
- Monetization removal: https://github.com/forem/forem/issues/20401
- Redcarpet config: [`app/lib/constants/redcarpet.rb`](https://github.com/forem/forem/blob/main/app/lib/constants/redcarpet.rb)
- Allowed HTML tags: [`app/services/markdown_processor.rb`](https://github.com/forem/forem/blob/main/app/services/markdown_processor.rb)
- Liquid tags source: [`app/liquid_tags/`](https://github.com/forem/forem/tree/main/app/liquid_tags)
- Liquid tags docs: [developers.forem.com/frontend/liquid-tags](https://developers.forem.com/frontend/liquid-tags)
