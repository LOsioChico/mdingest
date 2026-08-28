# KNOWN_GAPS.md — mdingest

## Known issues

| Issue | Severity | Status |
|---|---|---|
| No test files — `bun run test` exits with code 1 | High | Open |
| Multi-line YAML subtitle parsing truncates at first continuation line | Medium | Open — `parseFrontmatter` regex `(?=^\S)` matches continuation lines as new keys. Single-line subtitles work. |
| `freedium.service.ts` does not check `error` field in `__data.json` chunk | Medium | Open — SvelteKit streaming format returns `{error:{status:404,...}}` for missing articles. Code assumes success. |
| Freedium `/api/download` intermittently returns 502 | Low | External — retry logic handles it when mirror is up |

## Not yet implemented

| Feature | Status |
|---|---|
| CLI (`src/cli.ts`) | Not started — verified feasible: `new MediumService(new FreediumService(), new CacheService())` works without NestJS boot |
| MCP server (`src/mcp.ts`) | Not started — same direct instantiation, wrap in `server.tool()` |
| Additional providers (Substack, Dev.to) | Not started — `Provider` interface ready in `common/types/` |
| Tests | Not started — `vitest` configured, no test files |
