import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { globSync } from 'glob'

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
// Excludes only plugins explicitly set to false in enabledPlugins.
// If enabledPlugins is null (unreadable) or key is absent → include.
function isPluginEnabled(enabledPlugins, pluginName, marketplace) {
  if (!enabledPlugins) return true
  const key = `${pluginName}@${marketplace}`
  if (!enabledPlugins.has(key)) return true  // not listed → include
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

  // 1. Plugin skills
  const cachePaths = globSync(join(PLUGIN_CACHE, '**/skills/*/SKILL.md'), { nodir: true })
  console.log(`Found ${cachePaths.length} plugin SKILL.md files`)

  for (const skillPath of cachePaths) {
    try {
      const { plugin, marketplace, skillName, isTemp } = parseCachePath(skillPath)
      if (!skillName) continue

      // Skip plugins explicitly disabled in ~/.claude/settings.json enabledPlugins
      if (!isTemp && !isPluginEnabled(enabledPlugins, plugin, marketplace)) continue

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
