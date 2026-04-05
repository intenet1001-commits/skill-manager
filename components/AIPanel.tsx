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
}

interface RecentProject {
  name: string
  path: string
  techs: string[]
  modifiedAt: number
}

const HISTORY_KEY = 'skill-manager-ai-history'
const MAX_HISTORY = 5

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
  in_progress: '이미 분석 중입니다. 잠시 후 다시 시도해주세요.',
  parse: 'AI 응답 파싱에 실패했습니다. 다시 시도해주세요.',
  failed: 'Claude 실행에 실패했습니다. 다시 시도해주세요.',
  spawn: 'Claude 프로세스를 시작할 수 없습니다.',
  index_missing: 'npm run build-index를 먼저 실행해주세요.',
}

export function AIPanel() {
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [results, setResults] = useState<Recommendation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isFallback, setIsFallback] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<Set<number>>(new Set())
  const [runStatus, setRunStatus] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectContext | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [pickingFolder] = useState(false) // kept for type compat, unused
  const cancelRef = useRef<(() => void) | null>(null)
  const pickerSearchRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHistory(loadHistory())
    fetch('/api/recent-projects').then(r => r.json()).then(setRecentProjects).catch(() => {})
    return () => { cancelRef.current?.() }
  }, [])

  // Close picker on outside click
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

  function handlePickFolder() {
    // Use browser-native directory picker (more reliable than server-side osascript)
    fileInputRef.current?.click()
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]
    // Chrome/Chromium exposes the absolute path via non-standard file.path
    const absPath = (file as unknown as { path?: string }).path
    if (absPath && file.webkitRelativePath) {
      // Reconstruct the folder's absolute path:
      // absPath = "/abs/path/to/Folder/sub/file.txt"
      // webkitRelativePath = "Folder/sub/file.txt"
      // folderPath = absPath minus webkitRelativePath + folderName
      const folderName = file.webkitRelativePath.split('/')[0]
      const prefix = absPath.slice(0, absPath.length - file.webkitRelativePath.length)
      const folderPath = (prefix + folderName).replace(/\/+$/, '')
      loadProjectContext(folderPath)
    } else {
      // Fallback: match folder name against recent projects
      const folderName = file.webkitRelativePath?.split('/')[0] ?? file.name
      const match = recentProjects.find(p => p.name === folderName)
      if (match) {
        loadProjectContext(match.path)
      } else {
        setPathError(`"${folderName}" 폴더를 최근 프로젝트에서 찾을 수 없습니다. 경로를 직접 입력해주세요.`)
        setShowProjectPicker(true)
      }
    }
    e.target.value = '' // reset so same folder can be re-picked
  }

  async function loadProjectContext(path: string) {
    const p = path.trim()
    if (!p) return
    setLoadingContext(true)
    setLoadingPath(p)
    setPathError(null)
    setShowProjectPicker(false)   // close dropdown immediately
    try {
      const res = await fetch(`/api/project-context?path=${encodeURIComponent(p)}`)
      if (res.status === 404) { setPathError('폴더를 찾을 수 없습니다.'); setShowProjectPicker(true); return }
      if (!res.ok) { setPathError('컨텍스트 로드 실패'); setShowProjectPicker(true); return }
      const data = await res.json()
      setProject(data)
      setPickerSearch('')
      setPathError(null)
    } catch { setPathError('연결 오류가 발생했습니다.'); setShowProjectPicker(true) }
    finally { setLoadingContext(false); setLoadingPath(null) }
  }

  async function handleSubmit() {
    if (!goal.trim() || loading) return
    setLoading(true)
    setStreamText('')
    setResults([])
    setError(null)
    setIsFallback(false)
    setHistory(prev => saveHistory(goal.trim(), prev))

    const controller = new AbortController()
    cancelRef.current = () => controller.abort()

    try {
      const resp = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          projectContext: project?.summary,
        }),
        signal: controller.signal,
      })

      if (resp.status === 429) {
        setError(ERROR_MSGS.in_progress)
        setLoading(false)
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
            setStreamText(prev => prev + data.text)
          } else if (data.done && data.recommendations) {
            setResults(data.recommendations)
            setIsFallback(!!data.fallback)
            setStreamText('')
          } else if (data.error) {
            setError(ERROR_MSGS[data.error] ?? '오류가 발생했습니다.')
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setError('연결 오류. 서버가 실행 중인지 확인해주세요.')
      }
    } finally {
      setLoading(false)
      cancelRef.current = null
    }
  }

  // Reset selection when new results arrive
  useEffect(() => { setSelectedSkills(new Set()) }, [results])

  function toggleSkill(i: number) {
    setSelectedSkills(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleAll() {
    if (selectedSkills.size === results.length) setSelectedSkills(new Set())
    else setSelectedSkills(new Set(results.map((_, i) => i)))
  }

  async function runSelected() {
    const cmds = Array.from(selectedSkills).sort().map(i => results[i].cmd)
    setRunStatus('opening...')
    try {
      const res = await fetch('/api/run-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmds, projectPath: project?.path }),
      })
      if (res.ok) {
        setRunStatus(`✓ ${cmds.length}개 실행 중`)
        setTimeout(() => setRunStatus(null), 3000)
      } else {
        const d = await res.json()
        setRunStatus(`❌ ${d.error ?? '실패'}`)
        setTimeout(() => setRunStatus(null), 4000)
      }
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
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

      {/* Project folder section */}
      <div style={{ marginBottom: '12px' }}>
        {project ? (
          /* Project loaded — badge row */
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', borderRadius: '7px', fontSize: '12px',
              border: '1px solid rgba(99,102,241,0.4)',
              background: 'rgba(99,102,241,0.08)', color: 'var(--primary)',
            }}>
              <span>📂</span>
              <span style={{ fontWeight: 600 }}>{project.name}</span>
            </div>
            {project.techs.map(t => (
              <span key={t} style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
                border: '1px solid rgba(99,102,241,0.2)',
              }}>{t}</span>
            ))}
            <button
              onClick={() => { setProject(null); setPathError(null) }}
              style={{
                fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                border: '1px solid var(--border)', background: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
              title="프로젝트 해제"
            >✕</button>
          </div>
        ) : (
          /* No project — path input + browse button + recent list */
          <div ref={pickerRef}>
            {/* Row: path input + browse button */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  ref={pickerSearchRef}
                  value={pickerSearch}
                  onChange={e => { setPickerSearch(e.target.value); setPathError(null) }}
                  onFocus={() => setShowProjectPicker(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && pickerSearch.trim()) loadProjectContext(pickerSearch)
                    if (e.key === 'Escape') { setShowProjectPicker(false); setPickerSearch('') }
                  }}
                  placeholder="프로젝트 폴더 경로 또는 이름으로 검색"
                  disabled={loadingContext}
                  style={{
                    width: '100%', padding: '7px 12px', borderRadius: '7px',
                    border: `1px solid ${pathError ? '#ef4444' : 'var(--border)'}`,
                    background: 'var(--surface)', color: 'var(--text)',
                    fontSize: '13px', boxSizing: 'border-box', outline: 'none',
                  }}
                />
                {/* Dropdown list */}
                {showProjectPicker && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '8px', zIndex: 50, maxHeight: '240px', overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}>
                    {/* Direct path open */}
                    {pickerSearch.startsWith('/') && (
                      <button
                        onMouseDown={() => loadProjectContext(pickerSearch)}
                        style={{
                          display: 'flex', width: '100%', padding: '9px 12px', gap: '8px',
                          alignItems: 'center', background: 'rgba(99,102,241,0.08)',
                          border: 'none', borderBottom: '1px solid var(--border)',
                          cursor: 'pointer', color: 'var(--primary)', fontSize: '12px', textAlign: 'left',
                        }}
                      >
                        <span>↩</span>
                        <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickerSearch}</span>
                        <span style={{ marginLeft: 'auto', opacity: 0.6, flexShrink: 0 }}>열기</span>
                      </button>
                    )}
                    {/* Filtered recent projects */}
                    {recentProjects
                      .filter(p => { const q = pickerSearch.toLowerCase(); return !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || p.techs.some(t => t.toLowerCase().includes(q)) })
                      .map(p => (
                        <button
                          key={p.path}
                          onMouseDown={() => loadProjectContext(p.path)}
                          style={{
                            display: 'flex', width: '100%', padding: '8px 12px',
                            alignItems: 'center', gap: '8px',
                            background: loadingPath === p.path ? 'rgba(99,102,241,0.08)' : 'none',
                            border: 'none', borderBottom: '1px solid var(--border)',
                            cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
                          }}
                          onMouseEnter={e => { if (!loadingPath) e.currentTarget.style.background = 'rgba(99,102,241,0.05)' }}
                          onMouseLeave={e => { if (!loadingPath) e.currentTarget.style.background = 'none' }}
                        >
                          <span style={{ fontSize: '14px', flexShrink: 0 }}>
                            {loadingPath === p.path ? '⟳' : '📁'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            <div style={{ display: 'flex', gap: '3px', marginTop: '2px', flexWrap: 'wrap' }}>
                              {p.techs.slice(0, 4).map(t => (
                                <span key={t} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)' }}>{t}</span>
                              ))}
                            </div>
                          </div>
                        </button>
                      ))
                    }
                    {recentProjects.filter(p => { const q = pickerSearch.toLowerCase(); return !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || p.techs.some(t => t.toLowerCase().includes(q)) }).length === 0 && !pickerSearch.startsWith('/') && (
                      <div style={{ padding: '14px 12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                        일치하는 프로젝트가 없습니다
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hidden native directory picker */}
              <input
                ref={fileInputRef}
                type="file"
                // @ts-expect-error — webkitdirectory is not in React types
                webkitdirectory=""
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />

              {/* Browse button */}
              <button
                onClick={handlePickFolder}
                disabled={loadingContext}
                title="폴더 직접 선택"
                style={{
                  padding: '7px 10px', borderRadius: '7px', flexShrink: 0,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px',
                }}
              >
                <span>📂</span>
              </button>

              {/* Confirm button (visible when path is typed) */}
              {pickerSearch.trim() && !pickingFolder && (
                <button
                  onClick={() => loadProjectContext(pickerSearch)}
                  disabled={loadingContext}
                  style={{
                    padding: '7px 14px', borderRadius: '7px', flexShrink: 0,
                    border: 'none', background: 'var(--primary)',
                    color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  }}
                >
                  {loadingContext ? '...' : '확인'}
                </button>
              )}
            </div>

            {pathError && (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#ef4444' }}>❌ {pathError}</div>
            )}
          </div>
        )}
      </div>

      {/* Goal input */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              onFocus={() => history.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 150)}
              placeholder={project
                ? `${project.name}에서 무엇을 하려고 하시나요?`
                : '무엇을 하려고 하시나요? (예: 코드 리뷰, 테스트 작성, 배포)'}
              disabled={loading}
              maxLength={200}
              style={inputStyle}
            />
            {showHistory && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '8px', marginTop: '4px', zIndex: 20, overflow: 'hidden',
              }}>
                {history.map((h, i) => (
                  <button
                    key={i}
                    onMouseDown={() => { setGoal(h); setShowHistory(false) }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      textAlign: 'left', background: 'none', border: 'none',
                      color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    🕐 {h}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!goal.trim() || loading}
            style={{
              padding: '10px 20px', borderRadius: '8px',
              background: !goal.trim() || loading ? 'var(--border)' : 'var(--primary)',
              color: '#fff', border: 'none',
              cursor: !goal.trim() || loading ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {loading ? '분석 중...' : 'AI 추천'}
          </button>
        </div>
      </div>

      {/* Streaming preview */}
      {streamText && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          marginBottom: '16px', fontSize: '12px', color: 'var(--text-muted)',
          fontFamily: 'monospace', whiteSpace: 'pre-wrap',
          maxHeight: '100px', overflow: 'hidden',
        }}>
          <span style={{ color: 'var(--primary)', marginRight: '6px' }}>Claude:</span>
          {streamText}▊
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#ef4444', fontSize: '13px', marginBottom: '16px',
        }}>
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          {/* Header row: label + select-all + run button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1 }}>
              {isFallback
                ? '⚠️ 시간 초과 — 키워드 검색 결과'
                : `✨ ${results.length}개 스킬 추천됨${project ? ` (${project.name} 기준)` : ''}`}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={selectedSkills.size === results.length}
                ref={el => { if (el) el.indeterminate = selectedSkills.size > 0 && selectedSkills.size < results.length }}
                onChange={toggleAll}
                style={{ cursor: 'pointer', width: '14px', height: '14px' }}
              />
              전체 선택
            </label>
            {selectedSkills.size > 0 && (
              <button
                onClick={runSelected}
                style={{
                  padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                }}
              >
                ▶ {selectedSkills.size}개 실행
              </button>
            )}
            {runStatus && (
              <span style={{ fontSize: '12px', color: runStatus.startsWith('❌') ? '#ef4444' : 'var(--primary)' }}>
                {runStatus}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => toggleSkill(i)}
                style={{
                  padding: '12px 16px', borderRadius: '10px',
                  background: selectedSkills.has(i) ? 'rgba(99,102,241,0.07)' : 'var(--surface)',
                  border: `1px solid ${selectedSkills.has(i) ? 'var(--primary)' : i === 0 ? 'rgba(99,102,241,0.4)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedSkills.has(i)}
                  onChange={() => toggleSkill(i)}
                  onClick={e => e.stopPropagation()}
                  style={{ marginTop: '3px', cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0, accentColor: 'var(--primary)' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <code style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '13px',
                      fontWeight: 700, color: 'var(--primary)',
                      background: 'rgba(99,102,241,0.1)',
                    }}>{r.cmd}</code>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '4px' }}>{r.plugin}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{r.reason}</div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); copyCmd(r.cmd) }}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', background: 'none',
                    border: '1px solid var(--border)',
                    color: copied === r.cmd ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                  }}
                >
                  {copied === r.cmd ? '✓' : '복사'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !streamText && !error && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
          <div style={{ fontSize: '15px', marginBottom: '6px', color: 'var(--text)' }}>자연어로 스킬을 찾아보세요</div>
          <div style={{ fontSize: '13px' }}>
            {project
              ? `${project.name} 프로젝트 컨텍스트가 적용됩니다.`
              : '📂 폴더를 열면 기술 스택이 자동 감지되어 더 정확한 추천을 받을 수 있습니다.'}
          </div>
        </div>
      )}
    </div>
  )
}
