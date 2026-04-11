import { execSync, execFileSync } from 'child_process'
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { NextRequest } from 'next/server'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'

const MANUAL_SOURCES_PATH = join(homedir(), '.claude', 'skills-sources.json')

function loadManualSources(): PluginSource[] {
  try {
    if (!existsSync(MANUAL_SOURCES_PATH)) return []
    return JSON.parse(readFileSync(MANUAL_SOURCES_PATH, 'utf-8'))
  } catch { return [] }
}

export interface PluginSource {
  name: string
  url: string
  type: 'marketplace' | 'plugin' | 'skill'
}

function getGitUrl(dir: string): string | null {
  try {
    if (!existsSync(join(dir, '.git'))) return null
    return execSync('git remote get-url origin', { cwd: dir, timeout: 3000 }).toString().trim()
  } catch {
    return null
  }
}

function isDir(p: string) {
  try { return statSync(p).isDirectory() } catch { return false }
}

export async function GET(req: NextRequest) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const home = homedir()
  const sources: PluginSource[] = []

  // Marketplaces
  const marketplacesDir = join(home, '.claude', 'plugins', 'marketplaces')
  if (existsSync(marketplacesDir)) {
    for (const name of readdirSync(marketplacesDir)) {
      const dir = join(marketplacesDir, name)
      if (!isDir(dir)) continue
      const url = getGitUrl(dir)
      if (url) sources.push({ name, url, type: 'marketplace' })
    }
  }

  // Individual plugins (skip marketplaces/ and cache/)
  const pluginsDir = join(home, '.claude', 'plugins')
  if (existsSync(pluginsDir)) {
    for (const name of readdirSync(pluginsDir)) {
      if (name === 'marketplaces' || name === 'cache') continue
      const dir = join(pluginsDir, name)
      if (!isDir(dir)) continue
      const url = getGitUrl(dir)
      if (url) sources.push({ name, url, type: 'plugin' })
    }
  }

  // Skills — check if the parent dir itself is a git repo (monorepo case)
  const skillsDir = join(home, '.claude', 'skills')
  if (existsSync(skillsDir)) {
    const parentUrl = getGitUrl(skillsDir)
    if (parentUrl) {
      // Derive a display name from the repo URL
      const repoName = parentUrl.replace(/\.git$/, '').split('/').pop() ?? 'claude-code-skills'
      sources.push({ name: repoName, url: parentUrl, type: 'skill' })
    }
    // Also check individual subdirs for standalone installs (their own .git)
    for (const name of readdirSync(skillsDir)) {
      if (name.endsWith('.bak')) continue
      const dir = join(skillsDir, name)
      if (!isDir(dir)) continue
      if (!existsSync(join(dir, '.git'))) continue  // must have own .git, not inherited
      const url = getGitUrl(dir)
      if (url) sources.push({ name, url, type: 'skill' })
    }
  }

  // npx-cached skill installer packages (e.g. antigravity-awesome-skills)
  const npxDir = join(home, '.npm', '_npx')
  if (existsSync(npxDir)) {
    try {
      for (const hash of readdirSync(npxDir)) {
        const modsDir = join(npxDir, hash, 'node_modules')
        if (!isDir(modsDir)) continue
        for (const pkgName of readdirSync(modsDir)) {
          const pkgJsonPath = join(modsDir, pkgName, 'package.json')
          if (!existsSync(pkgJsonPath)) continue
          try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
            const repo = pkg.repository
            if (!repo) continue
            const rawUrl = typeof repo === 'string' ? repo : (repo.url || '')
            const normalized = rawUrl
              .replace(/^git\+/, '').replace(/\.git$/, '')
              .replace(/^git:\/\/github\.com\//, 'https://github.com/')
              .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
              .replace('github.com:', 'github.com/')
            if (!normalized.includes('github.com')) continue
            const name = (pkg.name || pkgName).toLowerCase()
            const desc = (pkg.description || '').toLowerCase()
            if (!name.includes('skill') && !name.includes('claude') && !desc.includes('skill')) continue
            if (!sources.some(s => s.url === normalized)) {
              sources.push({ name: pkg.name || pkgName, url: normalized, type: 'skill' })
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip if npx dir unreadable */ }
  }

  // Manual sources (user-defined, ~/.claude/skills-sources.json)
  const manual = loadManualSources()
  for (const m of manual) {
    if (!sources.some(s => s.url === m.url)) {
      sources.push({ ...m, manual: true } as PluginSource & { manual: boolean })
    }
  }

  return Response.json(sources)
}

// PUT — save a new manual source
export async function PUT(req: NextRequest) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const body = await req.json() as { name: string; url: string; type: string }
  if (!body.url || !body.name) return Response.json({ error: 'missing fields' }, { status: 400 })
  const existing = loadManualSources()
  if (existing.some(s => s.url === body.url)) return Response.json({ ok: true, sources: existing })
  const updated = [...existing, { name: body.name, url: body.url, type: body.type || 'skill' }]
  try {
    writeFileSync(MANUAL_SOURCES_PATH, JSON.stringify(updated, null, 2), 'utf-8')
    return Response.json({ ok: true, sources: updated })
  } catch (e) {
    console.error('[plugin-sources] PUT write failed:', e)
    return Response.json({ error: 'write_failed' }, { status: 500 })
  }
}

// DELETE — remove a manual source by URL
export async function DELETE(req: NextRequest) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const { url } = await req.json() as { url: string }
  if (!url) return Response.json({ error: 'missing url' }, { status: 400 })
  const updated = loadManualSources().filter(s => s.url !== url)
  try {
    writeFileSync(MANUAL_SOURCES_PATH, JSON.stringify(updated, null, 2), 'utf-8')
    return Response.json({ ok: true })
  } catch (e) {
    console.error('[plugin-sources] DELETE write failed:', e)
    return Response.json({ error: 'write_failed' }, { status: 500 })
  }
}

// POST — install a GitHub repo via git clone/pull
export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN

  const body = await req.json() as { url: string; name: string; type: 'marketplace' | 'plugin' | 'skill' }
  const { url, name, type } = body

  // Validate URL
  if (!url || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/i.test(url)) {
    return Response.json({ error: 'invalid_url' }, { status: 400 })
  }

  // Validate name
  if (!name || !/^[\w][\w.-]*$/.test(name) || name.includes('..')) {
    return Response.json({ error: 'invalid_name' }, { status: 400 })
  }

  const home = homedir()

  // Determine target directory
  let targetDir: string
  if (type === 'marketplace') {
    targetDir = join(home, '.claude', 'plugins', 'marketplaces', name)
  } else if (type === 'plugin') {
    targetDir = join(home, '.claude', 'plugins', name)
  } else {
    targetDir = join(home, '.claude', 'skills', name)
  }

  // Clone or pull
  let action: 'cloned' | 'pulled'
  try {
    if (existsSync(join(targetDir, '.git'))) {
      execFileSync('git', ['-C', targetDir, 'pull', '--ff-only'], { timeout: 30000 })
      action = 'pulled'
    } else {
      mkdirSync(join(targetDir, '..'), { recursive: true })
      execFileSync('git', ['clone', url, targetDir], { timeout: 60000 })
      action = 'cloned'
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[plugin-sources] POST git operation failed:', msg)
    return Response.json({ error: 'git_failed', detail: msg }, { status: 500 })
  }

  // For marketplace type: update settings.json and known_marketplaces.json
  if (type === 'marketplace') {
    try {
      const settingsPath = join(home, '.claude', 'settings.json')
      const knownPath = join(home, '.claude', 'plugins', 'known_marketplaces.json')

      // Read marketplace.json for plugin list
      const marketplaceJsonPath = join(targetDir, '.claude-plugin', 'marketplace.json')
      let pluginNames: string[] = []
      if (existsSync(marketplaceJsonPath)) {
        try {
          const mj = JSON.parse(readFileSync(marketplaceJsonPath, 'utf-8'))
          if (Array.isArray(mj.plugins)) {
            pluginNames = mj.plugins.map((p: { name: string } | string) =>
              typeof p === 'string' ? p : p.name
            )
          }
        } catch { /* ignore parse errors */ }
      }

      // Read and update settings.json
      let settings: Record<string, unknown> = {}
      try {
        if (existsSync(settingsPath)) {
          settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        }
      } catch { settings = {} }

      if (!settings.extraKnownMarketplaces || typeof settings.extraKnownMarketplaces !== 'object') {
        settings.extraKnownMarketplaces = {}
      }
      ;(settings.extraKnownMarketplaces as Record<string, string>)[name] = targetDir

      if (!settings.enabledPlugins || typeof settings.enabledPlugins !== 'object') {
        settings.enabledPlugins = {}
      }
      for (const p of pluginNames) {
        ;(settings.enabledPlugins as Record<string, boolean>)[`${p}@${name}`] = true
      }

      // Atomic write to settings.json
      const tmpPath = settingsPath + '.tmp'
      writeFileSync(tmpPath, JSON.stringify(settings, null, 2), 'utf-8')
      renameSync(tmpPath, settingsPath)

      // Update known_marketplaces.json
      let known: Record<string, unknown> = {}
      try {
        if (existsSync(knownPath)) {
          known = JSON.parse(readFileSync(knownPath, 'utf-8'))
        }
      } catch { known = {} }
      known[name] = { source: url, installLocation: targetDir, lastUpdated: new Date().toISOString() }
      writeFileSync(knownPath, JSON.stringify(known, null, 2), 'utf-8')
    } catch (e) {
      console.error('[plugin-sources] POST settings update failed (non-fatal):', e)
    }
  }

  return Response.json({ ok: true, action, restartRequired: true })
}
