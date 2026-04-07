'use client'

import { useState, useEffect, useRef } from 'react'

interface Recommendation {
  name: string
  cmd: string
  plugin: string
  reason: string
}

interface ProjectContext {
  path: string
  name: string
  techs: string[]
  summary: string
  claudeMd: string | null
}

interface RecentProject {
  name: string
  path: string
  techs: string[]
  modifiedAt: number
}

interface ProjectResult {
  projectPath: string  // "default" if no project
  projectName: string
  recs: Recommendation[]
  fallback: boolean
  loading: boolean
  error: string | null
  streamText: string
}

const HISTORY_KEY = 'skill-manager-ai-history'
const PROJECTS_KEY = 'sm-projects'
const MAX_HISTORY = 5

const TEMPLATES = [
  '코드 리뷰를 해주세요',
  '테스트를 작성해주세요',
  '배포 준비를 해주세요',
  '버그를 찾아주세요',
  '리팩터링이 필요합니다',
  '문서를 작성해주세요',
]

function sanitizeGoalSuffix(text: string): string {
  // Strip only control chars — markdown chars are safe (server uses shell:false).
  // eslint-disable-next-line no-control-regex
  return text.slice(0, 5000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim()
}

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

function saveHistory(goal: string, prev: string[]): string[] {
  const updated = [goal, ...prev.filter(h => h !== goal)].slice(0, MAX_HISTORY)
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)) } catch {}
  return updated
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

