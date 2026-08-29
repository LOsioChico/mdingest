# Substack extraction — free vs paid posts

> Reference for the Substack provider (implemented). Documents what the API
> returns, the hard limit on paid content, and the full content fidelity
> analysis for free posts.

## How to identify free vs paid posts

Substack's public API (`GET /api/v1/posts/{slug}`, no auth) returns a JSON
object with an `audience` field:

| `audience` value | Meaning | Full content available? |
|---|---|---|
| `"everyone"` | Free post | Yes — `body_html` contains the full article |
| `"only_paid"` | Paid post | No — `body_html` is truncated (preview only, ~30-60% of article) |

The archive endpoint (`GET /api/v1/archive?sort=new&offset=0&limit=50`) also
returns `audience` per post, so you can filter before fetching individual
posts.

### Paid post truncation — verified

Tested with `lennysnewsletter.com` (Lenny's Newsletter):

| Post | `audience` | `body_html` length | `wordcount` field | Content ends at |
|---|---|---|---|---|
| "How to figure out your next career move" | `only_paid` | 56,580 chars | 4,860 words | Mid-article, at "4. What possible moves should I explore?" heading — no closing tag, no paywall marker, just cut off |

The truncation is **server-side and silent** — no `<hr>`, no "subscribe to
continue" marker in the HTML. The `body_html` simply ends mid-paragraph. The
`wordcount` field reports the full article length (4,860 words) even though
only the preview is sent.

## Content fidelity (verified via curl, 28 posts scanned)

### Key difference from Dev.to: Substack returns HTML, not Markdown

Substack's API returns `body_html` only — there is no `body_markdown` field.
All content must be converted from HTML to Markdown. This requires a
dependency (`turndown` or similar) that was deliberately rejected for the
Medium/Dev.to providers.

### Block-by-block verification (28 free posts, multiple publications)

Publications tested: `platformer.substack.com`, `benn.substack.com`,
`matt-rickard.substack.com`, `blog.bytebytego.com`, `mostlypython.substack.com`,
`www.astralcodexten.com`, `www.argmin.net`, `structuretheory.substack.com`,
`lcamtuf.substack.com`, `www.noahpinion.blog`, `www.afterbabel.com`,
`www.aisnakeoil.com`, `javarevisited.substack.com`, others.

| Block type | In `body_html`? | HTML format | Found in | Conversion needed |
|---|---|---|---|---|
| Headings | Yes | `<h1>`–`<h6>` | 13/28 posts | `#` → `######` |
| Paragraphs | Yes | `<p>` | 28/28 posts | Plain text |
| Bold | Yes | `<strong>` | 19/28 posts | `**text**` |
| Italic | Yes | `<em>` | 21/28 posts | `*text*` |
| Strikethrough | Yes | `<s>` (not `<del>`) | 1/28 posts | `~~text~~` |
| Inline code | Yes | `<code>` | 6/28 posts | `` `code` `` |
| Code blocks | Yes | `<pre><code>` | 2/28 posts | ` ```code``` ` |
| Blockquotes | Yes | `<blockquote>` | 10/28 posts | `> text` |
| Ordered lists | Yes | `<ol><li>` | 11/28 posts | `1. item` |
| Unordered lists | Yes | `<ul><li>` | 15/28 posts | `- item` |
| Horizontal rules | Yes | `<hr>` | 12/28 posts | `---` |
| Links | Yes | `<a href>` | 26/28 posts | `[text](url)` |
| Images | Yes | `<img>` in `<figure>` | 21/28 posts | `![alt](url)` |
| Image captions | Yes | `<figcaption class="image-caption">` | 12/28 posts | `*caption*` below image |
| Footnotes | Yes | Custom HTML (see below) | 8/28 posts | `[^1]` + `[^1]: def` |
| LaTeX/math | Yes | Custom HTML (see below) | 2/28 posts | `$LaTeX$` or `$$LaTeX$$` |
| YouTube embeds | Yes | Custom HTML (see below) | 1/28 posts | `[YouTube](url)` |
| Twitter embeds | Yes | Custom HTML (see below) | 1/28 posts | `[Tweet](url)` |
| Mentions | Yes | Custom HTML (see below) | 1/28 posts | `@username` |
| Embedded posts | Yes | Custom HTML (see below) | 1/28 posts | `[post](url)` |
| `<sub>` | Yes | Raw HTML | 1/28 posts | Pass through |
| Subscribe buttons | Yes | Custom HTML | 12/28 posts | Strip (marketing) |

### NOT supported by Substack (verified — not found in 28 posts)

| Feature | Status | Notes |
|---|---|---|
| Tables (`<table>`) | **Not supported** | Substack has no native table block. Authors use Datawrapper embeds or screenshots. ([source](https://www.reallygoodbusinessideas.com/p/how-to-add-tables-to-substack)) |
| `<sup>` | Not found | May work via raw HTML but not used in practice |
| `<mark>` | Not found | Not in Substack's editor |
| `<kbd>` | Not found | Not in Substack's editor |
| `<details>`/`<summary>` | Not found | No collapsible sections |
| Task lists | Not supported | Not in Substack's editor |
| TOC | Not supported | Not in Substack's editor |

### Custom HTML structures (Substack-specific, need special handling)

These use `data-component-name` attributes and `data-attrs` JSON. Standard
HTML→Markdown converters (turndown) will NOT handle these correctly — they
need custom rules.

#### 1. Images with captions

```html
<figure>
  <a class="image-link image2" target="_blank" href="https://substackcdn.com/...">
    <img src="https://substackcdn.com/image/fetch/..." data-component-name="Image2ToDOM" />
  </a>
  <figcaption class="image-caption"><em>Caption text</em></figcaption>
</figure>
```

Image URLs are CDN-wrapped: `https://substackcdn.com/image/fetch/{params}/{original-url}`.
The original S3 URL is URL-encoded inside the CDN wrapper.

#### 2. Footnotes

In-text reference:
```html
<a class="footnote-anchor" data-component-name="FootnoteAnchorToDOM"
   id="footnote-anchor-1" href="#footnote-1" target="_self">1</a>
```

Definition (at bottom of article):
```html
<div class="footnote" data-component-name="FootnoteToDOM">
  <a id="footnote-1" href="#footnote-anchor-1" class="footnote-number"
     contenteditable="false" target="_self">1</a>
  <div class="footnote-content"><p>Footnote text with <a href="...">links</a></p></div>
</div>
```

Convert to: `[^1]` in text, `[^1]: definition` at bottom.

#### 3. LaTeX/math (MathJax-powered)

```html
<div class="latex-rendered" data-component-name="LatexBlockToDOM"
     data-attrs="{&quot;persistentExpression&quot;:&quot;J_{\\alpha}(x) = \\sum_{m=0}^{\\infty}\\frac{(-1)^m}{m!\\Gamma(m+\\alpha+1)}\\left(\\frac{x}{2}\\right)^{2m+x}&quot;,&quot;id&quot;:&quot;GIXLWNWBRB&quot;}">
</div>
```

The raw LaTeX expression is stored in `data-attrs` as JSON
(`persistentExpression` field). Convert to `$$LaTeX$$` (block) or `$LaTeX$`
(inline). Substack uses MathJax, not KaTeX.

#### 4. YouTube embeds

```html
<div class="youtube-wrap" data-component-name="Youtube2ToDOM"
     data-attrs="{&quot;videoId&quot;:&quot;8xBJPa_480Q&quot;,...}">
  <div class="youtube-inner">
    <iframe src="https://www.youtube-nocookie.com/embed/8xBJPa_480Q?..." ...></iframe>
  </div>
</div>
```

Video ID in `data-attrs`. Convert to: `[YouTube video](https://youtube.com/watch?v=ID)`.

#### 5. Twitter/X embeds

```html
<div class="twitter-embed" data-component-name="Twitter2ToDOM"
     data-attrs="{&quot;url&quot;:&quot;https://x.com/user/status/123&quot;,
     &quot;full_text&quot;:&quot;Full tweet text here...&quot;,
     &quot;username&quot;:&quot;user&quot;,&quot;name&quot;:&quot;Display Name&quot;,...}">
</div>
```

Full tweet text is in `data-attrs` (`full_text` field). Convert to:
`> **@user**: Full tweet text\n>\n> [Tweet](url)` (blockquote with link).

#### 6. Mentions

```html
<span class="mention-wrap" data-component-name="MentionToDOM"
      data-attrs="{&quot;name&quot;:&quot;Maxime Labonne&quot;,&quot;id&quot;:31453795,...}">
</span>
```

Convert to: `[@Maxime Labonne](https://substack.com/profile/31453795)`.

#### 7. Embedded Substack posts

```html
<a class="embedded-post" data-component-name="EmbeddedPostToDOM"
   href="https://publication.substack.com/p/post-slug">
  <div class="embedded-post-header">...</div>
</a>
```

Convert to: `[Post title](url)`.

#### 8. Subscribe buttons / widgets

```html
<!-- ButtonCreateButton -->
<a class="button primary" data-component-name="ButtonCreateButton"
   href="https://pub.substack.com/subscribe?">Subscribe now</a>

<!-- SubscribeWidgetToDOM -->
<div data-component-name="SubscribeWidgetToDOM">...</div>
```

Strip entirely — these are marketing elements, not content.

### Supported embed types (from Substack source + community research)

Officially documented: YouTube, TikTok, Spotify, Datawrapper, Polymarket,
LaTeX, TradingView.

Undocumented (found via source code inspection): Instagram, Vimeo, SoundCloud,
Apple Podcasts, GitHub Gists, Bandcamp, OpenSea, Lichess.

All work by pasting a URL into the editor. Each renders as a
`data-component-name="{Platform}ToDOM"` div with `data-attrs` JSON containing
the embed metadata.

## Extraction strategy (implemented — free posts only)

1. Parse URL → extract `{ domain, slug }` from `https://{domain}/p/{slug}`
2. `GET https://{domain}/api/v1/posts/{slug}` — fetch post JSON (single endpoint)
3. Check `audience === "only_paid"` → throw `SUBSTACK.PAID_POST` (403)
4. `preprocessHtml(body_html)` — regex-replace empty-element components:
   - LaTeX (`LatexBlockToDOM`) → `<p>$$expr$$</p>`
   - Twitter (`Twitter2ToDOM`) → `<blockquote>` placeholder
   - Mentions (`MentionToDOM`) → `<a>` link placeholder
   - YouTube (`Youtube2ToDOM`) → `<a>` link placeholder
   - (turndown skips empty `<div></div>` — filters never fire for childless elements)
5. `turndown.turndown(preprocessed)` — standard HTML→Markdown + turndown rules for:
   - Footnote anchors (`FootnoteAnchorToDOM`) → `[^N]`
   - Footnote definitions (`FootnoteToDOM`) → `[^N]: definition`
   - Image captions (`<figcaption class="image-caption">`) → `*caption*`
   - Embedded posts (`EmbeddedPostToDOM`) → `[title](url)`
   - Subscribe buttons/widgets → stripped (`td.remove()`)
6. `cleanupMarkdown(md)` — strip leftover `<span>` tags, collapse blank lines
7. Inject cover image at top of body (Substack body_html has no H1)
8. Build frontmatter from post metadata + prepend to body

### HTML→Markdown conversion (implemented)

Chose `turndown` + custom rules. Alternatives rejected:
- `html-to-md`: no custom rule API, only `renderCustomTags: 'SKIP'`
- `node-html-markdown`: `customTranslators` less flexible than `addRule(filter, replacement)`

Key implementation detail: turndown skips empty elements (filters never fire for
`<div></div>`). LaTeX, Twitter, mentions, and YouTube all render as empty elements
with data in `data-attrs`. These are pre-processed with regex before turndown runs.
Components with child content (footnotes, image captions, embedded posts) use
turndown's `addRule()` API.

## Why paid posts are not extracted

Substack uses a **hard server-side paywall**. Unlike Medium (which sends the
full article HTML to the browser and hides it with a client-side overlay),
Substack's server **never sends the paid content** to unauthenticated
requests. The `body_html` field for `audience: "only_paid"` posts contains
only a truncated preview.

### What does NOT work (verified)

| Method | Result |
|---|---|
| Public API (`/api/v1/posts/{slug}`) | Truncated `body_html` for paid posts |
| Googlebot User-Agent | Same truncated response |
| `X-Forwarded-For` with Google IP | No effect |
| Translate endpoint (`/api/v1/posts/{id}/translate`) | Translates only the truncated preview |
| Archive.today / archive.ph | Captures the truncated preview, not full content |
| Freedium mirror | Does not support Substack (404) |
| Free signup (`/api/v1/free`) + session cookies | Still truncated — free tier ≠ paid access |
| `magic_token`, `gift=true`, `utm_source=google` params | No effect |

### What DOES work (requires authentication)

Providing a `substack.sid` session cookie from a **paid subscriber** account
unlocks full content via the same `/api/v1/posts/{slug}` endpoint. This is
how all known Substack tools work (`substack_api`, `substack-cli`,
`substack-downloader`, `website-to-api` skill). No unauthenticated bypass
exists — the content is gated server-side.

## Fields available from the API

| Field | Available for free posts | Available for paid posts |
|---|---|---|
| `title` | Yes | Yes |
| `subtitle` | Yes | Yes |
| `slug` | Yes | Yes |
| `canonical_url` | Yes | Yes |
| `post_date` | Yes | Yes |
| `audience` | Yes | Yes |
| `wordcount` | Yes | Yes (full article word count, even though body is truncated) |
| `body_html` | Yes (full) | Truncated preview only |
| `publishedBylines` | Yes | Yes |
| `reaction_count` | Yes | Yes |
| `comment_count` | Yes | Yes |

## Comparison with Dev.to and Medium

| Concern | Substack | Dev.to | Medium (current) |
|---|---|---|---|
| Auth required | No | No | No (Freedium mirror) |
| Paywall | Yes (hard, server-side) | None | Yes (bypassed via Freedium) |
| Body format | **HTML** (needs conversion) | Markdown (native) | Markdown (via Freedium) |
| New dependency needed | **Yes** (`turndown`) | No | No |
| Custom component handling | **Yes** (8+ Substack-specific) | Yes (liquid tags) | Yes (`<picture>` tags) |
| Tables | **Not supported** | Yes (pipe tables) | **Unverified** (Freedium renderer source shows no TABLE type; Medium data model has no tables) |
| Footnotes | Yes (custom HTML) | Yes (Redcarpet) | No |
| LaTeX/math | Yes (MathJax, custom HTML) | Yes (KaTeX liquid tag) | No |
| Retries needed | No | No | Yes (up to 5) |
| Content completeness | Free posts: full. Paid: truncated | Full | Full (paywall bypassed) |

Substack is the **most complex** provider: HTML conversion + 8+ custom
component handlers + no tables + limited to free posts only. Dev.to remains
the simplest.

## References

- Public API endpoint: `GET https://{publication}/api/v1/posts/{slug}`
- Archive listing: `GET https://{publication}/api/v1/archive?sort=new&offset=0&limit=50`
- Session auth: `Cookie: substack.sid={value}` header (paid subscriber only)
- LaTeX support: [Math in Substack](https://www.argmin.net/p/math-in-substack)
- Table limitation: [How to Add Tables to Substack](https://www.reallygoodbusinessideas.com/p/how-to-add-tables-to-substack)
- Embed types: [How to insert a table in Substack](https://nsokolsky.substack.com/p/how-to-insert-a-table-in-substack) (includes undocumented embed list)
