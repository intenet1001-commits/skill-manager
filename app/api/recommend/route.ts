import { spawn, execSync } from 'child_process'
import { NextRequest } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import Fuse from 'fuse.js'
import Anthropic from '@anthropic-ai/sdk'
import { SkillEntry } from '@/lib/types'
import { sanitizeGoal } from '@/lib/sanitize'
import { extractSearchTerms } from '@/lib/ko-en'
import { checkOrigin, ORIGIN_FORBIDDEN } from '@/lib/check-origin'
import { narrowEnv } from '@/lib/narrow-env'
import { ConcurrencyGuard } from '@/lib/concurrency-guard'

// Resolve claude path once at module init
let CLAUDE_PATH = 'claude'
try {
  CLAUDE_PATH = execSync('which claude', { env: narrowEnv() }).toString().trim()
} catch { /* fall back to 'claude' */ }

// Write empty MCP config once — used to skip MCP server startup overhead
const NO_MCP_CONFIG = join(tmpdir(), 'skill-manager-no-mcp.json')
if (!existsSync(NO_MCP_CONFIG)) {
  try { writeFileSync(NO_MCP_CONFIG, '{"mcpServers":{}}', 'utf-8') } catch { /* ignore */ }
}

// Write minimal settings (no hooks) to skip SessionStart hook overhead
const NO_HOOKS_SETTINGS = join(tmpdir(), 'skill-manager-no-hooks.json')
try { writeFileSync(NO_HOOKS_SETTINGS, '{"hooks":{}}', 'utf-8') } catch { /* ignore */ }

/**
 * Resolve an Anthropic API key for the SDK fast-path.
 * Priority: process env → ~/.claude/settings.json env field
 */
function resolveApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    const settings = JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf-8'))
    if (settings?.env?.ANTHROPIC_API_KEY) return settings.env.ANTHROPIC_API_KEY
  } catch { /* ignore */ }
  return null
}

const API_KEY = resolveApiKey()
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null

// Module-level skills cache — avoids re-reading 1149-skill JSON on every request
interface SkillsCache { skills: SkillEntry[]; ts: number }
let skillsCache: SkillsCache | null = null
const SKILLS_CACHE_TTL = 5 * 60_000 // 5 minutes

function loadSkills(): SkillEntry[] | null {
  if (skillsCache && Date.now() - skillsCache.ts < SKILLS_CACHE_TTL) return skillsCache.skills
  try {
    const skills = JSON.parse(readFileSync(join(process.cwd(), 'public', 'skills-index.json'), 'utf-8'))
    skillsCache = { skills, ts: Date.now() }
    return skills
  } catch { return null }
}

// Concurrency guard — up to 5 parallel spawns
const concurrency = new ConcurrencyGuard(5)