export function AIPanel() {
  const [goal, setGoal] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set()) // "projectPath:index"
  const [runStatus, setRunStatus] = useState<string | null>(null)
  const [skipPerms, setSkipPerms] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<Array<{ name: string; charCount: number }>>([])
  const [dropError, setDropError] = useState<string | null>(null)
  const [showContextPreview, setShowContextPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Multi-project state
  const [projects, setProjects] = useState<ProjectContext[]>([])
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  // Inline path input shown after OS folder picker can't auto-match
  const [inlinePath, setInlinePath] = useState('')
  const [showInlinePath, setShowInlinePath] = useState(false)
  const [addedMsg, setAddedMsg] = useState<string | null>(null)

  // Per-project recommendation results
  const [projectResults, setProjectResults] = useState<ProjectResult[]>([])

  const pickerSearchRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const cancelRefs = useRef<Array<(() => void) | null>>([])

  // Load persisted projects on mount
  useEffect(() => {
    setHistory(loadHistory())
    fetch('/api/recent-projects').then(r => r.json()).then(setRecentProjects).catch(() => {})
    try {
      const saved = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
      if (Array.isArray(saved) && saved.length > 0) setProjects(saved)
    } catch {}
    return () => { cancelRefs.current.forEach(c => c?.()) }
  }, [])

  // Persist projects to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)) } catch {}
  }, [projects])

  useEffect(() => {
    if (!showProjectPicker) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false)
        setPickerSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showProjectPicker])

  useEffect(() => {
    if (showProjectPicker) setTimeout(() => pickerSearchRef.current?.focus(), 50)
  }, [showProjectPicker])

  // Note: skipPerms is opt-in only — do not auto-enable

  async function handlePickFolder() {
    // Just open the inline panel — user picks from there
    setInlinePath('')
    setPathError(null)
    setShowInlinePath(true)
  }

  async function handleOsPicker() {
    try {
      if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
        const handle = await (window as Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
        const folderName = handle.name
        const match = recentProjects.find(p => p.name === folderName)
        if (match) {
          loadProjectContext(match.path)
        } else {
          setInlinePath('')
          setPathError(`"${folderName}" 폴더의 절대 경로를 입력하세요`)
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setPathError('폴더 선택에 실패했습니다. 아래에서 직접 입력하세요.')
      }
    }
  }

  async function loadProjectContext(path: string) {
    const p = path.trim()
    if (!p) return
    if (projects.some(proj => proj.path === p)) {
      setAddedMsg(`"${p.split('/').pop()}" 이미 추가됨`)
      setTimeout(() => setAddedMsg(null), 2000)
      return
    }
    setLoadingContext(true)
    setLoadingPath(p)
    setPathError(null)
    setShowProjectPicker(false)
    try {
      const res = await fetch(`/api/project-context?path=${encodeURIComponent(p)}`)
      if (res.status === 404) { setPathError('폴더를 찾을 수 없습니다.'); return }
      if (!res.ok) { setPathError('컨텍스트 로드 실패'); return }
      const data = await res.json()
      setProjects(prev => [...prev, data])
      setPickerSearch('')
      setPathError(null)
      setInlinePath('')
      setAddedMsg(`✓ "${data.name}" 추가됨`)
      setTimeout(() => setAddedMsg(null), 2500)
    } catch { setPathError('연결 오류가 발생했습니다.') }
    finally { setLoadingContext(false); setLoadingPath(null) }
  }

  function removeProject(path: string) {
    setProjects(prev => prev.filter(p => p.path !== path))
  }

  const anyLoading = projectResults.some(r => r.loading)

  async function fetchForProject(
    target: { projectPath?: string; projectContext?: string; projectName: string },
    idx: number
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

  async function handleSubmit() {
    if (!goal.trim() || anyLoading) return
    setHistory(prev => saveHistory(goal.trim(), prev))
    setSelectedSkills(new Set())
    cancelRefs.current.forEach(c => c?.())
    cancelRefs.current = []

    const targets = projects.length > 0
      ? projects.map(p => ({
          projectPath: p.path,
          projectContext: p.claudeMd
            ? `${p.summary}\n\nCLAUDE.md:\n${p.claudeMd}`
            : p.summary,
          projectName: p.name,
        }))
      : [{ projectPath: undefined, projectContext: undefined, projectName: '기본' }]

    setProjectResults(targets.map(t => ({
      projectPath: t.projectPath || 'default',
      projectName: t.projectName,
      recs: [],
      fallback: false,
      loading: true,
      error: null,
      streamText: '',
    })))
    cancelRefs.current = new Array(targets.length).fill(null)

    await Promise.all(targets.map((t, idx) => fetchForProject(t, idx)))
  }

  function toggleSkill(projectPath: string, idx: number) {
    const key = `${projectPath}:${idx}`
    setSelectedSkills(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    const allKeys = projectResults.flatMap(pr => pr.recs.map((_, i) => `${pr.projectPath}:${i}`))
    if (selectedSkills.size === allKeys.length) setSelectedSkills(new Set())
    else setSelectedSkills(new Set(allKeys))
  }

  async function runSelected() {
    const goalSuffix = goal.trim() ? ` ${sanitizeGoalSuffix(goal.trim())}` : ''

    // Group selected skills by project path
    const groups = new Map<string, string[]>()
    for (const key of selectedSkills) {
      const colonIdx = key.lastIndexOf(':')
      const projectPath = key.slice(0, colonIdx)
      const idx = parseInt(key.slice(colonIdx + 1))
      const pr = projectResults.find(r => r.projectPath === projectPath)
      if (!pr) continue
      const cmd = pr.recs[idx]?.cmd
      if (!cmd) continue
      const mapKey = projectPath === 'default' ? '__default__' : projectPath
      if (!groups.has(mapKey)) groups.set(mapKey, [])
      groups.get(mapKey)!.push(cmd + goalSuffix)
    }

    setRunStatus('launching...')
    try {
      const responses = await Promise.all(Array.from(groups.entries()).map(([pathKey, cmds]) =>
        fetch('/api/run-skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cmds,
            projectPath: pathKey === '__default__' ? undefined : pathKey,
            skipPerms,
            goal: goal.trim() || undefined,
          }),
        }).then(r => r.json())
      ))
      const total = Array.from(groups.values()).reduce((s, a) => s + a.length, 0)
      const isTeam = responses.some((r: { mode?: string }) => r.mode === 'team')
      setRunStatus(isTeam
        ? `✓ Agent Teams ${total}개 실행 중 (tmux)`
        : `✓ ${total}개 실행 중`)
      setTimeout(() => setRunStatus(null), 5000)
    } catch {
      setRunStatus('❌ 연결 오류')
      setTimeout(() => setRunStatus(null), 4000)
    }
  }

  function copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd)
    setCopied(cmd)
    setTimeout(() => setCopied(null), 1500)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box', outline: 'none',
  }

  const totalRecs = projectResults.reduce((s, r) => s + r.recs.length, 0)
  const allKeys = projectResults.flatMap(pr => pr.recs.map((_, i) => `${pr.projectPath}:${i}`))

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

      {/* Multi-project section */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          {/* Project badges */}
          {projects.map(p => (
            <div key={p.path} style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', borderRadius: '7px', fontSize: '12px',
              border: '1px solid rgba(99,102,241,0.4)',
              background: 'rgba(99,102,241,0.08)', color: 'var(--primary)',
            }}>
              <span>📂</span>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              {p.techs.slice(0, 2).map(t => (
                <span key={t} style={{
                  fontSize: '10px', padding: '1px 5px', borderRadius: '3px',
                  background: 'rgba(99,102,241,0.12)',
                }}>{t}</span>
              ))}
              <button onClick={() => removeProject(p.path)} style={{
                fontSize: '11px', padding: '1px 4px', borderRadius: '3px',
                border: 'none', background: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
              }} title="프로젝트 제거">✕</button>
            </div>
          ))}

          {/* Add project button + dropdown */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              onClick={handlePickFolder}
              disabled={loadingContext}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '5px 10px', borderRadius: '7px', fontSize: '12px',
                border: '1px dashed var(--border)', background: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              {loadingContext ? '⟳' : '+'} 폴더 추가
            </button>

            {showProjectPicker && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                width: '320px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '10px',
                zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px' }}>
                  <input
                    ref={pickerSearchRef}
                    value={pickerSearch}
                    onChange={e => { setPickerSearch(e.target.value); setPathError(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && pickerSearch.trim()) loadProjectContext(pickerSearch)
                      if (e.key === 'Escape') { setShowProjectPicker(false); setPickerSearch('') }
                    }}
                    placeholder="절대 경로 입력 (예: /Users/...)"
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: '6px',
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', fontSize: '12px', outline: 'none',
                    }}
                  />
                </div>

                {pickerSearch.startsWith('/') && (
                  <button onMouseDown={() => loadProjectContext(pickerSearch)} style={{
                    display: 'flex', width: '100%', padding: '8px 12px', gap: '8px',
                    alignItems: 'center', background: 'rgba(99,102,241,0.08)',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', color: 'var(--primary)', fontSize: '12px', textAlign: 'left',
                  }}>
                    <span>↩</span>
                    <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{pickerSearch}</span>
                    <span style={{ opacity: 0.6, flexShrink: 0 }}>열기</span>
                  </button>
                )}

                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {recentProjects
                    .filter(p => {
                      if (projects.some(proj => proj.path === p.path)) return false
                      const q = pickerSearch.toLowerCase()
                      return !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
                    })
                    .map(p => (
                      <button key={p.path} onMouseDown={() => loadProjectContext(p.path)} style={{
                        display: 'flex', width: '100%', padding: '8px 12px',
                        alignItems: 'center', gap: '8px',
                        background: loadingPath === p.path ? 'rgba(99,102,241,0.08)' : 'none',
                        border: 'none', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.05)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = loadingPath === p.path ? 'rgba(99,102,241,0.08)' : 'none' }}
                      >
                        <span style={{ fontSize: '14px', flexShrink: 0 }}>{loadingPath === p.path ? '⟳' : '📁'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
                            {p.techs.slice(0, 3).map(t => (
                              <span key={t} style={{ fontSize: '10px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)' }}>{t}</span>
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Inline folder panel — stays open for multiple additions */}
        {showInlinePath && (
          <div style={{
            marginTop: '8px', padding: '10px 12px', borderRadius: '9px',
            border: '1px solid var(--border)', background: 'var(--surface)',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                프로젝트 추가{projects.length > 0 ? ` (${projects.length}개 선택됨)` : ''}
              </span>
              <button onClick={() => { setShowInlinePath(false); setInlinePath(''); setPathError(null) }}
                style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕ 닫기</button>
            </div>

            {/* Added projects list */}
            {projects.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {projects.map(p => (
                  <span key={p.path} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '2px 8px', borderRadius: '5px', fontSize: '11px',
                    background: 'rgba(99,102,241,0.12)', color: 'var(--primary)',
                    border: '1px solid rgba(99,102,241,0.3)',
                  }}>
                    ✓ {p.name}
                    <button onClick={() => removeProject(p.path)} style={{ fontSize: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 1px' }}>✕</button>
                  </span>
                ))}
              </div>
            )}

            {addedMsg && (
              <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 500 }}>{addedMsg}</div>
            )}

            {pathError && (
              <div style={{ fontSize: '11px', color: '#f59e0b' }}>💡 {pathError}</div>
            )}

            {/* Path input row */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={handleOsPicker} title="OS 폴더 선택" style={{
                padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', flexShrink: 0,
              }}>📂</button>
              <input
                autoFocus
                value={inlinePath}
                onChange={e => { setInlinePath(e.target.value); setPathError(null) }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && inlinePath.trim()) loadProjectContext(inlinePath)
                  if (e.key === 'Escape') { setShowInlinePath(false); setInlinePath(''); setPathError(null) }
                }}
                placeholder="/Users/.../my-project"
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: '7px',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: '12px', fontFamily: 'monospace', outline: 'none',
                }}
              />
              <button
                onClick={() => inlinePath.trim() && loadProjectContext(inlinePath)}
                disabled={!inlinePath.trim() || loadingContext}
                style={{
                  padding: '7px 14px', borderRadius: '7px', border: 'none', flexShrink: 0,
                  background: inlinePath.trim() ? 'var(--primary)' : 'var(--border)',
                  color: '#fff', fontSize: '12px', fontWeight: 600,
                  cursor: inlinePath.trim() ? 'pointer' : 'not-allowed',
                }}
              >{loadingContext ? '⟳' : '추가'}</button>
            </div>

            {/* Recent projects list */}
            {recentProjects.filter(p => !projects.some(proj => proj.path === p.path)).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', paddingLeft: '2px' }}>최근 프로젝트</div>
                {recentProjects
                  .filter(p => !projects.some(proj => proj.path === p.path))
                  .slice(0, 8)
                  .map(p => (
                    <button key={p.path} onClick={() => loadProjectContext(p.path)}
                      disabled={loadingPath === p.path}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                        borderRadius: '6px', border: 'none',
                        background: loadingPath === p.path ? 'rgba(99,102,241,0.08)' : 'none',
                        color: 'var(--text)', cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                      }}
                      onMouseEnter={e => { if (loadingPath !== p.path) e.currentTarget.style.background = 'rgba(99,102,241,0.05)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = loadingPath === p.path ? 'rgba(99,102,241,0.08)' : 'none' }}
                    >
                      <span style={{ flexShrink: 0 }}>{loadingPath === p.path ? '⟳' : '📁'}</span>
                      <span style={{ fontWeight: 500, flexShrink: 0 }}>{p.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.path}</span>
                      {p.techs.slice(0, 2).map(t => (
                        <span key={t} style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', flexShrink: 0 }}>{t}</span>
                      ))}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Goal input */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex', gap: '8px', position: 'relative',
            flexDirection: 'column',
          }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }}
          onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }}
          onDrop={async e => {
            e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
            const MAX_SIZE = 512 * 1024 // 500KB
            const rejected: string[] = []
            const accepted = Array.from(e.dataTransfer.files).filter(f => {
              const isText = f.name.endsWith('.md') || f.name.endsWith('.txt') || f.type.startsWith('text/')
              if (!isText) { rejected.push(`${f.name} (텍스트 아님)`); return false }
              if (f.size > MAX_SIZE) { rejected.push(`${f.name} (>500KB)`); return false }
              return true
            })
            if (accepted.length === 0) {
              if (rejected.length > 0) {
                setDropError(`거부됨: ${rejected.join(', ')}`)
                setTimeout(() => setDropError(null), 4000)
              }
              return
            }
            const results = await Promise.all(
              accepted.map(async f => {
                try {
                  const text = await f.text()
                  // Binary content guard — null byte means it's not text
                  if (text.includes('\0')) {
                    rejected.push(`${f.name} (바이너리)`)
                    return null
                  }
                  return { name: f.name, text }
                } catch {
                  rejected.push(`${f.name} (읽기 실패)`)
                  return null
                }
              })
            )
            const valid = results.filter((r): r is { name: string; text: string } => r !== null)
            if (valid.length === 0) {
              if (rejected.length > 0) {
                setDropError(`거부됨: ${rejected.join(', ')}`)
                setTimeout(() => setDropError(null), 4000)
              }
              return
            }
            const combined = valid.map(({ name, text }, i, arr) =>
              arr.length > 1 ? `--- ${name} ---\n${text}` : text
            ).join('\n\n')
            setGoal(prev => prev ? prev + '\n\n' + combined : combined)
            // Track dropped files for badge display
            setDroppedFiles(prev => {
              const next = [...prev]
              for (const { name, text } of valid) {
                const existing = next.findIndex(d => d.name === name)
                const entry = { name, charCount: text.length }
                if (existing >= 0) next[existing] = entry
                else next.push(entry)
              }
              return next
            })
            if (rejected.length > 0) {
              setDropError(`일부 거부됨: ${rejected.join(', ')}`)
              setTimeout(() => setDropError(null), 4000)
            }
            // Auto-resize after drop
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto'
                const maxH = Math.max(120, Math.min(400, window.innerHeight * 0.5))
                textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxH) + 'px'
              }
            }, 0)
          }}
        >
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={goal}
              onChange={e => {
                setGoal(e.target.value)
                // Auto-resize — cap to 50% of viewport so other UI stays visible
                e.target.style.height = 'auto'
                const maxH = Math.max(120, Math.min(400, window.innerHeight * 0.5))
                e.target.style.height = Math.min(e.target.scrollHeight, maxH) + 'px'
              }}
              onKeyDown={e => {
                // Cmd/Ctrl+Enter always submits (장문 입력 시 권장)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit()
                  return
                }
                // Plain Enter submits only when text is short (single-line intent)
                // Long text → Enter inserts newline (no accidental submit)
                if (e.key === 'Enter' && !e.shiftKey && goal.length < 80 && !goal.includes('\n')) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              onFocus={() => history.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 150)}
              placeholder={projects.length > 0
                ? `${projects.map(p => p.name).join(', ')}에서 무엇을 하려고 하시나요?\n\n.md 파일을 드래그하거나, 프로젝트 요구사항을 붙여넣으세요.`
                : '무엇을 하려고 하시나요? (예: 코드 리뷰, 테스트 작성, 배포)\n\n.md 파일을 드래그하거나, 프로젝트 요구사항을 붙여넣으세요.'}
              disabled={anyLoading}
              rows={2}
              style={{
                ...inputStyle,
                resize: 'none',
                overflow: 'auto',
                minHeight: '76px',
                maxHeight: '400px',
                lineHeight: '1.5',
                paddingBottom: '48px', // Reserve space for floating button
                ...(isDragOver ? {
                  borderColor: 'var(--primary)',
                  background: 'rgba(99,102,241,0.06)',
                } : {}),
              }}
            />
            {isDragOver && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(99,102,241,0.1)',
                border: '2px dashed var(--primary)',
                pointerEvents: 'none', fontSize: '13px', color: 'var(--primary)', fontWeight: 600,
              }}>
                .md / .txt 파일을 여기에 놓으세요
              </div>
            )}
            {/* Floating submit button — always visible at textarea bottom-right */}
            <button
              onClick={handleSubmit}
              disabled={!goal.trim() || anyLoading}
              style={{
                position: 'absolute', bottom: '8px', right: '8px',
                padding: '8px 16px', borderRadius: '8px',
                background: !goal.trim() || anyLoading ? 'var(--border)' : 'var(--primary)',
                color: '#fff', border: 'none',
                cursor: !goal.trim() || anyLoading ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
                boxShadow: !goal.trim() || anyLoading
                  ? 'none'
                  : '0 2px 8px rgba(99,102,241,0.35)',
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.15s',
              }}
              title={anyLoading ? '분석 중...' : 'Cmd/Ctrl+Enter로도 실행 가능'}
            >
              {anyLoading ? (
                <>
                  <span style={{
                    display: 'inline-block', width: '12px', height: '12px',
                    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  <span>분석 중 ({projectResults.filter(r => r.loading).length})</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>{projects.length > 1 ? `AI 추천 ×${projects.length}` : 'AI 추천'}</span>
                </>
              )}
            </button>
            {showHistory && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '8px', marginTop: '4px', zIndex: 20, overflow: 'hidden',
              }}>
                {history.map((h, i) => (
                  <button key={i} onMouseDown={() => { setGoal(h); setShowHistory(false) }} style={{
                    display: 'block', width: '100%', padding: '8px 14px',
                    textAlign: 'left', background: 'none', border: 'none',
                    color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>🕐 {h.length > 80 ? h.slice(0, 80) + '...' : h}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: '4px', padding: '0 2px',
          }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
              {goal.length < 80 && !goal.includes('\n')
                ? '⏎ 추천 · ⌘⏎ 강제 · 📄 .md 드래그'
                : '⌘⏎ (Ctrl+Enter) 추천 · ⇧⏎ 줄바꿈 · 📄 .md 드래그'}
            </span>
            <span style={{
              fontSize: '10px',
              color: goal.length > 4500 ? '#f59e0b' : 'var(--text-dim)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {goal.length > 0 && `${goal.length.toLocaleString()} / 5,000`}
            </span>
          </div>
        </div>

        {/* Drop error toast */}
        {dropError && (
          <div style={{
            marginTop: '6px', padding: '6px 10px', borderRadius: '6px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444', fontSize: '11px',
          }}>⚠ {dropError}</div>
        )}

        {/* Dropped file badges */}
        {droppedFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
            {droppedFiles.map(f => (
              <span key={f.name} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: '5px', fontSize: '11px',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.3)',
                color: 'var(--primary)',
              }}>
                📄 {f.name} ({f.charCount.toLocaleString()}자)
              </span>
            ))}
          </div>
        )}

        {/* Template prompt buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
          {TEMPLATES.map(t => {
            const disabled = goal.trim().length > 0
            return (
              <button
                key={t}
                onClick={() => {
                  if (disabled) return
                  setGoal(t)
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto'
                      const maxH = Math.max(120, Math.min(400, window.innerHeight * 0.5))
                      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxH) + 'px'
                    }
                  }, 0)
                }}
                disabled={disabled}
                style={{
                  padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: disabled ? 'var(--text-dim)' : 'var(--text-muted)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                }}
                title={disabled ? '텍스트를 비운 후 사용하세요' : '클릭하여 삽입'}
              >
                {t}
              </button>
            )
          })}
        </div>

        {/* Context preview panel */}
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={() => setShowContextPreview(v => !v)}
            style={{
              padding: '4px 8px', borderRadius: '5px', fontSize: '11px',
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            🔍 AI가 볼 컨텍스트 {showContextPreview ? '▾' : '▸'}
          </button>
          {showContextPreview && (
            <pre style={{
              marginTop: '4px', padding: '10px 12px', borderRadius: '6px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              fontSize: '11px', color: 'var(--text-muted)',
              maxHeight: '300px', overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {(() => {
                const sections: string[] = []
                sections.push(`[사용자 입력]\n${goal.trim() || '(비어있음)'}`)
                for (const p of projects) {
                  sections.push(`[프로젝트: ${p.name}]\n${p.summary}`)
                  sections.push(`[CLAUDE.md: ${p.name}]\n${p.claudeMd || '(없음)'}`)
                }
                if (projects.length === 0 && !goal.trim()) {
                  return '(프로젝트를 추가하고 목표를 입력하면 여기에 표시됩니다)'
                }
                return sections.join('\n\n')
              })()}
            </pre>
          )}
        </div>
      </div>

      {/* Results */}
      {projectResults.length > 0 && (
        <div>
          {/* Global controls */}
          {totalRecs > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={selectedSkills.size === allKeys.length && allKeys.length > 0}
                  ref={el => { if (el) el.indeterminate = selectedSkills.size > 0 && selectedSkills.size < allKeys.length }}
                  onChange={toggleAll}
                  style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                />
                전체 선택
              </label>
              {selectedSkills.size > 0 && (
                <>
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '11px', color: skipPerms ? '#f59e0b' : 'var(--text-muted)',
                    cursor: 'pointer', userSelect: 'none', padding: '3px 8px', borderRadius: '5px',
                    border: `1px solid ${skipPerms ? '#f59e0b' : 'var(--border)'}`,
                    background: skipPerms ? 'rgba(245,158,11,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }} title="--dangerously-skip-permissions 플래그로 실행">
                    <input type="checkbox" checked={skipPerms}
                      onChange={e => setSkipPerms(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: '#f59e0b' }}
                    />
                    ⚡ 권한 스킵
                  </label>
                  <button onClick={runSelected} style={{
                    padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                    background: skipPerms ? '#f59e0b' : 'var(--primary)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}>
                    {selectedSkills.size === 1 ? '▶ 실행' : `▶ 팀 실행 (Agent Teams)`}{skipPerms ? ' 🔓' : ''}
                  </button>
                </>
              )}
            </div>
          )}
          {runStatus && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: runStatus.startsWith('❌') ? '#ef4444' : 'var(--primary)' }}>
                {runStatus}
              </span>
            </div>
          )}

          {/* Per-project result sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {projectResults.map((pr) => (
              <div key={pr.projectPath}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  {projectResults.length > 1 && (
                    <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>📂 {pr.projectName}</span>
                  )}
                  {pr.loading && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🔍 분석 중...</span>}
                  {!pr.loading && !pr.error && pr.recs.length > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {pr.fallback
                        ? '⚠️ 시간 초과 — 키워드 검색 결과'
                        : `✨ ${pr.recs.length}개 스킬 추천됨${projectResults.length === 1 && pr.projectName !== '기본' ? ` (${pr.projectName} 기준)` : ''}`}
                    </span>
                  )}
                </div>

                {/* Streaming indicator (spinner while Claude responds) */}
                {pr.streamText && (
                  <div style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{
                      display: 'inline-block', width: '14px', height: '14px',
                      border: '2px solid var(--border)', borderTopColor: 'var(--primary)',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0,
                    }} />
                    <span style={{ color: 'var(--primary)' }}>Claude가 분석 중...</span>
                  </div>
                )}

                {/* Error */}
                {pr.error && (
                  <div style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', fontSize: '13px', marginBottom: '8px',
                  }}>❌ {pr.error}</div>
                )}

                {/* Skill cards */}
                {pr.recs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {pr.recs.map((r, i) => {
                      const key = `${pr.projectPath}:${i}`
                      const selected = selectedSkills.has(key)
                      return (
                        <div key={i} onClick={() => toggleSkill(pr.projectPath, i)} style={{
                          padding: '10px 14px', borderRadius: '10px',
                          background: selected ? 'rgba(99,102,241,0.07)' : 'var(--surface)',
                          border: `1px solid ${selected ? 'var(--primary)' : i === 0 ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSkill(pr.projectPath, i)}
                            onClick={e => e.stopPropagation()}
                            style={{ marginTop: '3px', cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0, accentColor: 'var(--primary)' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                              <code style={{
                                padding: '2px 8px', borderRadius: '4px', fontSize: '13px',
                                fontWeight: 700, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)',
                              }}>{r.cmd}</code>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '4px' }}>{r.plugin}</span>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{r.reason}</div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); copyCmd(r.cmd) }} style={{
                            padding: '3px 9px', borderRadius: '5px', background: 'none',
                            border: '1px solid var(--border)',
                            color: copied === r.cmd ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                          }}>{copied === r.cmd ? '✓' : '복사'}</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!anyLoading && projectResults.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
          <div style={{ fontSize: '15px', marginBottom: '6px', color: 'var(--text)' }}>자연어로 스킬을 찾아보세요</div>
          <div style={{ fontSize: '13px' }}>
            {projects.length > 0
              ? `${projects.map(p => p.name).join(', ')} 프로젝트 컨텍스트가 적용됩니다.`
              : '📂 폴더를 추가하면 기술 스택이 자동 감지되어 더 정확한 추천을 받을 수 있습니다.'}
          </div>
        </div>
      )}
    </div>
  )
}
