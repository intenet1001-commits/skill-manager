import { exec } from 'child_process'
import { writeFileSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export async function POST(req: Request) {
  const { cmds, projectPath } = await req.json() as { cmds: string[]; projectPath?: string }
  if (!Array.isArray(cmds) || cmds.length === 0) {
    return Response.json({ error: 'no commands' }, { status: 400 })
  }

  // Build a shell script that opens claude in the project dir with each command
  const cdLine = projectPath ? `cd '${projectPath.replace(/'/g, "'\\''")}'` : 'true'
  // Pass first cmd as the initial message; for multiple cmds, run sequentially
  const claudeLines = cmds.map(cmd => `claude "${cmd.replace(/"/g, '\\"')}"`).join('\n')

  const script = `#!/bin/bash\n${cdLine}\n${claudeLines}\n`
  const tmpFile = join(tmpdir(), `skill-run-${Date.now()}.sh`)
  writeFileSync(tmpFile, script, 'utf-8')
  chmodSync(tmpFile, 0o755)

  return new Promise<Response>(resolve => {
    // Try iTerm2 first (common among developers), fall back to Terminal
    const osa = `
tell application "System Events"
  set itermRunning to (name of processes) contains "iTerm2"
end tell

if itermRunning then
  tell application "iTerm"
    create window with default profile
    tell current session of current window
      write text "source '${tmpFile.replace(/'/g, "'\\''")}'"
    end tell
  end tell
else
  tell application "Terminal"
    do script "source '${tmpFile.replace(/'/g, "'\\''")}'"
    activate
  end tell
end if
`
    exec(`osascript << 'OSAEOF'\n${osa}\nOSAEOF`, { timeout: 10000 }, (err) => {
      if (err) {
        // Fallback: just open Terminal with the script
        exec(`open -a Terminal '${tmpFile}'`, (err2) => {
          if (err2) resolve(Response.json({ error: err2.message }, { status: 500 }))
          else resolve(Response.json({ ok: true, cmds }))
        })
      } else {
        resolve(Response.json({ ok: true, cmds }))
      }
    })
  })
}
