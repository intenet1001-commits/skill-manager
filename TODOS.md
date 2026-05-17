# TODOS — Skill Manager

## ✅ DONE — Claude CLI cold-start latency (2026-05-17)

Anthropic SDK fast-path (`anthropic.messages.stream`) implemented in `app/api/recommend/route.ts:168-207`.
Falls back to CLI spawn only when no API key available. p50 latency from ~10s → <2s on SDK path.

---

## ✅ DONE — Auto-refresh index (2026-05-17)

`scripts/watch.mjs` created. Watches `~/.claude/plugins/`, `~/.claude/skills/`, polls `~/.claude/settings.json`.
2s debounce. No chokidar dependency (native `fs.watch` recursive on macOS).
Run with `npm run watch` alongside `npm run dev`.

---

## ✅ DONE — npm link CLI (2026-05-17)

`skill-manager` binary at `/opt/homebrew/bin/skill-manager`. Already linked.

---

## P1 — AI natural language query

**What:** Type "테스트 자동화가 필요해" → ranked skill suggestions. `/api/ask` endpoint.

**Why:** Closes the intent→skill gap. Current search requires knowing roughly what to look for.

**How:** Reuse `/api/recommend/route.ts` SDK fast-path block. Strip projectContext, simplify prompt to "natural language → skill". Add to `AIPanel.tsx` as a second input mode.

**Effort:** M (CC: ~20min)

**Pros:** Zero new dependencies. SDK fast-path already wired.

**Blocked by:** Nothing. `ANTHROPIC_API_KEY` auto-resolved from `~/.claude/settings.json`.

---

## P2 — Integrate watch + dev (concurrently)

**What:** `npm run dev` starts both Next.js and watch script simultaneously.

**How:** Add `concurrently` devDep. Replace `dev` script with `concurrently "next dev -p 9025" "node scripts/watch.mjs"`.

**Effort:** XS (~10min)

---

## P2 — Validate recommended-repos.ts URLs

**What:** Some URLs (openai/codex-plugin-cc, googleworkspace/cli, team-attention/plugins-for-claude-natives) may not exist.

**How:** `curl -s -o /dev/null -w "%{http_code}"` each URL. Remove 404s or add `unverified` flag.

**Effort:** S (~30min)
