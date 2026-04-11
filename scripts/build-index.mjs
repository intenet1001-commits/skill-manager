import { readFileSync, writeFileSync, existsSync, mkdirSync, lstatSync, readlinkSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { homedir } from 'os'
import { globSync } from 'glob'

// Returns true if filePath is a symlink whose target lives inside baseDir.
// Handles both valid and broken symlinks (lstat works on broken symlinks).
// Used to detect gstack-managed standalone skills that are indexed by the
// grouped scan (section 2b) — skipping them in the flat scan (section 2)
// prevents duplicate index entries and ensures removed gstack skills are
// properly excluded after a gstack upgrade.
function isSymlinkInto(filePath, baseDir) {
  try {
    const stat = lstatSync(filePath)
    if (!stat.isSymbolicLink()) return false
    const target = readlinkSync(filePath)
    const absTarget = resolve(dirname(filePath), target)
    return absTarget.startsWith(baseDir + '/')
  } catch {
    return false
  }
}

// Minimal frontmatter parser — avoids gray-matter/js-yaml (broken on Node 22)
function matter(content) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/
  const match = content.match(fm)
  if (!match) return { data: {}, content }
  const yamlBlock = match[1]
  const data = {}
  let currentKey = null
  let arrayMode = false
  for (const raw of yamlBlock.split('\n')) {
    const line = raw.replace(/\r$/, '')
    // List item under current key
    if (arrayMode && /^\s+-\s/.test(line)) {
      const val = line.replace(/^\s+-\s+/, '').replace(/^['"]|['"]$/g, '')
      data[currentKey].push(val)
      continue
    }
    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/)
    if (!kv) { arrayMode = false; continue }
    currentKey = kv[1]
    const raw_val = kv[2].trim()
    if (raw_val === '' || raw_val === null) {
      data[currentKey] = []
      arrayMode = true
    } else if (raw_val === 'true') {
      data[currentKey] = true; arrayMode = false
    } else if (raw_val === 'false') {
      data[currentKey] = false; arrayMode = false
    } else if (raw_val === 'null' || raw_val === '~') {
      data[currentKey] = null; arrayMode = false
    } else {
      data[currentKey] = raw_val.replace(/^['"]|['"]$/g, ''); arrayMode = false
    }
  }
  return { data, content: content.slice(match[0].length) }
}

const HOME = homedir()
const PLUGIN_CACHE = join(HOME, '.claude/plugins/cache')
const STANDALONE_SKILLS_DIR = join(HOME, '.claude/skills')

// Read enabledPlugins from settings.json.
// Returns a Map<"plugin@marketplace", boolean> or null if settings unavailable.
// null means "no filter — include everything" (graceful fallback).
function loadEnabledPlugins() {
  const settingsPath = join(HOME, '.claude/settings.json')
  if (!existsSync(settingsPath)) return null
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const ep = settings.enabledPlugins
    if (!ep || typeof ep !== 'object') return null
    return new Map(Object.entries(ep))
  } catch {
    return null
  }
}

// Returns true if a plugin should be included in the index.
// Logic:
//   - enabledPlugins null (settings unreadable) → include everything
//   - key explicitly false/false-string → exclude
//   - key absent or explicitly true → include
//     (absent = not explicitly disabled; e.g. freshly installed plugin)
function isPluginEnabled(enabledPlugins, pluginName, marketplace) {
  if (!enabledPlugins) return true
  const key = `${pluginName}@${marketplace}`
  if (!enabledPlugins.has(key)) return true  // absent = not explicitly disabled
  return enabledPlugins.get(key) !== false && enabledPlugins.get(key) !== 'false'
}

const tempDirPluginCache = new Map()

function getPluginForTempDir(tempDir) {
  if (tempDirPluginCache.has(tempDir)) return tempDirPluginCache.get(tempDir)
  const root = join(PLUGIN_CACHE, tempDir)
  if (existsSync(join(root, 'bkit.config.json'))) {
    tempDirPluginCache.set(tempDir, 'bkit')
    return 'bkit'
  }
  if (existsSync(join(root, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
      const name = pkg.name?.replace(/^@[^/]+\//, '') || tempDir
      tempDirPluginCache.set(tempDir, name)
      return name
    } catch {}
  }
  tempDirPluginCache.set(tempDir, null)
  return null
}

function parseCachePath(skillMdPath) {
  const rel = skillMdPath.slice(PLUGIN_CACHE.length + 1)
  const parts = rel.split('/')

  if (parts[0].startsWith('temp_')) {
    const plugin = getPluginForTempDir(parts[0]) || 'unknown'
    // temp_xxx/skills/skillname/SKILL.md
    const skillName = parts[2]
    return { plugin, marketplace: plugin + '-marketplace', skillName, isTemp: true }
  }

  // Standard: marketplace/plugin/version/skills/skillname/SKILL.md
  const marketplace = parts[0]
  const plugin = parts[1]
  const skillName = parts[4]
  return { plugin, marketplace, skillName, isTemp: false }
}

function extractTriggers(description) {
  if (!description) return []
  const match = description.match(/Triggers?:\s*([^\n.]+)/i)
  if (!match) return []
  return match[1].split(',').map(t => t.trim()).filter(Boolean)
}

function main() {
  const skills = new Map() // key -> entry (dedup: prefer non-temp)
  const enabledPlugins = loadEnabledPlugins()

  if (enabledPlugins) {
    const disabledCount = [...enabledPlugins.entries()].filter(([, v]) => v === false || v === 'false').length
    if (disabledCount > 0) {
      console.log(`Filtering: ${disabledCount} disabled plugin(s) will be excluded from index`)
    }
  }

  // Pre-build set of (plugin@marketplace) pairs present in plugin cache.
  // Used by section 4 to filter out marketplace plugins not yet installed.
  const cachedPluginKeys = new Set()
  const cacheMarketplaceDirs = globSync(join(PLUGIN_CACHE, '*/'), { nodir: false })
  for (const mktDir of cacheMarketplaceDirs) {
    const mktName = mktDir.slice(PLUGIN_CACHE.length + 1).replace(/\/$/, '')
    const pluginDirs = globSync(join(mktDir, '*/'), { nodir: false })
    for (const pd of pluginDirs) {
      const pName = pd.slice(mktDir.length + 1).replace(/\/$/, '')
      cachedPluginKeys.add(`${pName}@${mktName}`)
    }
  }

  // Build marketplace-defined plugin sets for source-of-truth filtering.
  // When a marketplace directory exists, it is the authoritative list of available
  // plugins for that marketplace. Cache entries NOT listed in the marketplace
  // (e.g. old v1 when marketplace only has v2/v3) are excluded.
  const marketplaceDefinedPlugins = new Set()  // "pluginName@marketplaceName"
  const managedMarketplaces = new Set()         // marketplaces with a local definition dir
  const MARKETPLACES_ROOT = join(HOME, '.claude/plugins/marketplaces')
  if (existsSync(MARKETPLACES_ROOT)) {
    for (const mktPluginsDir of globSync(join(MARKETPLACES_ROOT, '*/plugins/'), { nodir: false })) {
      const mktName = mktPluginsDir.slice(MARKETPLACES_ROOT.length + 1).split('/')[0]
      managedMarketplaces.add(mktName)
      for (const pd of globSync(join(mktPluginsDir, '*/'), { nodir: false })) {
        const pName = pd.replace(/\/$/, '').split('/').at(-1)
        marketplaceDefinedPlugins.add(`${pName}@${mktName}`)
      }
    }
  }

  // 1. Plugin skills
  const cachePaths = globSync(join(PLUGIN_CACHE, '**/skills/*/SKILL.md'), { nodir: true })
    .sort((a, b) => {
      try { return lstatSync(b).mtimeMs - lstatSync(a).mtimeMs }
      catch { return 0 }
    })
  console.log(`Found ${cachePaths.length} plugin SKILL.md files`)

  for (const skillPath of cachePaths) {
    try {
      const { plugin, marketplace, skillName, isTemp } = parseCachePath(skillPath)
      if (!skillName) continue

      // Skip plugins explicitly disabled in ~/.claude/settings.json enabledPlugins
      if (!isTemp && !isPluginEnabled(enabledPlugins, plugin, marketplace)) continue

      // If this marketplace has a local definition directory, use it as source of truth:
      // only include plugins that are actually listed in the marketplace (e.g. exclude
      // old cached v1 when marketplace only defines v2/v3).
      if (!isTemp && managedMarketplaces.has(marketplace) && !marketplaceDefinedPlugins.has(`${plugin}@${marketplace}`)) continue

      const content = readFileSync(skillPath, 'utf-8')
      const { data } = matter(content)

      const name = data.name || skillName
      const description = typeof data.description === 'string' ? data.description : ''
      const triggers = extractTriggers(description)

      const entry = {
        name,
        pluginName: plugin,
        marketplace,
        description: description.trim(),
        triggers,
        classification: data.classification || null,
        pdcaPhase: data['pdca-phase'] || null,
        userInvocable: data['user-invocable'] !== false,
        argumentHint: data['argument-hint'] || null,
        agent: data.agent || null,
        deprecationRisk: data['deprecation-risk'] || null,
        nextSkill: data['next-skill'] || null,
        invocationCommand: `/${plugin}:${name}`,
        source: 'plugin',
        isTemp,
      }

      const key = `${plugin}:${name}`
      if (!skills.has(key) || (!entry.isTemp && skills.get(key).isTemp)) {
        skills.set(key, entry)
      }
    } catch {
      // skip malformed
    }
  }

  // 2. Standalone skills (~/.claude/skills/<skill>/SKILL.md)
  const standalonePaths = globSync(join(STANDALONE_SKILLS_DIR, '*/SKILL.md'), { nodir: true })
  console.log(`Found ${standalonePaths.length} standalone SKILL.md files`)

  for (const skillPath of standalonePaths) {
    try {
      // Skip symlinks that point back into STANDALONE_SKILLS_DIR — these are
      // gstack-managed skills (indexed by the grouped scan below). Skipping here
      // prevents duplicate entries and ensures broken/removed gstack symlinks
      // are properly excluded without relying on readFileSync throwing.
      if (isSymlinkInto(skillPath, STANDALONE_SKILLS_DIR)) continue

      const skillName = skillPath.split('/').at(-2)
      const content = readFileSync(skillPath, 'utf-8')
      const { data } = matter(content)

      const name = data.name || skillName
      const description = typeof data.description === 'string' ? data.description : ''
      const triggers = extractTriggers(description)

      const entry = {
        name,
        pluginName: 'standalone',
        marketplace: 'standalone',
        description: description.trim(),
        triggers,
        classification: null,
        pdcaPhase: null,
        userInvocable: data['user-invocable'] !== false,
        argumentHint: null,
        agent: null,
        deprecationRisk: null,
        nextSkill: null,
        invocationCommand: `/${name}`,
        source: 'standalone',
        isTemp: false,
      }

      const key = `standalone:${name}`
      if (!skills.has(key)) {
        skills.set(key, entry)
      }
    } catch {
      // skip
    }
  }

  // 2b. Grouped standalone skills (~/.claude/skills/<group>/<skill>/SKILL.md)
  //     e.g. gstack organises skills under ~/.claude/skills/gstack/<skill>/SKILL.md
  const groupedPaths = globSync(join(STANDALONE_SKILLS_DIR, '*/*/SKILL.md'), { nodir: true })
    .filter(p => {
      // Exclude .cursor sub-trees and backup dirs (*.bak, *.old, *.backup)
      const parts = p.slice(STANDALONE_SKILLS_DIR.length + 1).split('/')
      const groupDir = parts[0]
      return !p.includes('/.cursor/') && !/\.(bak|old|backup)$/.test(groupDir)
    })
  console.log(`Found ${groupedPaths.length} grouped standalone SKILL.md files`)

  for (const skillPath of groupedPaths) {
    try {
      const rel = skillPath.slice(STANDALONE_SKILLS_DIR.length + 1)
      const parts = rel.split('/')
      const groupName = parts[0]   // e.g. "gstack"
      const skillDir = parts[1]    // e.g. "pair-agent"
      const content = readFileSync(skillPath, 'utf-8')
      const { data } = matter(content)

      const name = data.name || skillDir
      const description = typeof data.description === 'string' ? data.description : ''
      const triggers = extractTriggers(description)

      const entry = {
        name,
        pluginName: groupName,
        marketplace: 'standalone',
        description: description.trim(),
        triggers,
        classification: data.classification || null,
        pdcaPhase: data['pdca-phase'] || null,
        userInvocable: data['user-invocable'] !== false,
        argumentHint: data['argument-hint'] || null,
        agent: data.agent || null,
        deprecationRisk: null,
        nextSkill: null,
        invocationCommand: `/${groupName}:${name}`,
        source: 'standalone',
        isTemp: false,
      }

      const key = `${groupName}:${name}`
      if (!skills.has(key)) {
        skills.set(key, entry)
      }
    } catch {
      // skip
    }
  }

  // 3. Local dev plugins (~/cs_plugins/plugins/)
  const LOCAL_PLUGINS_DIR = join(HOME, 'cs_plugins/plugins')
  if (existsSync(LOCAL_PLUGINS_DIR)) {
    const localPaths = globSync(join(LOCAL_PLUGINS_DIR, '*/skills/*/SKILL.md'), { nodir: true })
    console.log(`Found ${localPaths.length} local dev SKILL.md files`)
    for (const skillPath of localPaths) {
      try {
        const rel = skillPath.slice(LOCAL_PLUGINS_DIR.length + 1)
        const parts = rel.split('/')
        const pluginName = parts[0]
        const skillName = parts[2]
        const content = readFileSync(skillPath, 'utf-8')
        const { data } = matter(content)
        const name = data.name || skillName
        const description = typeof data.description === 'string' ? data.description : ''
        const entry = {
          name,
          pluginName,
          marketplace: 'local',
          description: description.trim(),
          triggers: extractTriggers(description),
          classification: data.classification || null,
          pdcaPhase: data['pdca-phase'] || null,
          userInvocable: data['user-invocable'] !== false,
          argumentHint: data['argument-hint'] || null,
          agent: data.agent || null,
          deprecationRisk: null,
          nextSkill: null,
          invocationCommand: `/${pluginName}:${name}`,
          source: 'local',
          isTemp: false,
        }
        const key = `${pluginName}:${name}`
        if (!skills.has(key)) skills.set(key, entry)
      } catch { /* skip */ }
    }
  }

  // 4. Marketplace plugins (~/.claude/plugins/marketplaces/*/plugins/*/skills/*/SKILL.md)
  // Scan marketplace definitions for discovery — shows plugins not yet installed to cache.
  // Priority: cache(plugin) > marketplace > local dev. Skills already indexed from cache
  // are not overwritten (key collision → skip).
  // No enabledPlugins filter: skill manager is a discovery tool, show all available plugins.
  const MARKETPLACES_DIR = join(HOME, '.claude/plugins/marketplaces')
  if (existsSync(MARKETPLACES_DIR)) {
    const mktPaths = globSync(join(MARKETPLACES_DIR, '*/plugins/*/skills/*/SKILL.md'), { nodir: true })
    console.log(`Found ${mktPaths.length} marketplace SKILL.md files`)
    for (const skillPath of mktPaths) {
      try {
        const rel = skillPath.slice(MARKETPLACES_DIR.length + 1)
        const parts = rel.split('/')
        // parts: [marketplaceName, 'plugins', pluginName, 'skills', skillName, 'SKILL.md']
        const marketplaceName = parts[0]
        const pluginName = parts[2]
        const skillName = parts[4]
        if (!pluginName || !skillName) continue

        // Only show marketplace plugins that are actually installed in cache
        if (!cachedPluginKeys.has(`${pluginName}@${marketplaceName}`)) continue

        const content = readFileSync(skillPath, 'utf-8')
        const { data } = matter(content)

        const name = data.name || skillName
        const description = typeof data.description === 'string' ? data.description : ''
        const triggers = extractTriggers(description)

        const entry = {
          name,
          pluginName,
          marketplace: marketplaceName,
          description: description.trim(),
          triggers,
          classification: data.classification || null,
          pdcaPhase: data['pdca-phase'] || null,
          userInvocable: data['user-invocable'] !== false,
          argumentHint: data['argument-hint'] || null,
          agent: data.agent || null,
          deprecationRisk: data['deprecation-risk'] || null,
          nextSkill: data['next-skill'] || null,
          invocationCommand: `/${pluginName}:${name}`,
          source: 'marketplace',
          isTemp: false,
        }

        const key = `${pluginName}:${name}`
        // Cache (plugin) and local dev entries take priority over marketplace definitions
        if (!skills.has(key)) {
          skills.set(key, entry)
        }
      } catch {
        // skip malformed
      }
    }
  }

  const result = Array.from(skills.values())
    .map(({ isTemp, ...rest }) => rest)
    .sort((a, b) => a.name.localeCompare(b.name))

  mkdirSync('./public', { recursive: true })
  writeFileSync('./public/skills-index.json', JSON.stringify(result, null, 2))

  console.log(`\n✅ Built index: ${result.length} total skills`)

  const byPlugin = {}
  for (const s of result) {
    byPlugin[s.pluginName] = (byPlugin[s.pluginName] || 0) + 1
  }
  console.log('\nBreakdown by plugin:')
  Object.entries(byPlugin)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`))
}

main()
