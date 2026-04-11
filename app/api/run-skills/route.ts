import { exec, spawn } from 'child_process'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { existsSync, writeFileSync, readdirSync } from 'fs'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'
import { sanitizeCmd as libSanitizeCmd, sanitizePath } from '@/lib/sanitize'

/**
 * Post-launch tmux setup:
 * 1. Label every pane (LEAD / Worker-N) with visible titles on pane borders
 * 2. Focus the LEAD pane so the cursor lands there when user opens the session
 * 3. Kick every pane with Enter to work around runtime-cli's lost-Enter race
 *
 * Safe to run even if Enter already registered — harmless blank line.
 * Runs detached so the API route returns immediately.
 */
function setupTmuxSessionDetached(teamName: string, workerCount: number): void {
  // Build worker label list: worker-1, worker-2, ...
  const workerLabels = Array.from({ length: workerCount }, (_, i) => `Worker-${i + 1}`)

  const script = `
    session="${teamName}"
    # Wait for the session to exist (tmux may take a moment)
    for i in 1 2 3 4 5 6 7 8 9 10; do
      tmux has-session -t "$session" 2>/dev/null && break
      sleep 0.5
    done
    tmux has-session -t "$session" 2>/dev/null || exit 0

    # Enable pane border titles at session level
    tmux set-option -t "$session" pane-border-status top 2>/dev/null
    tmux set-option -t "$session" pane-border-format ' #{pane_title} ' 2>/dev/null
    # Highlight the active pane border
    tmux set-option -t "$session" pane-active-border-style 'fg=colour39,bold' 2>/dev/null
    tmux set-option -t "$session" pane-border-style 'fg=colour240' 2>/dev/null

    # Wait for runtime-cli to create all panes
    sleep 4

    # Label panes: index 0 = LEAD, 1..N = workers
    # Use list-panes with index ordering
    worker_labels="${workerLabels.join('|')}"
    tmux list-panes -s -t "$session" -F '#{pane_index} #{pane_id}' 2>/dev/null | sort -n | while read idx pid; do
      if [ "$idx" = "0" ]; then
        tmux select-pane -t "$pid" -T '🧭 LEAD (talk here for follow-up tasks)' 2>/dev/null
      else
        worker_num=$idx
        label=$(echo "$worker_labels" | cut -d'|' -f"$worker_num")
        [ -z "$label" ] && label="Worker-$worker_num"
        tmux select-pane -t "$pid" -T "🤖 $label" 2>/dev/null
      fi
    done

    # Kick Enter across all panes (runtime-cli lost-Enter race)
    sleep 2
    for _ in 1 2 3; do
      tmux list-panes -s -t "$session" -F '#{pane_id}' 2>/dev/null | while read p; do
        tmux send-keys -t "$p" Enter 2>/dev/null
      done
      sleep 2
    done

    # Finally, focus the LEAD pane (index 0) so the user lands on it
    lead_pid=$(tmux list-panes -s -t "$session" -F '#{pane_index} #{pane_id}' 2>/dev/null | sort -n | head -1 | awk '{print $2}')
    [ -n "$lead_pid" ] && tmux select-pane -t "$lead_pid" 2>/dev/null
  `.trim()

  try {
    const child = spawn('sh', ['-c', script], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') },
    })
    child.unref()
  } catch (e) {
    console.warn('[run-skills] tmux setup failed to spawn:', e)
  }
}

/** Find the latest installed omc runtime-cli, avoiding hardcoded version. */
function findRuntimeCli(): string {
  const base = join(homedir(), '.claude/plugins/cache/omc/oh-my-claudecode')
  try {
    const versions = readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse()
    for (const ver of versions) {
      const candidate = join(base, ver, 'bridge/runtime-cli.cjs')
      if (existsSync(candidate)) return candidate
    }
  } catch { /* base dir missing */ }
  return join(base, '4.4.4/bridge/runtime-cli.cjs')
}

const RUNTIME_CLI = findRuntimeCli()

const sanitizeCmd = libSanitizeCmd

