import { execSync } from 'child_process'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'
import { narrowEnv } from '@/lib/narrow-env'

interface StatusCache {
  installed: boolean
  authenticated: boolean
  email: string
  subscriptionType: string
  authMethod: string
  version: string
  ts: number
}

let cache: StatusCache | null = null
const CACHE_TTL = 30_000

function getClaudePath(): string {
  try { return execSync('which claude', { env: narrowEnv() }).toString().trim() } catch { return 'claude' }
}

const CLAUDE = getClaudePath()

export async function GET(req: Request) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache)
  }

  // 1. Check if installed
  let version = ''
  try {
    version = execSync(`${CLAUDE} --version`, { timeout: 5000, env: narrowEnv() }).toString().trim().split('\n')[0] || ''
  } catch {
    cache = { installed: false, authenticated: false, email: '', subscriptionType: '', authMethod: '', version: '', ts: Date.now() }
    return Response.json(cache)
  }

  // 2. Check auth status via `claude auth status`
  try {
    const raw = execSync(`${CLAUDE} auth status`, { timeout: 8000, env: narrowEnv() }).toString().trim()
    const data = JSON.parse(raw)
    cache = {
      installed: true,
      authenticated: data.loggedIn === true,
      email: data.email || '',
      subscriptionType: data.subscriptionType || '',
      authMethod: data.authMethod || '',
      version,
      ts: Date.now(),
    }
  } catch {
    // auth status failed — installed but not authenticated
    cache = { installed: true, authenticated: false, email: '', subscriptionType: '', authMethod: '', version, ts: Date.now() }
  }

  return Response.json(cache)
}
