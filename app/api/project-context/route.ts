import { NextRequest } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join, basename } from 'path'

interface ProjectContext {
  path: string
  name: string
  techs: string[]
  summary: string
  claudeMd: string | null
}

function detectTechs(projectPath: string): { techs: string[]; deps: string[] } {
  const techs: string[] = []
  const deps: string[] = []

  // package.json
  const pkgPath = join(projectPath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

      if (allDeps['next']) techs.push('Next.js')
      else if (allDeps['react']) techs.push('React')
      if (allDeps['vue']) techs.push('Vue')
      if (allDeps['svelte']) techs.push('@sveltejs/kit' in allDeps ? 'SvelteKit' : 'Svelte')
      if (allDeps['typescript'] || pkg.devDependencies?.['typescript']) techs.push('TypeScript')
      if (allDeps['tailwindcss']) techs.push('Tailwind CSS')
      if (allDeps['electron']) techs.push('Electron')
      if (allDeps['express']) techs.push('Express')
      if (allDeps['fastify']) techs.push('Fastify')
      if (allDeps['prisma'] || allDeps['@prisma/client']) techs.push('Prisma')
      if (allDeps['drizzle-orm']) techs.push('Drizzle')
      if (allDeps['@supabase/supabase-js']) techs.push('Supabase')
      if (allDeps['playwright'] || allDeps['@playwright/test']) techs.push('Playwright')
      if (allDeps['jest'] || allDeps['vitest']) techs.push(allDeps['vitest'] ? 'Vitest' : 'Jest')
      if (allDeps['graphql'] || allDeps['@apollo/client']) techs.push('GraphQL')
      if (pkg.scripts?.['tauri:dev'] || allDeps['@tauri-apps/api']) techs.push('Tauri')

      // Top 5 non-framework deps as context
      const knownFrameworks = new Set(['next', 'react', 'react-dom', 'typescript', 'tailwindcss', 'vue', 'electron'])
      const interesting = Object.keys(allDeps).filter(d => !knownFrameworks.has(d)).slice(0, 5)
      deps.push(...interesting)
    } catch { /* ignore parse errors */ }
  }

  // pyproject.toml / requirements.txt
  if (existsSync(join(projectPath, 'pyproject.toml'))) {
    techs.push('Python')
    const content = readFileSync(join(projectPath, 'pyproject.toml'), 'utf-8')
    if (content.includes('fastapi')) techs.push('FastAPI')
    if (content.includes('django')) techs.push('Django')
    if (content.includes('flask')) techs.push('Flask')
    if (content.includes('playwright')) techs.push('Playwright')
    if (content.includes('mcp') || content.includes('fastmcp')) techs.push('MCP')
  } else if (existsSync(join(projectPath, 'requirements.txt'))) {
    techs.push('Python')
  }

  // Rust
  if (existsSync(join(projectPath, 'Cargo.toml'))) techs.push('Rust')

  // Go
  if (existsSync(join(projectPath, 'go.mod'))) techs.push('Go')

  return { techs: [...new Set(techs)], deps }
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
  const url = new URL(req.url)
  const projectPath = url.searchParams.get('path')?.trim()

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
