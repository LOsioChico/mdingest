# KNOWN_GAPS.md — mdingest

## Known issues

| Issue | Severity | Status |
|---|---|---|
| Multi-line YAML subtitle parsing truncates at first continuation line | Medium | Open — `parseFrontmatter` regex `(?=^\S)` matches continuation lines as new keys. Single-line subtitles work. |
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up |

## Not yet implemented

| Feature | Status |
|---|---|
| CLI (`src/cli.ts`) | Not started — verified feasible: `new MediumService(new FreediumService(), new CacheService())` works without NestJS boot |
| MCP server (`src/mcp.ts`) | Not started — same direct instantiation, wrap in `server.tool()` |
| Additional providers (Substack, Dev.to) | Not started — `Provider` interface ready in `common/types/` |
