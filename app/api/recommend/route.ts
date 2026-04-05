import { spawn, execSync } from 'child_process'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import Fuse from 'fuse.js'
import { SkillEntry } from '@/lib/types'

// Resolve claude path once at module init
let CLAUDE_PATH = 'claude'
try {
  CLAUDE_PATH = execSync('which claude', { env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') } }).toString().trim()
} catch { /* fall back to 'claude' */ }

function sanitizeGoal(input: string): string {
  return input
    .slice(0, 200)
    .replace(/[`$(){}|;&"'\\<>]/g, '')
    .trim()
}

// Concurrency guard — one claude spawn at a time
let inProgress = false

function send(controller: ReadableStreamDefaultController, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const sanitized = sanitizeGoal(body.goal || '')
  const projectContext: string = typeof body.projectContext === 'string'
    ? body.projectContext.slice(0, 400)
    : ''

  if (!sanitized) {
    return Response.json({ error: 'goal_empty' }, { status: 400 })
  }

  if (inProgress) {
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
  const prompt = `You are a Claude Code skill recommender.

User goal: "${sanitized}"${contextLine}

Available skills:
${JSON.stringify(compressed)}

Return ONLY a JSON array of the top 5 most relevant skills:
[{"name":"...","cmd":"...","plugin":"...","reason":"한 문장으로 이 목표에 맞는 이유 (한국어)"}]

No explanation, no markdown, just the JSON array.`

  inProgress = true

  const stream = new ReadableStream({
    start(controller) {
      // CI mock mode
      if (process.env.CLAUDE_MOCK === 'true') {
        send(controller, { done: true, recommendations: [
          { name: 'mock-skill', cmd: '/mock', plugin: 'test', reason: '테스트 모드 결과입니다.' }
        ]})
        controller.close()
        inProgress = false
        return
      }

      const child = spawn(CLAUDE_PATH, [
        '--print',
        '--verbose',
        '--output-format', 'stream-json',
        '--include-partial-messages',
        prompt,
      ], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') },
      })

      let lineBuf = ''
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
        child.kill()
      }, 120000)

      child.stdout.on('data', (chunk: Buffer) => {
        lineBuf += chunk.toString()
        const lines = lineBuf.split('\n')
        lineBuf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)

            // Stream text deltas to client in real time
            if (
              event.type === 'stream_event' &&
              event.event?.type === 'content_block_delta' &&
              event.event?.delta?.type === 'text_delta' &&
              event.event.delta.text
            ) {
              safeSend({ text: event.event.delta.text })
            }

            // Final result event — parse JSON from result field
            if (event.type === 'result' && event.subtype === 'success' && event.result && !resultSent) {
              resultSent = true
              try {
                const jsonMatch = event.result.match(/\[[\s\S]*?\]/)
                if (jsonMatch) {
                  const recommendations = JSON.parse(jsonMatch[0])
                  safeSend({ done: true, recommendations })
                } else {
                  safeSend({ error: 'parse' })
                }
              } catch {
                safeSend({ error: 'parse' })
              }
            }

            // Auth error
            if (event.type === 'result' && event.subtype === 'error_during_execution') {
              const msg = (event.result || '').toLowerCase()
              if (msg.includes('auth') || msg.includes('login') || msg.includes('credential')) {
                safeSend({ error: 'auth' })
              } else {
                safeSend({ error: 'failed' })
              }
              resultSent = true
            }
          } catch { /* non-JSON line, skip */ }
        }
      })

      child.stderr.on('data', (chunk: Buffer) => {
        const errText = chunk.toString().toLowerCase()
        if (errText.includes('auth') || errText.includes('login') || errText.includes('credential')) {
          safeSend({ error: 'auth' })
        }
      })

      child.on('close', (code: number | null) => {
        clearTimeout(killTimer)
        inProgress = false

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
          safeSend(code === 0 ? { error: 'parse' } : { error: 'failed' })
        }

        safeClose()
      })

      child.on('error', (err: Error) => {
        clearTimeout(killTimer)
        inProgress = false
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
