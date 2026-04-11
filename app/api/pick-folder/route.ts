import { exec } from 'child_process'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'

async function pickFolder(): Promise<Response> {
  return new Promise<Response>(resolve => {
    exec(
      `osascript -e 'tell application "Finder" to activate' -e 'set f to choose folder' -e 'return POSIX path of f'`,
      { timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (err.message + ' ' + stderr).toLowerCase()
          if (msg.includes('-128') || msg.includes('cancel') || msg.includes('user canceled')) {
            resolve(Response.json({ error: 'cancelled' }, { status: 400 }))
          } else {
            console.error('[pick-folder] error:', err.message, stderr)
            resolve(Response.json({ error: 'failed' }, { status: 500 }))
          }
          return
        }
        const path = stdout.trim().replace(/\/$/, '')
        if (!path) resolve(Response.json({ error: 'cancelled' }, { status: 400 }))
        else resolve(Response.json({ path }))
      }
    )
  })
}

export async function GET(req: Request) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  return pickFolder()
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  return pickFolder()
}
