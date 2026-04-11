import { execFile } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'

interface SkillKey {
  name: string
  pluginName: string
}

function readIndex(path: string): SkillKey[] {
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    if (!Array.isArray(data)) return []
    return data.map((s: { name: string; pluginName: string }) => ({
      name: s.name,
      pluginName: s.pluginName,
    }))
  } catch {
    return []
  }
}

function keyOf(s: SkillKey): string {
  return `${s.pluginName}::${s.name}`
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const indexPath = join(process.cwd(), 'public', 'skills-index.json')

  // Snapshot BEFORE rebuild
  const before = readIndex(indexPath)
  const beforeSet = new Set(before.map(keyOf))

  return new Promise<Response>(resolve => {
    execFile(
      'node',
      [join(process.cwd(), 'scripts/build-index.mjs')],
      { timeout: 30_000 },
      (err) => {
        if (err) {
          resolve(Response.json({ error: err.message }, { status: 500 }))
          return
        }

        // Snapshot AFTER rebuild and compute diff
        const after = readIndex(indexPath)
        const afterSet = new Set(after.map(keyOf))

        const added = after
          .filter(s => !beforeSet.has(keyOf(s)))
          .map(s => `${s.pluginName}/${s.name}`)
          .sort()

        const removed = before
          .filter(s => !afterSet.has(keyOf(s)))
          .map(s => `${s.pluginName}/${s.name}`)
          .sort()

        resolve(Response.json({
          ok: true,
          before: before.length,
          after: after.length,
          added,
          removed,
          unchanged: added.length === 0 && removed.length === 0,
        }))
      }
    )
  })
}
