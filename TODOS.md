# TODOS — Skill Manager

## P1 — Investigate Claude CLI cold-start latency

**What:** Reduce 5-15s spawn latency on `/api/recommend` requests.

**Why:** Each request spawns a fresh `claude` CLI process via `spawn()` in `app/api/recommend/route.ts:165`. Cold start dominates user-perceived latency. The 35-second timeout fallback to keyword search exists because Claude often doesn't finish in time. The textarea + drag-and-drop input improvements (CEO plan 2026-04-06-textarea-dragdrop.md) make the input richer, but the bottleneck is the output side. Identified by adversarial cross-model review during 2026-04-06 CEO plan session.

**How:** Investigate one of:
1. Warm process pool (2-3 idle processes ready)
2. Claude SDK persistent connection (replaces CLI spawn)
3. Pre-warm one process on dashboard load
4. Use `@anthropic-ai/sdk` directly instead of CLI

**Effort:** M (human: ~4h / CC: ~30min)

**Pros:** Could drop p50 latency from ~10s to <2s. Removes need for fallback in most cases.

**Cons:** Process pool adds lifecycle complexity. SDK migration changes auth model.

**Blocked by:** Nothing.

---

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
