/**
 * sanitizeGoal — strip control chars only.
 *
 * claude is spawned with shell:false (recommend/route.ts), so the goal is passed as
 * an argv element — not interpolated into a shell. Backticks, $, <>, () are
 * common in markdown content (code fences, JSX, function calls) and must NOT
 * be stripped. Only true control chars and null bytes are removed.
 */
export function sanitizeGoal(input: string): string {
  return input
    .slice(0, 5000)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
}

/**
 * sanitizeCmd — strict sanitize for shell command strings passed via osascript.
 * These ARE inserted into an AppleScript `do script` string literal, so shell
 * metacharacters must be removed.
 */
export function sanitizeCmd(input: string): string {
  return input.slice(0, 400).replace(/[`$(){}|;&\\<>]/g, '').trim()
}

/**
 * sanitizePath — validate that a user-supplied path is rooted at homeDir.
 * Returns null if the input is invalid or traverses outside home.
 * Used as a guard before any filesystem read of user-supplied paths (P0 security fix).
 */
export function sanitizePath(input: unknown, homeDir: string): string | null {
  if (typeof input !== 'string') return null
  const p = input.trim()
  if (!p) return null
  if (!p.startsWith(homeDir + '/') && p !== homeDir) return null
  if (p.includes('..')) return null
  return p
}
