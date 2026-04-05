# Skill Manager

A local dashboard for discovering and searching all your installed Claude Code skills and plugins.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## What it does

If you have Claude Code with multiple plugins installed, you probably have hundreds of skills — and no way to browse them. This tool indexes all your local skills and gives you:

- **Fuzzy search** across 1,000+ skills by name, trigger, or description
- **Filters** by plugin, PDCA phase, classification, and user-invocable status
- **Terminal CLI** for quick lookups without opening a browser
- **Copy to clipboard** — one click copies the invocation command

## Requirements

- [Claude Code](https://claude.ai/code) with plugins installed
- Node.js 18+

## Setup

```bash
git clone https://github.com/intenet1001-commits/skill-manager
cd skill-manager
npm install
npm run dev
```

Open http://localhost:9025 — your skills are indexed automatically on start.

## CLI

```bash
npm link   # one-time setup

skill-manager search "deploy"
skill-manager list --plugin bkit --phase do
skill-manager list --invocable --compact
skill-manager info bkit:pdca
skill-manager plugins
```

## How it works

`scripts/build-index.mjs` reads from:
- `~/.claude/plugins/cache/` — marketplace plugin skills
- `~/.claude/skills/` — standalone skills

Parses YAML frontmatter from each `SKILL.md` file and outputs `public/skills-index.json`. This file is gitignored — it contains your local skill inventory.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dashboard (auto-builds index) |
| `npm run build-index` | Rebuild index manually |
| `./실행.command` | macOS double-click launcher |
