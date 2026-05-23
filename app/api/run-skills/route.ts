import { exec, spawn, execFile } from 'child_process'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { sanitizeCmd as libSanitizeCmd, sanitizePath } from '@/lib/sanitize'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'

export type TerminalType = 'iterm' | 'terminal' | 'tmux' | 'cmux' | 'bg'

const ENVPATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '')

function resolveCmuxCli(): string | null {
  const h = homedir()
  const candidates = [
    '/Applications/cmux.app/Contents/Resources/bin/cmux',
    `${h}/Applications/cmux.app/Contents/Resources/bin/cmux`,
    '/opt/homebrew/bin/cmux',
    '/usr/local/bin/cmux',
  ]
  return candidates.find(p => existsSync(p)) ?? null
}

const sanitizeCmd = libSanitizeCmd

function esc(s: string): string {
  return s.replace(/'/g, "'\\''")
}

function escOsa(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')
}

/** Open in iTerm2, fall back to Terminal.app */
async function openTerminalIterm(shellLine: string): Promise<void> {
  const safeLine = escOsa(shellLine)
  const osa = `
try
  tell application "System Events"
    set itermRunning to (exists process "iTerm2") or (exists process "iTerm")
  end tell
  if itermRunning then
    tell application "iTerm"
      activate
      set newWin to (create window with default profile)
      delay 0.5
      tell current session of newWin
        write text "${safeLine}"
      end tell
    end tell
  else
    tell application "Terminal"
      do script "${safeLine}"
      activate
    end tell
  end if
on error
  tell application "Terminal"
    do script "${safeLine}"
    activate
  end tell
end try
`
  return new Promise(resolve => {
    exec(`osascript << 'OSAEOF'\n${osa}\nOSAEOF`, { timeout: 10000 }, () => resolve())
  })
}

async function openTerminalByType(shellLine: string, type: TerminalType, cwd?: string): Promise<void> {
  switch (type) {
    case 'terminal': {
      const safeLine = escOsa(shellLine)
      const osa = `tell application "Terminal"\n  do script "${safeLine}"\n  activate\nend tell`
      return new Promise(resolve => {
        exec(`osascript << 'OSAEOF'\n${osa}\nOSAEOF`, { timeout: 10000 }, () => resolve())
      })
    }
    case 'tmux': {
      const ts = Date.now().toString(36).slice(-4)
      const sessName = `skill-run-${ts}`
      const inner = esc(shellLine)
      const tmuxLine = `tmux new-session -d -s '${sessName}' sh -c '${inner}' 2>/dev/null; tmux attach-session -t '${sessName}'`
      return openTerminalIterm(tmuxLine)
    }
    case 'cmux': {
      const cli = resolveCmuxCli()
      if (!cli) {
        console.warn('[run-skills] cmux not found, falling back to iterm')
        return openTerminalIterm(shellLine)
      }
      return new Promise<void>(resolve => {
        const args = ['new-workspace', '--command', shellLine, ...(cwd ? ['--cwd', cwd] : [])]
        execFile(cli, args, { env: { ...process.env, PATH: ENVPATH } }, () => resolve())
      })
    }
    // 'bg' is handled before buildling shellLine in runSingleSkill / runTeamWithCsCeoLead
    // so it should never reach here; fall through to iterm as safety net
    case 'iterm':
    default:
      return openTerminalIterm(shellLine)
  }
}

/** Single skill: open in selected terminal */
async function runSingleSkill(
  cmd: string,
  projectPath: string | undefined,
  skipPerms: boolean,
  sources?: string[],
  terminalType: TerminalType = 'cmux'
): Promise<void> {
  const hasLocalSource = Array.isArray(sources) && sources.includes('local')
  const cwd = projectPath || homedir()

  if (terminalType === 'bg') {
    // claude --bg '<task>' spawns a background agent and exits immediately — no terminal window
    const args = [
      ...(skipPerms ? ['--dangerously-skip-permissions'] : []),
      '--bg', cmd,
    ]
    return new Promise<void>(resolve => {
      execFile('claude', args, { cwd, env: { ...process.env, PATH: ENVPATH } }, () => resolve())
    })
  }

  const cdPart = projectPath ? `cd '${esc(projectPath)}' && ` : ''
  const addDir = projectPath ? `--add-dir '${esc(projectPath)}' ` : ''
  const localAddDir = hasLocalSource ? `--add-dir '${esc(homedir() + '/cs_plugins')}' ` : ''
  const claudeFlag = skipPerms ? '--dangerously-skip-permissions ' : ''
  const shellLine = `${cdPart}claude ${claudeFlag}${addDir}${localAddDir}'${esc(cmd)}'`.trim()
  await openTerminalByType(shellLine, terminalType, projectPath)
}

/**
 * Team run: /cs-partnership:cs-ceo leads the session.
 * cs-ceo receives goal + skill list and dispatches workers via its built-in
 * Agent orchestration. No runtime-cli or tmux pane management needed.
 */
async function runTeamWithCsCeoLead(
  cmds: string[],
  projectPath: string | undefined,
  goal: string,
  terminalType: TerminalType,
  sources?: string[]
): Promise<{ ok: boolean }> {
  const cwd = projectPath || homedir()
  const hasLocalSource = Array.isArray(sources) && sources.includes('local')
  const addDir = projectPath ? `--add-dir '${esc(projectPath)}' ` : ''
  const localAddDir = hasLocalSource ? `--add-dir '${esc(homedir() + '/cs_plugins')}' ` : ''

  const skillList = cmds.map((c, i) => `${i + 1}. ${c}`).join('\n')
  const goalText = (goal || '각 스킬 최적 실행').slice(0, 300)
  const prompt = `목표: ${goalText}\n\n아래 스킬들을 팀으로 병렬 실행해줘 (각 스킬을 Agent로 dispatch):\n${skillList}\n\n/cs-partnership:cs-ceo`

  if (terminalType === 'bg') {
    const args = [
      '--dangerously-skip-permissions',
      ...(projectPath ? ['--add-dir', projectPath] : []),
      ...(hasLocalSource ? ['--add-dir', homedir() + '/cs_plugins'] : []),
      '--bg', prompt,
    ]
    return new Promise<{ ok: boolean }>(resolve => {
      execFile('claude', args, { cwd, env: { ...process.env, PATH: ENVPATH } }, () => resolve({ ok: true }))
    })
  }

  const shellLine = `cd '${esc(cwd)}' && claude --dangerously-skip-permissions ${addDir}${localAddDir}'${esc(prompt)}'`
  await openTerminalByType(shellLine, terminalType, cwd)
  return { ok: true }
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN

  const { cmds, projectPath, skipPerms, goal, sources, terminalType } = await req.json() as {
    cmds: string[]
    projectPath?: string
    skipPerms?: boolean
    goal?: string
    sources?: string[]
    terminalType?: TerminalType
  }

  const safeProjectPath = projectPath
    ? (sanitizePath(projectPath, homedir()) ?? undefined)
    : undefined
  if (projectPath && safeProjectPath === undefined) {
    return Response.json({ error: 'invalid_path' }, { status: 400 })
  }

  if (!Array.isArray(cmds) || cmds.length === 0) {
    return Response.json({ error: 'no commands' }, { status: 400 })
  }

  const safeCmds = cmds.map(sanitizeCmd).filter(Boolean)
  if (safeCmds.length === 0) return Response.json({ error: 'no valid commands' }, { status: 400 })

  const validTypes: TerminalType[] = ['iterm', 'terminal', 'tmux', 'cmux', 'bg']
  const type: TerminalType = terminalType && validTypes.includes(terminalType) ? terminalType : 'iterm'

  if (safeCmds.length === 1) {
    await runSingleSkill(safeCmds[0], safeProjectPath, skipPerms ?? false, sources, type)
    return Response.json({ ok: true, cmds: safeCmds, mode: 'single' })
  }

  await runTeamWithCsCeoLead(safeCmds, safeProjectPath, goal || '', type, sources)
  return Response.json({ ok: true, cmds: safeCmds, mode: 'team' })
}
