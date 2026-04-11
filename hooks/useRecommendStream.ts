'use client'

import { useState, useRef } from 'react'

export interface Recommendation {
  name: string
  cmd: string
  plugin: string
  reason: string
}

export interface ProjectResult {
  projectPath: string
  projectName: string
  recs: Recommendation[]
  fallback: boolean
  loading: boolean
  error: string | null
  streamText: string
}

const ERROR_MSGS: Record<string, string> = {
  not_installed: 'Claude Code를 찾을 수 없습니다. claude.ai/code에서 설치해주세요.',
  auth: '로그인이 필요합니다. 터미널에서 claude login을 실행해주세요.',
  in_progress: '동시 요청 한도 초과. 잠시 후 다시 시도해주세요.',
  parse: 'AI 응답 파싱에 실패했습니다. 다시 시도해주세요.',
  failed: 'Claude 실행에 실패했습니다. 다시 시도해주세요.',
  spawn: 'Claude 프로세스를 시작할 수 없습니다.',
  index_missing: 'npm run build-index를 먼저 실행해주세요.',
}

export function useRecommendStream() {
  const [projectResults, setProjectResults] = useState<ProjectResult[]>([])
  const cancelRefs = useRef<Array<(() => void) | null>>([])

  async function fetchForProject(
    target: { projectPath?: string; projectContext?: string; projectName: string },
    idx: number,
    goal: string,
  ) {
    const controller = new AbortController()
    cancelRefs.current[idx] = () => controller.abort()

    try {
      const resp = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          projectContext: target.projectContext,
          projectPath: target.projectPath,
        }),
        signal: controller.signal,
      })

      if (resp.status === 429) {
        setProjectResults(prev => prev.map((r, i) => i === idx
          ? { ...r, loading: false, error: ERROR_MSGS.in_progress }
          : r))
        return
      }

      if (!resp.body) throw new Error('No response body')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.text) {
            setProjectResults(prev => prev.map((r, i) => i === idx
              ? { ...r, streamText: r.streamText + data.text }
              : r))
          } else if (data.done && data.recommendations) {
            setProjectResults(prev => prev.map((r, i) => i === idx
              ? { ...r, loading: false, recs: data.recommendations, fallback: !!data.fallback, streamText: '' }
              : r))
          } else if (data.error) {
            setProjectResults(prev => prev.map((r, i) => i === idx
              ? { ...r, loading: false, error: ERROR_MSGS[data.error] ?? '오류가 발생했습니다.', streamText: '' }
              : r))
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setProjectResults(prev => prev.map((r, i) => i === idx
          ? { ...r, loading: false, error: '연결 오류. 서버가 실행 중인지 확인해주세요.' }
          : r))
      }
    } finally {
      cancelRefs.current[idx] = null
      setProjectResults(prev => prev.map((r, i) => i === idx ? { ...r, loading: false } : r))
    }
  }

  function cancelAll() {
    cancelRefs.current.forEach(c => c?.())
    cancelRefs.current = []
  }

  return { projectResults, setProjectResults, cancelRefs, fetchForProject, cancelAll }
}
