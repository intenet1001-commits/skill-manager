# TODOS — Skill Manager

## P2 — Auto-refresh index

**What:** Watch `~/.claude/plugins/` for changes and rebuild `skills-index.json` automatically.

**Why:** Currently requires `npm run build-index` after every plugin install. With auto-refresh, installing a new plugin immediately appears in the dashboard.

**How:** Add `chokidar` watcher in a Next.js API route or a separate `scripts/watch.mjs` process. Debounce rebuilds to 2s. Show "Refreshed Xs ago" in StatsBar.

**Effort:** S (human: ~30min / CC: ~5min)

**Pros:** Zero manual steps after plugin changes.

**Cons:** Adds `chokidar` dependency + always-running watcher process.

**Blocked by:** Nothing. Can ship anytime.

---

## P2 — AI natural language query

**What:** Type "I need to write tests for my API" → get ranked skill suggestions with explanations. Uses the Anthropic API for semantic ranking.

**Why:** Closes the intent→skill gap. Right now you need to know roughly what you're looking for. NLP query works when you don't.

**How:** Add `/api/ask` endpoint. Two options:
- **Simple:** Use Claude API to classify the query against skill descriptions (no embeddings needed, just a prompt).
- **Better:** Pre-compute embeddings for all skill descriptions, store in `public/embeddings.json`, cosine-similarity at query time.

**Effort:** M (human: ~2hr / CC: ~15min)

**Pros:** The platonic ideal. Intent → skill, no searching required.

**Cons:** Requires `ANTHROPIC_API_KEY` env var. Embeddings file adds ~5MB to public dir.

**Note:** Claude Code OAuth login (if available) could provide the API key automatically — no separate env var setup needed. See user question 2026-04-05.

**Blocked by:** Nothing technical. Decision: use Claude API key vs Claude Code OAuth token.

---

## P3 — Keyboard shortcuts for CLI

**What:** `skill-manager` global CLI command available from any terminal via `npm link`.

**Status:** CLI is in Phase 1 scope — this TODO is just the `npm link` installation step for making it globally available without `node scripts/cli.mjs`.

**Effort:** XS (~5min)
