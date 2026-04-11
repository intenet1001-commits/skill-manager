/**
 * narrowEnv — return a minimal env for subprocesses.
 *
 * The current code spreads the entire process.env into every spawned claude
 * subprocess, which forwards ANTHROPIC_API_KEY, AWS_SECRET_ACCESS_KEY,
 * GITHUB_TOKEN, and any other secret in the shell environment.
 *
 * This function returns only the variables the subprocess actually needs.
 */
const ALLOWED_KEYS = ['HOME', 'TMPDIR', 'LANG', 'CLAUDE_MOCK'] as const

export function narrowEnv(extraPath = ''): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {}
  for (const key of ALLOWED_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  // Always provide a working PATH with Homebrew and system bin dirs
  const parts = [extraPath, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
  if (process.env.PATH) parts.push(process.env.PATH)
  env.PATH = parts.filter(Boolean).join(':')
  return env as NodeJS.ProcessEnv
}
