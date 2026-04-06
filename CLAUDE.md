# CLAUDE.md — Skill_manager_1

Dashboard for discovering and browsing 1,149+ Claude Code skills across all installed plugins.
Next.js 15 app with Fuse.js fuzzy search, multi-filter, and CLI.

## Dev

- Dev server: `npm run dev` → port **9025**
- macOS launcher: `./실행.command`
- Global CLI: `npm link` once, then `skill-manager search/list/info/plugins`
- Index build: `npm run build-index` (auto-runs via predev/prebuild hook)

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
