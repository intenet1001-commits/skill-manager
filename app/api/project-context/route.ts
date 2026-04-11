import { NextRequest } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { detectTechs } from '@/lib/project-utils'
import { sanitizePath } from '@/lib/sanitize'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'

interface ProjectContext {
  path: string
  name: string
  techs: string[]
  summary: string
  claudeMd: string | null
}

function readClaudeMd(projectPath: string): string | null {
  const claudePath = join(projectPath, 'CLAUDE.md')
  if (!existsSync(claudePath)) return null
  try {
    const content = readFileSync(claudePath, 'utf-8')
    if (content.length > 2000) {
      return content.slice(0, 2000) + '\n...(truncated)'
    }
    return content
  } catch { return null }
}

export async function GET(req: NextRequest) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const url = new URL(req.url)
  const projectPath = sanitizePath(url.searchParams.get('path'), homedir())

  if (!projectPath) return Response.json({ error: 'path_required' }, { status: 400 })
  if (!existsSync(projectPath)) return Response.json({ error: 'path_not_found' }, { status: 404 })

  const name = basename(projectPath)
  const { techs, deps } = detectTechs(projectPath)
  const claudeMd = readClaudeMd(projectPath)

  let summary = `프로젝트: ${name}`
  if (techs.length > 0) summary += ` | 기술: ${techs.join(', ')}`
  if (deps.length > 0) summary += ` | 주요 패키지: ${deps.join(', ')}`

  const context: ProjectContext = { path: projectPath, name, techs, summary, claudeMd }
  return Response.json(context)
}
