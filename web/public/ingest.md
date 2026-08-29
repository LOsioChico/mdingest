<!-- Mirror of src/pages/ingest.astro — update both when changing content -->

# Ingest an article

Paste a URL. Auto-detects the source. Returns clean Markdown with YAML frontmatter or structured JSON.

The interactive tool is at [/ingest](/ingest) (for humans with a browser). For programmatic access, use the [API](/docs.md).

## Supported sources

| Source | Example URL |
|---|---|
| Medium | `https://medium.com/@user/article` |
| Dev.to | `https://dev.to/user/post` |
| Substack | `https://example.substack.com/p/post` |

## Output formats

### markdown

Article body with YAML frontmatter. Drop into your LLM context, RAG pipeline, or save as `.md`.

```markdown
---
title: Article Title
author: Jane Doe
published: 2024-03-15
reading_time: 8 min
tags: [api, backend]
cover_image: https://...
---

# Article Title

Article body in clean Markdown...
```

### json

Structured `{ metadata, markdown }` object. Parse metadata separately, pipe markdown into your system.

```json
{
  "metadata": {
    "title": "Article Title",
    "author": "Jane Doe",
    "published": "2024-03-15",
    "reading_time": "8 min",
    "tags": ["api", "backend"],
    "cover_image": "https://..."
  },
  "markdown": "# Article Title\n\nArticle body..."
}
```

## API reference

See [/docs.md](/docs.md) for full endpoint documentation, CLI usage, MCP server setup, and error codes.
