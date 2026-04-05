import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { globSync } from 'glob'
import matter from 'gray-matter'

const HOME = homedir()
const PLUGIN_CACHE = join(HOME, '.claude/plugins/cache')
const STANDALONE_SKILLS_DIR = join(HOME, '.claude/skills')

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

  // 1. Plugin skills
  const cachePaths = globSync(join(PLUGIN_CACHE, '**/skills/*/SKILL.md'), { nodir: true })
  console.log(`Found ${cachePaths.length} plugin SKILL.md files`)

  for (const skillPath of cachePaths) {
    try {
      const { plugin, marketplace, skillName, isTemp } = parseCachePath(skillPath)
      if (!skillName) continue

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

  // 2. Standalone skills
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
