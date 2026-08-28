import { z } from "zod";

/**
 * Article metadata schema — shared across all providers.
 * Each provider extracts these fields from its own source.
 * The schema is the contract; extraction is provider-specific.
 */

export const ArticleMetadataSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  published: z.string().optional(),
  updated: z.string().optional(),
  reading_time: z.string().optional(),
  source_url: z.string(),
  provider: z.string(),
  tags: z.array(z.string()).default([]),
  free: z.boolean().optional(),
});

export type ArticleMetadata = z.infer<typeof ArticleMetadataSchema>;

/**
 * Build YAML frontmatter string from metadata.
 * Shared across all providers — the format is the same, only the data differs.
 */
export function buildFrontmatter(meta: ArticleMetadata): string {
  const lines: string[] = ["---"];

  lines.push(`title: ${formatYamlValue(meta.title)}`);

  if (meta.subtitle) {
    lines.push(`subtitle: ${formatYamlMultiline(meta.subtitle)}`);
  }
  if (meta.author) {
    lines.push(`author: ${formatYamlValue(meta.author)}`);
  }
  if (meta.date) {
    lines.push(`date: ${formatYamlValue(meta.date)}`);
  }
  if (meta.published) {
    lines.push(`published: ${formatYamlValue(meta.published)}`);
  }
  if (meta.updated) {
    lines.push(`updated: ${formatYamlValue(meta.updated)}`);
  }
  if (meta.reading_time) {
    lines.push(`reading_time: ${formatYamlValue(meta.reading_time)}`);
  }
  if (meta.free !== undefined) {
    lines.push(`free: ${meta.free}`);
  }

  lines.push(`source_url: ${formatYamlValue(meta.source_url)}`);
  lines.push(`provider: ${formatYamlValue(meta.provider)}`);

  if (meta.tags.length > 0) {
    const tagList = meta.tags
      .map((t) => `  - ${formatYamlValue(t)}`)
      .join("\n");
    lines.push("tags:");
    lines.push(tagList);
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Format a YAML scalar value.
 * Uses double-quote style with escaping — safe for all values.
 */
function formatYamlValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Format a multi-line YAML string (for subtitle).
 * Uses single-quoted YAML style — newlines preserved literally, single quotes escaped as ''.
 */
function formatYamlMultiline(value: string): string {
  if (value.includes("\n")) {
    const escaped = value.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  return formatYamlValue(value);
}
