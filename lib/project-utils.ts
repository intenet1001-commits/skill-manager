import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export const PROJECT_INDICATORS = [
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'composer.json',
]

export function isProject(dir: string): boolean {
  return PROJECT_INDICATORS.some(f => existsSync(join(dir, f)))
}

/**
 * Canonical tech stack detection.
 * Merges the full version (project-context/route.ts — 14 stacks) with the
 * simplified version (recent-projects/route.ts — 6 stacks) into one superset.
 */
export function detectTechs(projectPath: string): { techs: string[]; deps: string[] } {
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

      if (!techs.length) techs.push('Node')

      // Top 5 non-framework deps as context
      const knownFrameworks = new Set(['next', 'react', 'react-dom', 'typescript', 'tailwindcss', 'vue', 'electron'])
      const interesting = Object.keys(allDeps).filter(d => !knownFrameworks.has(d)).slice(0, 5)
      deps.push(...interesting)
    } catch { techs.push('Node') }
  }

  // pyproject.toml / requirements.txt
  if (existsSync(join(projectPath, 'pyproject.toml'))) {
    techs.push('Python')
    try {
      const content = readFileSync(join(projectPath, 'pyproject.toml'), 'utf-8')
      if (content.includes('fastapi')) techs.push('FastAPI')
      if (content.includes('django')) techs.push('Django')
      if (content.includes('flask')) techs.push('Flask')
      if (content.includes('playwright')) techs.push('Playwright')
      if (content.includes('mcp') || content.includes('fastmcp')) techs.push('MCP')
    } catch { /* ignore */ }
  } else if (existsSync(join(projectPath, 'requirements.txt'))) {
    techs.push('Python')
  }

  // Rust
  if (existsSync(join(projectPath, 'Cargo.toml'))) techs.push('Rust')

  // Go
  if (existsSync(join(projectPath, 'go.mod'))) techs.push('Go')

  return { techs: [...new Set(techs)], deps }
}
