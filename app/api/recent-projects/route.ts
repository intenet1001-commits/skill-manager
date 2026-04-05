import { readdirSync, statSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface ProjectEntry {
  name: string
  path: string
  techs: string[]
  modifiedAt: number
}

const PROJECT_INDICATORS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'composer.json']

function detectTechs(dir: string): string[] {
  const techs: string[] = []
  if (existsSync(join(dir, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) techs.push('Next.js')
      else if (deps['react']) techs.push('React')
      if (deps['typescript']) techs.push('TS')
      if (deps['electron']) techs.push('Electron')
      if (deps['vue']) techs.push('Vue')
      if (!techs.length) techs.push('Node')
    } catch { techs.push('Node') }
  }
  if (existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'requirements.txt'))) techs.push('Python')
  if (existsSync(join(dir, 'Cargo.toml'))) techs.push('Rust')
  if (existsSync(join(dir, 'go.mod'))) techs.push('Go')
  return techs
}

function isProject(dir: string): boolean {
  return PROJECT_INDICATORS.some(f => existsSync(join(dir, f)))
}

function scanDir(base: string, maxDepth = 1): ProjectEntry[] {
  if (!existsSync(base)) return []
  const entries: ProjectEntry[] = []
  try {
    const items = readdirSync(base, { withFileTypes: true })
    for (const item of items) {
      if (!item.isDirectory()) continue
      if (item.name.startsWith('.') || item.name === 'node_modules') continue
      const full = join(base, item.name)
      if (isProject(full)) {
        try {
          const stat = statSync(full)
          entries.push({
            name: item.name,
            path: full,
            techs: detectTechs(full),
            modifiedAt: stat.mtimeMs,
          })
        } catch { /* skip */ }
      } else if (maxDepth > 0) {
        // One level deeper (e.g. ~/Documents/GitHub/org/repo)
        entries.push(...scanDir(full, maxDepth - 1))
      }
    }
  } catch { /* permission denied etc */ }
  return entries
}

export async function GET() {
  const home = homedir()
  const searchRoots = [
    join(home, 'Documents', 'GitHub'),
    join(home, 'Documents', 'Projects'),
    join(home, 'Projects'),
    join(home, 'Developer'),
    join(home, 'Desktop'),
    join(home, 'Documents'),
  ]

  const all: ProjectEntry[] = []
  const seen = new Set<string>()

  for (const root of searchRoots) {
    for (const entry of scanDir(root)) {
      if (!seen.has(entry.path)) {
        seen.add(entry.path)
        all.push(entry)
      }
    }
  }

  // Sort by recently modified, limit to 30
  all.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return Response.json(all.slice(0, 30))
}