function send(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(req: NextRequest) {
  if (!checkOrigin(req)) return ORIGIN_FORBIDDEN
  const body = await req.json()
  const sanitized = sanitizeGoal(body.goal || '')
  const projectContext: string = typeof body.projectContext === 'string'
    ? body.projectContext.slice(0, 2500)
    : ''
  const projectPath: string | undefined = typeof body.projectPath === 'string' ? body.projectPath : undefined

  if (!sanitized) {
    return Response.json({ error: 'goal_empty' }, { status: 400 })
  }

  if (concurrency.isFull) {
    return Response.json({ error: 'in_progress' }, { status: 429 })
  }

  // Load skills index (cached)
  const skills = loadSkills()
  if (!skills) return Response.json({ error: 'index_missing' }, { status: 503 })

  const searchTerms = extractSearchTerms(sanitized)

  // Stage 1: Fuse.js pre-filter — userInvocable only → top 12
  const invocable = skills.filter(s => s.userInvocable)
  let candidates: SkillEntry[]
  try {
    const fuse = new Fuse(invocable, {
      keys: ['name', 'description', 'triggers'],
      threshold: 0.4,
      includeScore: true,
    })
    // Search each term separately and merge by score
    const seen = new Set<string>()
    const merged: Array<{ item: SkillEntry; score: number }> = []
    const queries = searchTerms.length > 0 ? searchTerms : [sanitized]
    for (const term of queries) {
      const r = fuse.search(term)
      for (const hit of r) {
        if (!seen.has(hit.item.name)) {
          seen.add(hit.item.name)
          merged.push({ item: hit.item, score: hit.score ?? 1 })
        }
      }
    }
    merged.sort((a, b) => a.score - b.score)
    candidates = merged.length > 0
      ? merged.slice(0, 12).map(r => r.item)
      : invocable.filter(s => ['bkit', 'oh-my-claudecode', 'gstack'].includes(s.pluginName)).slice(0, 12)
  } catch {
    candidates = invocable.slice(0, 12)
  }

  // Compress for prompt (~40 chars per description)
  const compressed = candidates.map(s => ({
    name: s.name,
    cmd: s.invocationCommand,
    desc: s.description.slice(0, 40),
    plugin: s.pluginName,
  }))

  const contextLine = projectContext ? `\nProject context: ${projectContext}` : ''
  const prompt = `I'm building a skill recommendation feature for a Claude Code skill manager dashboard. Given a user's goal, I need to pick the top 5 most relevant skills from the available list.

User's goal: "${sanitized}"${contextLine}

Available skills (JSON):
${JSON.stringify(compressed)}

Please respond with a JSON array of the 5 best matching skills. Each item should have: name, cmd, plugin, and a reason field (one sentence in Korean explaining why this skill fits the goal).

Example format:
[{"name":"git-master","cmd":"/git-master","plugin":"oh-my-claudecode","reason":"커밋 메시지 스타일을 자동으로 감지하고 원자적 커밋을 생성합니다."}]

Respond with the JSON array only, no additional text.`

  concurrency.acquire()

  const stream = new ReadableStream({
    start(controller) {
      // CI mock mode
      if (process.env.CLAUDE_MOCK === 'true') {
        send(controller, { done: true, recommendations: [
          { name: 'mock-skill', cmd: '/mock', plugin: 'test', reason: '테스트 모드 결과입니다.' }
        ]})
        controller.close()
        concurrency.release()
        return
      }

      let resultSent = false
      let streamClosed = false

      function safeSend(data: object) {
        if (!streamClosed) send(controller, data)
      }
      function safeClose() {
        if (!streamClosed) { streamClosed = true; controller.close() }
      }

      // ── SDK fast-path (when ANTHROPIC_API_KEY is available) ──────────────
      if (anthropic) {
        const start = Date.now()
        console.error('[recommend] using SDK fast-path')
        ;(async () => {
          try {
            let text = ''
            const stream = anthropic.messages.stream({
              model: 'claude-sonnet-4-6',
              max_tokens: 1024,
              messages: [{ role: 'user', content: prompt }],
            })
            for await (const chunk of stream) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                text += chunk.delta.text
              }
            }
            console.error('[recommend] SDK done in', Date.now() - start, 'ms')
            const jsonMatch = text.match(/\[[\s\S]*?\]/)
            if (jsonMatch) {
              const recommendations = JSON.parse(jsonMatch[0])
              safeSend({ done: true, recommendations })
            } else {
              safeSend({ error: 'parse' })
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[recommend] SDK error:', msg)
            if (msg.includes('auth') || msg.includes('api_key') || msg.includes('401')) {
              safeSend({ error: 'auth' })
            } else {
              safeSend({ error: 'failed' })
            }
          } finally {
            concurrency.release()
            safeClose()
          }
        })()
        return
      }

      // ── CLI spawn fallback ────────────────────────────────────────────────
      const spawnArgs = [
        '--print',
        '--output-format', 'json',
        '--no-session-persistence',
        '--model', 'claude-sonnet-4-6',
        '--setting-sources', '',
        ...(existsSync(NO_MCP_CONFIG) ? ['--strict-mcp-config', '--mcp-config', NO_MCP_CONFIG] : []),
        '--',
        prompt,
      ]

      console.error('[recommend] spawn:', CLAUDE_PATH, spawnArgs.slice(0, 8).join(' '))
      const spawnStart = Date.now()
      const child = spawn(CLAUDE_PATH, spawnArgs, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: narrowEnv(),
        cwd: tmpdir(),
      })

      let stdoutBuf = ''
      let killed = false

      const killTimer = setTimeout(() => {
        killed = true
        child.kill('SIGKILL')
      }, 35000)

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString()
      })

      child.stderr.on('data', (chunk: Buffer) => {
        const errText = chunk.toString().toLowerCase()
        if (errText.includes('auth') || errText.includes('login') || errText.includes('credential')) {
          if (!resultSent) { resultSent = true; safeSend({ error: 'auth' }) }
        }
      })

      child.on('close', (code: number | null) => {
        console.error('[recommend] close code:', code, 'after', Date.now() - spawnStart, 'ms, killed:', killed)
        clearTimeout(killTimer)
        concurrency.release()

        if (killed) {
          const fallback = candidates.slice(0, 5).map(s => ({
            name: s.name,
            cmd: s.invocationCommand,
            plugin: s.pluginName,
            reason: 'AI 응답 시간 초과 — 키워드 검색 결과입니다.',
          }))
          safeSend({ done: true, recommendations: fallback, fallback: true })
          safeClose()
          return
        }

        if (!resultSent) {
          try {
            const parsed = JSON.parse(stdoutBuf.trim())
            const resultText = parsed.result || ''
            const jsonMatch = resultText.match(/\[[\s\S]*?\]/)
            if (jsonMatch) {
              const recommendations = JSON.parse(jsonMatch[0])
              resultSent = true
              safeSend({ done: true, recommendations })
            } else {
              safeSend(code === 0 ? { error: 'parse' } : { error: 'failed' })
            }
          } catch {
            safeSend(code === 0 ? { error: 'parse' } : { error: 'failed' })
          }
        }

        safeClose()
      })

      child.on('error', (err: Error) => {
        clearTimeout(killTimer)
        concurrency.release()
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          safeSend({ error: 'not_installed' })
        } else {
          safeSend({ error: 'spawn' })
        }
        safeClose()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
