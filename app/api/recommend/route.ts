import { spawn, execSync } from 'child_process'
import { NextRequest } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Fuse from 'fuse.js'
import { SkillEntry } from '@/lib/types'

// Resolve claude path once at module init
let CLAUDE_PATH = 'claude'
try {
  CLAUDE_PATH = execSync('which claude', { env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') } }).toString().trim()
} catch { /* fall back to 'claude' */ }

// Write empty MCP config once — used to skip MCP server startup overhead
const NO_MCP_CONFIG = join(tmpdir(), 'skill-manager-no-mcp.json')
if (!existsSync(NO_MCP_CONFIG)) {
  try { writeFileSync(NO_MCP_CONFIG, '{"mcpServers":{}}', 'utf-8') } catch { /* ignore */ }
}

// Write minimal settings (no hooks) to skip SessionStart hook overhead
const NO_HOOKS_SETTINGS = join(tmpdir(), 'skill-manager-no-hooks.json')
try { writeFileSync(NO_HOOKS_SETTINGS, '{"hooks":{}}', 'utf-8') } catch { /* ignore */ }

function sanitizeGoal(input: string): string {
  // claude is spawned with shell:false (route.ts:166), so the goal is passed as
  // an argv element — not interpolated into a shell. Backticks, $, <>, () are
  // common in markdown content (code fences, JSX, function calls) and were
  // being silently stripped, mangling dropped .md file content.
  // Strip only true control chars and null bytes.
  return input
    .slice(0, 5000)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
}

// Concurrency guard — up to 5 parallel spawns
let activeCount = 0
const MAX_CONCURRENT = 5

function send(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sanitized = sanitizeGoal(body.goal || '')
  const projectContext: string = typeof body.projectContext === 'string'
    ? body.projectContext.slice(0, 2500)
    : ''
  const projectPath: string | undefined = typeof body.projectPath === 'string' ? body.projectPath : undefined

  if (!sanitized) {
    return Response.json({ error: 'goal_empty' }, { status: 400 })
  }

  if (activeCount >= MAX_CONCURRENT) {
    return Response.json({ error: 'in_progress' }, { status: 429 })
  }

  // Load skills index
  let skills: SkillEntry[]
  try {
    skills = JSON.parse(readFileSync(join(process.cwd(), 'public', 'skills-index.json'), 'utf-8'))
  } catch {
    return Response.json({ error: 'index_missing' }, { status: 503 })
  }

  // Korean → English keyword translation for better Fuse.js matching
  const KO_EN: Record<string, string> = {
    '코드': 'code', '리뷰': 'review', '커밋': 'commit', '배포': 'deploy',
    '테스트': 'test', '빌드': 'build', '디버그': 'debug', '버그': 'bug',
    '리팩터': 'refactor', '문서': 'document', '보안': 'security',
    '풀리퀘': 'pull request', '깃': 'git', '분석': 'analyze',
    '자동화': 'automation', '설계': 'design', '아키텍처': 'architecture',
    '테스팅': 'testing', '검색': 'search', '인증': 'auth', '데이터': 'data',
    '브랜치': 'branch', '머지': 'merge', '성능': 'performance', '최적화': 'optimize',
    'PR': 'pull request', '스킬': 'skill', '에이전트': 'agent',
  }
  // Extract English keywords from input + translate Korean terms
  const englishTerms: string[] = (sanitized.match(/[a-zA-Z][a-zA-Z0-9-_]{2,}/g) || [])
  for (const [ko, en] of Object.entries(KO_EN)) {
    if (sanitized.includes(ko)) {
      // Multi-word translations: add each word
      en.split(' ').filter(w => w.length > 2).forEach(w => englishTerms.push(w))
    }
  }
  const searchTerms = [...new Set(englishTerms)].filter(t => t.length >= 3).slice(0, 6)

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

  activeCount++

  const stream = new ReadableStream({
    start(controller) {
      // CI mock mode
      if (process.env.CLAUDE_MOCK === 'true') {
        send(controller, { done: true, recommendations: [
          { name: 'mock-skill', cmd: '/mock', plugin: 'test', reason: '테스트 모드 결과입니다.' }
        ]})
        controller.close()
        activeCount--
        return
      }

      const spawnArgs = [
        '--print',
        '--output-format', 'json',
        '--no-session-persistence',
        '--model', 'claude-haiku-4-5-20251001',
        '--setting-sources', '',
        ...(existsSync(NO_MCP_CONFIG) ? ['--strict-mcp-config', '--mcp-config', NO_MCP_CONFIG] : []),
        '--',
        prompt,
      ]

      console.error('[recommend] spawn:', CLAUDE_PATH, spawnArgs.slice(0, 8).join(' '), '... NO_MCP_EXISTS:', existsSync(NO_MCP_CONFIG))
      const spawnStart = Date.now()
      const child = spawn(CLAUDE_PATH, spawnArgs, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') },
        cwd: tmpdir(),
      })

      let stdoutBuf = ''
      let killed = false
      let resultSent = false
      let streamClosed = false

      function safeSend(data: object) {
        if (!streamClosed) send(controller, data)
      }
      function safeClose() {
        if (!streamClosed) { streamClosed = true; controller.close() }
      }

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
        activeCount--

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
        activeCount--
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
