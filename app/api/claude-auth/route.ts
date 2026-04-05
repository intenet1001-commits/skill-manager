import { exec, execSync } from 'child_process'
import { NextRequest } from 'next/server'

const ENV = { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') }

function getClaudePath(): string {
  try { return execSync('which claude', { env: ENV }).toString().trim() } catch { return 'claude' }
}

const CLAUDE = getClaudePath()

export async function POST(req: NextRequest) {
  const { action } = await req.json()

  if (action === 'logout') {
    return new Promise<Response>(resolve => {
      exec(`${CLAUDE} auth logout`, { timeout: 10000, env: ENV }, (err, stdout, stderr) => {
        if (err) {
          resolve(Response.json({ error: 'logout_failed', detail: stderr }, { status: 500 }))
        } else {
          resolve(Response.json({ success: true, message: '로그아웃 완료' }))
        }
      })
    })
  }

  if (action === 'login') {
    // Spawn login in background — opens browser automatically
    const child = exec(`${CLAUDE} auth login --claudeai`, { env: ENV })
    const pid = child.pid ?? 0

    // Wait briefly to see if it fails immediately
    return new Promise<Response>(resolve => {
      let errOutput = ''
      child.stderr?.on('data', (d: Buffer) => { errOutput += d.toString() })
      child.on('error', () => resolve(Response.json({ error: 'login_failed' }, { status: 500 })))

      setTimeout(() => {
        // If still running after 1s, it opened the browser — return success
        resolve(Response.json({ success: true, pid, message: '브라우저에서 로그인을 완료해주세요.' }))
      }, 1000)
    })
  }

  return Response.json({ error: 'unknown_action' }, { status: 400 })
}
