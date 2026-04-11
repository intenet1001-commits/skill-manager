import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { detectTechs, isProject } from '@/lib/project-utils'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'

interface ProjectEntry {
  name: string
  path: string
  techs: string[]
  modifiedAt: number
}

interface RecentCache { results: ProjectEntry[]; ts: number }
let recentCache: RecentCache | null = null
const RECENT_CACHE_TTL = 60_000 // 60 seconds

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
            techs: detectTechs(full).techs,
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

export async function GET(req: Request) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  if (recentCache && Date.now() - recentCache.ts < RECENT_CACHE_TTL) {
    return Response.json(recentCache.results)
  }
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
  const results = all.slice(0, 30)
  recentCache = { results, ts: Date.now() }
  return Response.json(results)
}
