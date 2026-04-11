# CLAUDE.md — Skill_manager_1

Dashboard for discovering and browsing 1,149+ Claude Code skills across all installed plugins.
Next.js 15 app with Fuse.js fuzzy search, multi-filter, and CLI.

## Dev

- Dev server: `npm run dev` → port **9025**
- macOS launcher: `./실행.command`
- Global CLI: `npm link` once, then `skill-manager search/list/info/plugins`
- Index build: `npm run build-index` (auto-runs via predev/prebuild hook)

## Index Builder (build-index.mjs)

Entry point: `scripts/build-index.mjs`. Scans 5 sources in priority order (first-write-wins per key `pluginName:skillName`) and writes `public/skills-index.json`. Cache paths are mtime-sorted descending so the newest cached version of a skill wins.

### Scan sections (in order)
1. **Plugin cache** (`~/.claude/plugins/cache/**/skills/*/SKILL.md`) — primary source; filtered by `isPluginEnabled()` and managed-marketplace source-of-truth check
2. **Standalone flat** (`~/.claude/skills/*/SKILL.md`) — skips symlinks pointing into `~/.claude/skills/` via `isSymlinkInto()` (gstack/impeccable symlinks are covered by section 3)
3. **Standalone grouped** (`~/.claude/skills/*/*/SKILL.md`) — e.g. `~/.claude/skills/gstack/<skill>/SKILL.md`; excludes `.cursor/` subtrees and `*.bak/old/backup` dirs
4. **Local dev** (`~/cs_plugins/plugins/*/skills/*/SKILL.md`) — always included if the dir exists; no enabledPlugins filter
5. **Marketplace definitions** (`~/.claude/plugins/marketplaces/*/plugins/*/skills/*/SKILL.md`) — only plugins present in cache (`cachedPluginKeys`) are indexed; cache/local entries take priority on collision

### Filtering logic
- **`isPluginEnabled()`**: only excludes plugins explicitly set to `false` in `enabledPlugins` (`~/.claude/settings.json`). Absent key = not explicitly disabled = included (prevents freshly installed plugins from being filtered out).
- **Managed marketplace source-of-truth** (`managedMarketplaces` + `marketplaceDefinedPlugins`): if `~/.claude/plugins/marketplaces/<name>/plugins/` exists, only plugins listed there are allowed from that marketplace's cache. Old cached versions not in the marketplace (e.g. v1 when marketplace defines v2/v3) are excluded.
- **Symlink dedup** (`isSymlinkInto(filePath, STANDALONE_SKILLS_DIR)`): detects gstack-style symlinks in section 2 so section 3 is the single indexed source for those skills. Works on broken symlinks via `lstatSync` (unlike `statSync`).

## AI Panel (Recommend API)

- Entry point: `app/api/recommend/route.ts`
- Spawns `claude` CLI via `spawn()` with `shell: false` (line 166) — sanitizer must NOT strip shell-safe chars (backticks, `$`, `<>`, `()`, `{}`) since there is no shell interpolation. Stripping them silently corrupts dropped `.md` content. Only control chars (`\x00-\x1F`) need stripping.
- CLAUDE.md is sent as a separate `claudeMd` field on the project context (limit 2000 chars), NOT mixed into the `summary` string. Server endpoint at `app/api/project-context/route.ts` reads it; client interface in `components/AIPanel.tsx` ProjectContext type.
- Concurrency cap: 5 parallel claude spawns (`MAX_CONCURRENT`)
- Fallback: if Claude doesn't return within 35s, keyword-search recommendation runs instead with `fallback: true` flag
- Goal text limit: 5000 chars (server `sanitizeGoal`), projectContext limit: 2500 chars
- Known P1 (TODOS.md): Claude CLI cold-start latency (5-15s) dominates user-perceived latency

## Tmux Team Launcher (run-skills API)

- Entry point: `app/api/run-skills/route.ts`
- Single skill → opens iTerm with `claude '<cmd>'` directly
- Multiple skills → launches omc `runtime-cli.cjs` inside a tmux session via iTerm
- `setupTmuxSessionDetached` runs as a detached background script after team launch:
  1. Waits for tmux session to exist (max 5s)
  2. Sets `pane-border-status top` and labels each pane: `🧭 LEAD (talk here for follow-up tasks)` for index 0, `🤖 Worker-N` for others
  3. Sends Enter to all panes 3 times (2s spacing) to fix runtime-cli's lost-Enter race condition
  4. Auto-focuses LEAD pane (index 0)
- `--dangerously-skip-permissions` is opt-in via the `skipPerms` checkbox; NOT auto-enabled
- Assumes runtime-cli creates LEAD as pane index 0 — verify on next team launch (P1 TODO)

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
