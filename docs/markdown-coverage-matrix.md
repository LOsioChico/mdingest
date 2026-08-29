# Markdown coverage matrix — Medium, Dev.to, Substack

> Comprehensive comparison of what each platform's content model supports
> and what mdingest can extract. Source-verified where possible.

## How this was verified

| Platform | Source | Method |
|---|---|---|
| Medium | [Freedium renderer.py](https://github.com/Freedium-cfd/web/blob/main/freedium-library/src/freedium_library/services/medium/renderer.py) | Read source: `ParagraphType` + `MarkupType` classes |
| Dev.to | [Forem Redcarpet config](https://github.com/forem/forem/blob/main/app/lib/constants/redcarpet.rb) + [allowed tags](https://github.com/forem/forem/blob/main/app/services/markdown_processor.rb) | Read source + curl 189 articles |
| Substack | curl 28 posts across 14+ publications | API `body_html` inspection |

## Coverage matrix

### Standard Markdown blocks

| Feature | Medium | Dev.to | Substack | Notes |
|---|---|---|---|---|
| Headings (H1-H6) | H2, H3, H4 only | H1-H6 | H1-H6 | Medium has no H1 — starts at H2 |
| Paragraphs | Yes | Yes | Yes | All platforms |
| Bold (`**text**`) | Yes (`STRONG` markup) | Yes | Yes (`<strong>`) | |
| Italic (`*text*`) | Yes (`EM` markup) | Yes | Yes (`<em>`) | |
| Inline code (`` `code` ``) | Yes (`CODE` markup) | Yes | Yes (`<code>`) | |
| Code blocks (fenced) | Yes (`PRE` type, with language) | Yes (fenced, with language) | Yes (`<pre><code>`) | Medium gets language from `codeBlockMetadata` |
| Blockquotes | Yes (`BQ` type) | Yes (`>` syntax) | Yes (`<blockquote>`) | |
| Ordered lists | Yes (`OLI` type) | Yes | Yes (`<ol>`) | |
| Unordered lists | Yes (`ULI` type) | Yes | Yes (`<ul>`) | |
| Nested lists | Yes (via layout) | Yes (indent) | Yes (nested `<ul>`/`<ol>`) | |
| Horizontal rules | **No** | Yes (`---`) | Yes (`<hr>`) | Medium has no HR paragraph type |
| Links | Yes (`A` markup) | Yes | Yes (`<a>`) | |
| Images | Yes (`IMG` type, as `<picture>` HTML) | Yes (`![](url)`) | Yes (`<figure><img>`) | Medium images need `<picture>` → `![]()` conversion |
| Image captions | Yes (via `data-caption`) | Via `<figcaption>` | Yes (`<figcaption class="image-caption">`) | |

### Extended Markdown features

| Feature | Medium | Dev.to | Substack | Notes |
|---|---|---|---|---|
| Tables (pipe) | **No** | Yes (`\|---:` alignment) | **No** | Medium data model has no TABLE type. Substack has no native table block — uses Datawrapper embeds |
| Strikethrough (`~~text~~`) | **No** | Yes (Redcarpet `strikethrough: true`) | Yes (`<s>` tag) | Medium has no strikethrough markup |
| Footnotes (`[^1]`) | **No** | Yes (Redcarpet `footnotes: true`) | Yes (custom HTML) | Very rare on Dev.to (0/189 articles). Substack uses `FootnoteAnchorToDOM`/`FootnoteToDOM` |
| Task lists (`- [ ]`) | **No** | **No** | **No** | Not supported on any platform |
| TOC (`[TOC]`) | **No** (Freedium extracts one from headings) | **No** | **No** | Freedium generates a TOC from H2/H3, but it's metadata not content |
| Math/LaTeX | **No** | Yes (`{% katex %}` liquid tag) | Yes (`LatexBlockToDOM`, MathJax) | Medium has no math support at all |

### HTML elements (raw HTML in content)

| Element | Medium | Dev.to | Substack | Notes |
|---|---|---|---|---|
| `<sub>` | **No** | Yes (allowed tag) | Yes (raw HTML) | |
| `<sup>` | **No** | Allowed (but `^text^` syntax NOT supported) | Not found | Dev.to: `superscript: false` in Redcarpet config |
| `<mark>` | **No** | Yes (allowed tag) | **No** | |
| `<kbd>` | **No** | Yes (allowed tag) | **No** | |
| `<details>`/`<summary>` | **No** | Via `{% details %}` liquid tag | **No** | Dev.to renders as `<details><summary>` in HTML |
| `<abbr>` | **No** | Yes (allowed tag) | **No** | |
| `<figure>`/`<figcaption>` | Via `<picture>` | Yes (allowed tag) | Yes | |

### Embeds and rich content

| Feature | Medium | Dev.to | Substack | Notes |
|---|---|---|---|---|
| YouTube | Yes (`IFRAME` type) | Yes (`{% youtube ID %}`) | Yes (`Youtube2ToDOM`) | |
| Twitter/X | Yes (`IFRAME` type) | Yes (`{% tweet ID %}`) | Yes (`Twitter2ToDOM`, stores full tweet text) | |
| GitHub/Gist | Yes (`IFRAME` type) | Yes (`{% github %}`, `{% gist %}`) | Yes (GitHub Gists, undocumented) | |
| CodePen | Yes (`IFRAME` type) | Yes (`{% codepen %}`) | Not found | |
| Link cards | Yes (`MIXTAPE_EMBED` type) | Yes (`{% link %}`) | Yes (`EmbeddedPostToDOM`) | Medium renders as `[**title**](url) *description*` |
| Generic iframe | Yes (`IFRAME` type) | Via `{% embed URL %}` | Via URL paste | |
| Spotify | Via `IFRAME` | Yes (`{% spotify %}`) | Yes (officially documented) | |
| Pull quotes | Yes (`PQ` type, rendered as blockquote) | **No** | **No** | Medium-specific feature |
| Mentions | **No** | **No** | Yes (`MentionToDOM`) | Substack-specific |
| Subscribe buttons | **No** | **No** | Yes (`ButtonCreateButton`) | Strip during conversion (marketing) |

### Platform-specific features

| Feature | Platform | How it works | Conversion needed |
|---|---|---|---|
| Medium pull quotes | Medium | `PQ` paragraph type → rendered as blockquote | Already handled by Freedium renderer |
| Medium mixtape embeds | Medium | `MIXTAPE_EMBED` type → `[**title**](url) *desc*` | Already handled by Freedium renderer |
| Dev.to liquid tags (78 types) | Dev.to | `{% tagname args %}` in `body_markdown` | Regex transform to Markdown links (~50 lines) |
| Dev.to `{% katex %}` | Dev.to | `{% katex inline %}LaTeX{% endkatex %}` | Transform to `$LaTeX$` / `$$LaTeX$$` |
| Dev.to `{% details %}` | Dev.to | `{% details summary %} content {% enddetails %}` | Transform to `> **summary**\n>\n> content` |
| Substack footnotes | Substack | `FootnoteAnchorToDOM` + `FootnoteToDOM` HTML | Transform to `[^1]` + `[^1]: def` |
| Substack LaTeX | Substack | `LatexBlockToDOM` with `data-attrs` JSON | Extract `persistentExpression` → `$$LaTeX$$` |
| Substack Twitter embeds | Substack | `Twitter2ToDOM` with full tweet in `data-attrs` | Transform to `> **@user**: tweet text` |
| Substack image captions | Substack | `<figcaption class="image-caption">` | Transform to `*caption*` below image |
| Substack mentions | Substack | `MentionToDOM` with user data | Transform to `[@name](profile_url)` |

## What each platform is missing (content gaps)

### Medium — most limited

Medium's data model is the simplest. It lacks:
- Tables, footnotes, math/LaTeX, strikethrough
- H1, horizontal rules
- Sub/sup/mark/kbd, details/summary
- Task lists, TOC

Medium's content is structured paragraphs with 4 markup types (link, bold, italic, code).
No raw HTML is allowed. This is by design — Medium's editor is intentionally minimal.

### Dev.to — most complete

Dev.to supports nearly everything via Redcarpet extensions + Liquid tags:
- Tables (pipe tables with alignment)
- Strikethrough, footnotes
- Math (KaTeX via liquid tag)
- Collapsible sections (`{% details %}`, `{% spoiler %}`)
- 78 embed types (YouTube, GitHub, Twitter, CodePen, etc.)
- Raw HTML (kbd, sub, mark, abbr, figure, etc.)

Missing: task lists, TOC, `^superscript^` syntax (config says `false`)

### Substack — middle ground, but HTML-only

Substack supports more than Medium but less than Dev.to:
- Footnotes (custom HTML)
- LaTeX/math (MathJax, custom HTML)
- Strikethrough (`<s>`)
- Embeds (YouTube, Twitter, Spotify, etc.)
- Mentions, embedded posts

Missing: tables (no native support), H1 (rare), sub/sup/mark/kbd, details/summary, task lists, TOC

**Key limitation**: Substack returns HTML only — requires `turndown` dependency + custom
component handlers for Substack-specific HTML structures.

## What mdingest needs to handle per provider

| Task | Medium | Dev.to | Substack |
|---|---|---|---|
| Body format | Markdown (from Freedium) | Markdown (native) | **HTML** (needs conversion) |
| New dependency | No | No | **Yes** (`turndown`) |
| Image conversion | `<picture>` → `![]()` | None (already Markdown) | `<figure><img>` → `![]()` + caption |
| Custom component handling | None (Freedium handles it) | Liquid tags → links (~50 lines) | 8+ Substack components (~100 lines) |
| Cover image injection | Yes (from `__data.json`) | Yes (from `cover_image` field) | Yes (from post metadata) |
| Retry logic | Yes (5x for placeholder issue) | No | No |
| Dual-source merge | Yes (download + `__data.json`) | No (single endpoint) | No (single endpoint) |
| Paywall handling | Fetched via Freedium | None | Free posts only (hard paywall) |

## Unverified claims

| Claim | Source | Status |
|---|---|---|
| "Freedium returns pipe tables" | `AGENTS.md`, `medium.service.ts` comments | **Unverified** — Freedium renderer source shows no TABLE paragraph type. Medium's data model has no tables. The `/api/download` endpoint code is not in the GitHub repo (may be custom to the mirror deployment). Needs verification when Freedium is back online. |
| "Freedium returns code languages" | `AGENTS.md` | **Verified** — renderer.py extracts `lang` from `codeBlockMetadata` |
| "Freedium returns tags" | `AGENTS.md` | **Verified** — renderer.py extracts tags from GraphQL `post.tags` |

## References

- Freedium renderer: [`freedium-library/src/freedium_library/services/medium/renderer.py`](https://github.com/Freedium-cfd/web/blob/main/freedium-library/src/freedium_library/services/medium/renderer.py)
- Forem Redcarpet config: [`app/lib/constants/redcarpet.rb`](https://github.com/forem/forem/blob/main/app/lib/constants/redcarpet.rb)
- Forem allowed tags: [`app/services/markdown_processor.rb`](https://github.com/forem/forem/blob/main/app/services/markdown_processor.rb)
- Forem liquid tags: [`app/liquid_tags/`](https://github.com/forem/forem/tree/main/app/liquid_tags)
- Substack API: `GET https://{publication}/api/v1/posts/{slug}` (returns `body_html` only)
- Substack embed types: [nsokolsky.substack.com](https://nsokolsky.substack.com/p/how-to-insert-a-table-in-substack)
