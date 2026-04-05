#!/usr/bin/env node
/**
 * skill-manager CLI
 * Usage:
 *   skill-manager search <query>
 *   skill-manager list [--plugin <name>] [--phase <phase>] [--invocable]
 *   skill-manager info <skill-name>
 *   skill-manager plugins
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INDEX_PATH = join(__dirname, '../public/skills-index.json')

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const BLUE = '\x1b[34m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'
const GRAY = '\x1b[90m'

const PHASE_COLORS = {
  pm: YELLOW, plan: CYAN, design: MAGENTA,
  do: GREEN, check: YELLOW, act: '\x1b[31m', report: BLUE,
}

function loadIndex() {
  if (!existsSync(INDEX_PATH)) {
    console.error(`${YELLOW}Index not found. Run: npm run build-index${RESET}`)
    process.exit(1)
  }
  try {
    return JSON.parse(readFileSync(INDEX_PATH, 'utf-8'))
  } catch {
    console.error(`${YELLOW}Index corrupted. Run: npm run build-index${RESET}`)
    process.exit(1)
  }
}

function fuzzyMatch(skill, query) {
  const q = query.toLowerCase()
  const fields = [
    skill.name,
    skill.invocationCommand,
    skill.description,
    ...(skill.triggers || []),
  ].join(' ').toLowerCase()
  return fields.includes(q)
}

function printSkill(skill, { compact = false } = {}) {
  const phase = skill.pdcaPhase ? `${PHASE_COLORS[skill.pdcaPhase] || ''}[${skill.pdcaPhase}]${RESET} ` : ''
  const cls = skill.classification ? `${DIM}(${skill.classification})${RESET} ` : ''
  const inv = skill.userInvocable ? '' : `${GRAY}[internal]${RESET} `
  console.log(`  ${BOLD}${CYAN}${skill.invocationCommand}${RESET} ${phase}${cls}${inv}`)
  if (!compact) {
    const desc = skill.description.replace(/Triggers?:.*$/im, '').trim()
    if (desc) {
      const short = desc.length > 100 ? desc.slice(0, 100) + '…' : desc
      console.log(`    ${GRAY}${short}${RESET}`)
    }
    if (skill.triggers?.length) {
      console.log(`    ${DIM}triggers: ${skill.triggers.slice(0, 4).join(', ')}${RESET}`)
    }
  }
}

function cmdSearch(args) {
  const query = args.join(' ').trim()
  if (!query) { console.error('Usage: skill-manager search <query>'); process.exit(1) }

  const skills = loadIndex()
  const results = skills.filter(s => fuzzyMatch(s, query))

  if (!results.length) {
    console.log(`${GRAY}No skills found for "${query}"${RESET}`)
    return
  }

  console.log(`\n${BOLD}${results.length} skills matching "${query}":${RESET}\n`)
  results.slice(0, 20).forEach(s => printSkill(s))
  if (results.length > 20) console.log(`\n  ${GRAY}…and ${results.length - 20} more. Open http://localhost:9025 to browse all.${RESET}`)
}

function cmdList(args) {
  const skills = loadIndex()
  let filtered = skills

  const pluginIdx = args.indexOf('--plugin')
  if (pluginIdx !== -1) filtered = filtered.filter(s => s.pluginName === args[pluginIdx + 1])

  const phaseIdx = args.indexOf('--phase')
  if (phaseIdx !== -1) filtered = filtered.filter(s => s.pdcaPhase === args[phaseIdx + 1])

  if (args.includes('--invocable')) filtered = filtered.filter(s => s.userInvocable)

  const compact = args.includes('--compact')
  console.log(`\n${BOLD}${filtered.length} skills:${RESET}\n`)
  filtered.slice(0, 50).forEach(s => printSkill(s, { compact }))
  if (filtered.length > 50) console.log(`\n  ${GRAY}…and ${filtered.length - 50} more. Open http://localhost:9025 to browse all.${RESET}`)
}

function cmdInfo(args) {
  const name = args[0]
  if (!name) { console.error('Usage: skill-manager info <skill-name>'); process.exit(1) }

  const skills = loadIndex()
  const skill = skills.find(s => s.name === name || s.invocationCommand === name || s.invocationCommand === `/${name}`)

  if (!skill) {
    console.log(`${GRAY}Skill "${name}" not found. Try: skill-manager search ${name}${RESET}`)
    return
  }

  console.log(`\n${BOLD}${CYAN}${skill.invocationCommand}${RESET}`)
  console.log(`  Plugin:       ${skill.pluginName} (${skill.marketplace})`)
  if (skill.classification) console.log(`  Type:         ${skill.classification}`)
  if (skill.pdcaPhase) console.log(`  PDCA Phase:   ${PHASE_COLORS[skill.pdcaPhase] || ''}${skill.pdcaPhase}${RESET}`)
  console.log(`  Invocable:    ${skill.userInvocable ? `${GREEN}yes${RESET}` : `${GRAY}no (internal)${RESET}`}`)
  if (skill.argumentHint) console.log(`  Usage:        ${skill.invocationCommand} ${skill.argumentHint}`)
  if (skill.agent) console.log(`  Agent:        ${skill.agent}`)
  if (skill.nextSkill) console.log(`  Next skill:   ${skill.nextSkill}`)
  if (skill.triggers?.length) console.log(`  Triggers:     ${skill.triggers.join(', ')}`)
  if (skill.description) {
    const desc = skill.description.replace(/Triggers?:.*$/im, '').trim()
    if (desc) console.log(`\n  ${GRAY}${desc}${RESET}`)
  }
}

function cmdPlugins() {
  const skills = loadIndex()
  const pluginMap = {}
  for (const s of skills) {
    pluginMap[s.pluginName] = (pluginMap[s.pluginName] || 0) + 1
  }
  const sorted = Object.entries(pluginMap).sort((a, b) => {
    if (a[0] === 'standalone') return 1
    if (b[0] === 'standalone') return -1
    return b[1] - a[1]
  })

  console.log(`\n${BOLD}Installed plugins (${sorted.length}):${RESET}\n`)
  sorted.forEach(([name, count]) => {
    const bar = '█'.repeat(Math.min(Math.round(count / 5), 20))
    console.log(`  ${CYAN}${name.padEnd(30)}${RESET} ${GRAY}${bar}${RESET} ${count}`)
  })
  console.log(`\n  Total: ${skills.length} skills`)
}

function printHelp() {
  console.log(`
${BOLD}skill-manager${RESET} — Browse your Claude Code skills from the terminal

${BOLD}Commands:${RESET}
  ${CYAN}search <query>${RESET}                Fuzzy search skills by name, trigger, or description
  ${CYAN}list${RESET} [--plugin <p>] [--phase <ph>] [--invocable] [--compact]
                               List skills with optional filters
  ${CYAN}info <skill-name>${RESET}             Show full details for a skill
  ${CYAN}plugins${RESET}                       List all plugins with skill counts

${BOLD}Examples:${RESET}
  skill-manager search "deploy react"
  skill-manager list --plugin bkit --phase do
  skill-manager list --invocable --compact
  skill-manager info bkit:pdca

${BOLD}Dashboard:${RESET}
  npm run dev   →   http://localhost:9025
`)
}

const [,, cmd, ...rest] = process.argv

switch (cmd) {
  case 'search': cmdSearch(rest); break
  case 'list':   cmdList(rest);   break
  case 'info':   cmdInfo(rest);   break
  case 'plugins': cmdPlugins();   break
  case '--help': case '-h': case undefined: printHelp(); break
  default:
    // Treat unknown as a search query
    cmdSearch([cmd, ...rest])
}