function esc(s: string): string {
  return s.replace(/'/g, "'\\''")
}

function escOsa(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')
}

function makeTeamName(goal: string): string {
  const base = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('-')
    || 'skill-run'
  const ts = Date.now().toString(36).slice(-4)
  const name = `${base}-${ts}`.slice(0, 50)
  // Ensure valid team name: lowercase alphanumeric + hyphens, no leading/trailing hyphen
  return name.replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') || `skill-run-${ts}`
}

/** Open iTerm2 (or Terminal fallback) with a shell command */
function openTerminal(shellLine: string): Promise<void> {
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

/** Launch agent teams via omc runtime-cli inside a new tmux session in iTerm */
async function runAgentTeams(
  cmds: string[],
  projectPath: string | undefined,
  goal: string,
  skipPerms: boolean,
  sources?: string[]
): Promise<{ ok: boolean; teamName?: string; error?: string }> {
  if (!existsSync(RUNTIME_CLI)) {
    return { ok: false, error: 'runtime-cli not found' }
  }

  const cwd = projectPath || homedir()
  const teamName = makeTeamName(goal || 'skill-run')
  const goalSuffix = goal ? ` Goal: ${goal}` : ''
  const hasLocalSource = Array.isArray(sources) && sources.includes('local')
  const addDirFlag = projectPath ? `--add-dir '${esc(projectPath)}'` : ''
  const localDirFlag = hasLocalSource ? `--add-dir '${esc(homedir() + '/cs_plugins')}'` : ''
  const skipFlag = skipPerms ? '--dangerously-skip-permissions' : ''

  // Build tasks — one per skill
  const tasks = cmds.map((cmd, i) => ({
    id: String(i + 1),
    subject: cmd,
    description: `Run the skill \`${cmd}\` using the Skill tool.${goalSuffix} Project: ${cwd.split('/').pop() || cwd}. Use the Skill tool to invoke the skill, then report what was done.`,
  }))

  const input = {
    teamName,
    agentTypes: cmds.map(() => 'claude'),
    tasks,
    cwd,
    workerCount: cmds.length,
    extraFlags: [skipFlag, addDirFlag, localDirFlag].filter(Boolean),
  }

  // Write config to temp file — avoids shell quoting issues
  const configPath = join(tmpdir(), `skill-team-${teamName}.json`)
  try {
    writeFileSync(configPath, JSON.stringify(input), 'utf-8')
  } catch (e) {
    return { ok: false, error: `config write failed: ${e}` }
  }

  // runtime-cli requires running inside tmux — launch via iTerm in a new tmux session
  // The session window shows the lead + worker panes managed by runtime-cli
  const runtimeCmd = `cd '${esc(cwd)}' && node '${esc(RUNTIME_CLI)}' < '${esc(configPath)}'`
  const tmuxCmd = `tmux new-session -s '${teamName}' "${escOsa(runtimeCmd)}"`
  await openTerminal(tmuxCmd)

  // Label panes (LEAD / Worker-N), focus LEAD, and kick Enter across all panes
  setupTmuxSessionDetached(teamName, cmds.length)

  return { ok: true, teamName }
}

/** Single skill: open terminal directly */
async function runSingleSkill(
  cmd: string,
  projectPath: string | undefined,
  skipPerms: boolean,
  sources?: string[]
): Promise<void> {
  const hasLocalSource = Array.isArray(sources) && sources.includes('local')
  const cdPart = projectPath ? `cd '${esc(projectPath)}' && ` : ''
  const addDir = projectPath ? `--add-dir '${esc(projectPath)}' ` : ''
  const localAddDir = hasLocalSource ? `--add-dir '${esc(homedir() + '/cs_plugins')}' ` : ''
  const claudeFlag = skipPerms ? '--dangerously-skip-permissions' : ''
  const claudePart = `claude ${claudeFlag} ${addDir}${localAddDir}'${esc(cmd)}'`.trim()
  await openTerminal(cdPart + claudePart)
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const { cmds, projectPath, skipPerms, goal, sources } = await req.json() as {
    cmds: string[]
    projectPath?: string
    skipPerms?: boolean
    goal?: string
    sources?: string[]
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

  if (safeCmds.length === 1) {
    // Single skill: direct terminal launch
    await runSingleSkill(safeCmds[0], safeProjectPath, skipPerms ?? false, sources)
    return Response.json({ ok: true, cmds: safeCmds, mode: 'single' })
  }

  // Multiple skills: try agent teams first, fall back to lead prompt
  const result = await runAgentTeams(safeCmds, safeProjectPath, goal || '', skipPerms ?? false, sources)

  if (result.ok) {
    return Response.json({ ok: true, cmds: safeCmds, mode: 'team', teamName: result.teamName })
  }

  // Fallback: lead prompt in terminal (original behavior)
  console.warn('[run-skills] agent teams unavailable, falling back to lead prompt:', result.error)
  const goalText = (goal || '목표 달성').slice(0, 100).replace(/'/g, "'\\''")
  const projectNote = safeProjectPath ? ` Project: ${safeProjectPath.split('/').pop()}.` : ''
  const skillLines = safeCmds.map((cmd, i) => `${i + 1}. ${cmd}`).join(', ')
  const leadPrompt = `You are an Agent Teams lead.${projectNote} Goal: ${goalText}.

You must launch all ${safeCmds.length} skills simultaneously as parallel agents. In your FIRST response, call the Agent tool exactly ${safeCmds.length} times in a single message (all concurrent):
${skillLines}

For each agent, set subagent_type to "general-purpose" and write a prompt that invokes the assigned skill using the Skill tool. After all agents complete, summarize the results.`

  const hasLocalSource = Array.isArray(sources) && sources.includes('local')
  const cdPart = safeProjectPath ? `cd '${esc(safeProjectPath)}' && ` : ''
  const addDir = safeProjectPath ? `--add-dir '${esc(safeProjectPath)}' ` : ''
  const localAddDir = hasLocalSource ? `--add-dir '${esc(homedir() + '/cs_plugins')}' ` : ''
  const claudeFlag = skipPerms ? '--dangerously-skip-permissions' : ''
  const claudePart = `claude ${claudeFlag} ${addDir}${localAddDir}'${esc(leadPrompt)}'`.trim()
  await openTerminal(cdPart + claudePart)

  return Response.json({ ok: true, cmds: safeCmds, mode: 'lead-fallback' })
}
