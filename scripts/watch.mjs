#!/usr/bin/env node
/**
 * Auto-watches ~/.claude/plugins/ and ~/.claude/skills/ for changes.
 * Rebuilds public/skills-index.json with a 2s debounce when SKILL.md
 * or plugin manifest files change.
 *
 * Usage:  npm run watch
 */

import { watch, watchFile, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const HOME = homedir()
const PLUGINS_DIR = join(HOME, '.claude', 'plugins')
const SKILLS_DIR = join(HOME, '.claude', 'skills')
const SETTINGS_FILE = join(HOME, '.claude', 'settings.json')
const BUILD_SCRIPT = fileURLToPath(new URL('./build-index.mjs', import.meta.url))
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))

const WATCH_EXTENSIONS = ['.md', '.json']

let debounceTimer = null
let rebuilding = false
let pendingRebuild = false

function rebuild() {
  if (rebuilding) {
    pendingRebuild = true
    return
  }
  rebuilding = true
  const start = Date.now()
  process.stdout.write('[watch] rebuilding index… ')

  const child = spawn(process.execPath, [BUILD_SCRIPT], {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: PROJECT_ROOT,
  })

  child.on('close', (code) => {
    rebuilding = false
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    if (code === 0) {
      console.log(`done in ${elapsed}s at ${new Date().toLocaleTimeString()}`)
    } else {
      console.error(`failed (exit ${code}) after ${elapsed}s`)
    }
    if (pendingRebuild) {
      pendingRebuild = false
      scheduleRebuild()
    }
  })

  child.on('error', (err) => {
    rebuilding = false
    console.error('[watch] spawn error:', err.message)
  })
}

function scheduleRebuild(reason) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (reason) console.log('[watch] change:', reason)
    rebuild()
  }, 2000)
}

function watchDir(dir, label) {
  if (!existsSync(dir)) {
    console.log(`[watch] ${label} not found, skipping`)
    return
  }
  try {
    watch(dir, { recursive: true }, (event, filename) => {
      if (!filename) return
      const ext = '.' + filename.split('.').pop()
      if (!WATCH_EXTENSIONS.includes(ext)) return
      scheduleRebuild(`${event} ${label}/${filename}`)
    })
    console.log(`[watch] watching ${dir}`)
  } catch (err) {
    console.error(`[watch] cannot watch ${dir}:`, err.message)
  }
}

watchDir(PLUGINS_DIR, '~/.claude/plugins')
watchDir(SKILLS_DIR, '~/.claude/skills')

// settings.json enabledPlugins changes (polling — more reliable for single files)
if (existsSync(SETTINGS_FILE)) {
  watchFile(SETTINGS_FILE, { interval: 3000 }, () => {
    scheduleRebuild('settings.json changed')
  })
  console.log(`[watch] polling ${SETTINGS_FILE}`)
}

console.log('[watch] ready — press Ctrl+C to stop')
