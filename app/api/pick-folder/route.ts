import { exec } from 'child_process'

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
            resolve(Response.json({ error: 'failed', detail: err.message + stderr }, { status: 500 }))
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

export async function GET() {
  return pickFolder()
}

export async function POST() {
  return pickFolder()
}
