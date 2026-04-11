import { execFile, execSync } from 'child_process'
import { NextRequest } from 'next/server'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'
import { narrowEnv } from '@/lib/narrow-env'

function getClaudePath(): string {
  try { return execSync('which claude', { env: narrowEnv() }).toString().trim() } catch { return 'claude' }
}

const CLAUDE = getClaudePath()

export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const { action } = await req.json()

  if (action === 'logout') {
    return new Promise<Response>(resolve => {
      execFile(CLAUDE, ['auth', 'logout'], { timeout: 10000, env: narrowEnv() }, (err, _stdout, stderr) => {
        if (err) {
          resolve(Response.json({ error: 'logout_failed' }, { status: 500 }))
          console.error('[claude-auth] logout error:', stderr)
        } else {
          resolve(Response.json({ success: true, message: '로그아웃 완료' }))
        }
      })
    })
  }

  if (action === 'login') {
    const child = execFile(CLAUDE, ['auth', 'login', '--claudeai'], { env: narrowEnv() })
    const pid = child.pid ?? 0

    return new Promise<Response>(resolve => {
      child.on('error', () => resolve(Response.json({ error: 'login_failed' }, { status: 500 })))
      setTimeout(() => {
        resolve(Response.json({ success: true, pid, message: '브라우저에서 로그인을 완료해주세요.' }))
      }, 1000)
    })
  }

  return Response.json({ error: 'unknown_action' }, { status: 400 })
}
