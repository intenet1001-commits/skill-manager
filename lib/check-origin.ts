/**
 * CSRF origin guard.
 *
 * Allows same-origin requests (no Origin header) and requests where the
 * Origin matches the Host. Blocks cross-origin fetches from other tabs/sites.
 *
 * This is the primary CSRF defense for all API routes on localhost:9025.
 * Without it, any malicious webpage open in the browser can POST to the API
 * and trigger arbitrary code execution (e.g. spawning claude via run-skills).
 */
export function checkOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  // No Origin header = same-origin same-tab (browser omits it for same-origin)
  if (origin === null) return true
  if (origin === '') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export const ORIGIN_FORBIDDEN = Response.json({ error: 'forbidden' }, { status: 403 })
