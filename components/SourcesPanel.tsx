'use client'

import { useState, useEffect } from 'react'
import { SkillEntry } from '@/lib/types'
import { RECOMMENDED_REPOS, RecommendedRepo } from '@/lib/recommended-repos'

function normalizeUrl(url: string): string {
  return url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase()
}

interface PluginSource {
  name: string
  url: string
  type: 'marketplace' | 'plugin' | 'skill'
  manual?: boolean
}

const TYPE_LABEL: Record<string, string> = {
  marketplace: '마켓플레이스',
  plugin: '플러그인',
  skill: '스킬',
}

const TYPE_COLOR: Record<string, string> = {
  marketplace: 'rgba(99,102,241,0.15)',
  plugin: 'rgba(16,185,129,0.15)',
  skill: 'rgba(245,158,11,0.15)',
}

const TYPE_TEXT: Record<string, string> = {
  marketplace: 'var(--primary)',
  plugin: '#10b981',
  skill: '#f59e0b',
}

function GitHubSourcesModal({ sources, allSkills, onClose }: {
  sources: PluginSource[]
  allSkills: SkillEntry[]
  onClose: () => void
}) {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const publicSources = sources.filter(s => s.url.includes('github.com'))

  function getSkillCount(source: PluginSource) {
    const n = source.name.toLowerCase()
    return allSkills.filter(s =>
      s.marketplace.toLowerCase() === n ||
      s.pluginName.toLowerCase() === n ||
      s.pluginName.toLowerCase().startsWith(n + '-') ||
      s.marketplace.toLowerCase().startsWith(n + '-')
    ).length
  }

  function installCmd(source: PluginSource) {
    if (source.type === 'marketplace') return `git clone ${source.url} ~/.claude/plugins/marketplaces/${source.name}`
    if (source.type === 'plugin') return `git clone ${source.url} ~/.claude/plugins/${source.name}`
    return `git clone ${source.url} ~/.claude/skills/${source.name}`
  }

  function copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd)
    setCopiedCmd(cmd)
    setTimeout(() => setCopiedCmd(null), 1500)
  }

  function copyAll() {
    const cmds = publicSources.map(s => `# ${s.name} (${TYPE_LABEL[s.type]})\n${installCmd(s)}`).join('\n\n')
    navigator.clipboard.writeText(cmds)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  // Group by type for display
  const grouped: Record<string, PluginSource[]> = { marketplace: [], plugin: [], skill: [] }
  for (const s of publicSources) grouped[s.type].push(s)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        {/* Modal header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '7px' }}>
              🌟 추천 플러그인 / GitHub 소스
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              현재 설치된 소스 중 공개 GitHub 저장소 {publicSources.length}개
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {publicSources.length > 0 && (
              <button onClick={copyAll} style={{
                padding: '6px 14px', borderRadius: '7px', border: 'none',
                background: copiedAll ? '#10b981' : 'var(--primary)',
                color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              }}>
                {copiedAll ? '✓ 복사됨' : '📋 전체 설치 명령 복사'}
              </button>
            )}
            <button onClick={onClose} style={{
              padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--border)',
              background: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)',
            }}>✕</button>
          </div>
        </div>

        {/* Modal body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          {publicSources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>📭</div>
              <div style={{ fontSize: '13px' }}>공개 GitHub 소스가 없습니다.</div>
            </div>
          ) : (
            (['marketplace', 'plugin', 'skill'] as const).map(type => {
              const items = grouped[type]
              if (items.length === 0) return null
              return (
                <div key={type} style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                    marginBottom: '8px', paddingBottom: '5px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {TYPE_LABEL[type]} ({items.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {items.map(s => {
                      const skillCount = getSkillCount(s)
                      const cmd = installCmd(s)
                      const repoPath = s.url.replace('https://github.com/', '')
                      return (
                        <div key={s.url} style={{
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          background: 'var(--surface)',
                          padding: '12px 14px',
                        }}>
                          {/* Top row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{
                              padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                              background: TYPE_COLOR[type], color: TYPE_TEXT[type], flexShrink: 0,
                            }}>{TYPE_LABEL[type]}</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                              {s.name}
                            </span>
                            {skillCount > 0 && (
                              <span style={{
                                fontSize: '11px', color: '#10b981',
                                background: 'rgba(16,185,129,0.1)',
                                padding: '2px 8px', borderRadius: '99px',
                                fontWeight: 600,
                              }}>
                                {skillCount}개 스킬
                              </span>
                            )}
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="GitHub에서 보기"
                              style={{
                                fontSize: '11px', color: 'var(--text-muted)',
                                textDecoration: 'none', flexShrink: 0,
                                padding: '3px 8px', borderRadius: '5px',
                                border: '1px solid var(--border)',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                              }}
                            >
                              ↗ {repoPath}
                            </a>
                          </div>
                          {/* Install command row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{
                              flex: 1, fontSize: '11px', fontFamily: 'monospace',
                              color: 'var(--text-muted)',
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '5px',
                              padding: '5px 8px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'block',
                            }}>
                              {cmd}
                            </code>
                            <button
                              onClick={() => copyCmd(cmd)}
                              style={{
                                padding: '5px 10px', borderRadius: '6px', flexShrink: 0,
                                border: '1px solid var(--border)',
                                background: copiedCmd === cmd ? 'rgba(16,185,129,0.15)' : 'none',
                                color: copiedCmd === cmd ? '#10b981' : 'var(--text-muted)',
                                cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                              }}
                            >
                              {copiedCmd === cmd ? '✓' : '복사'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Modal footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          fontSize: '11px',
          color: 'var(--text-dim)',
        }}>
          설치 명령을 복사 후 터미널에서 실행하세요. 설치 후 Claude Code를 재시작하면 적용됩니다.
        </div>
      </div>
    </div>
  )
}

export function SourcesPanel() {
  const [sources, setSources] = useState<PluginSource[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [format, setFormat] = useState<'plain' | 'markdown' | 'json'>('markdown')
  const [addUrl, setAddUrl] = useState('')
  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState<'skill' | 'plugin' | 'marketplace'>('skill')
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [allSkills, setAllSkills] = useState<SkillEntry[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showGitHubModal, setShowGitHubModal] = useState(false)
  const [installStates, setInstallStates] = useState<Map<string, 'idle' | 'installing' | 'error'>>(new Map())
  const [installErrors, setInstallErrors] = useState<Map<string, string>>(new Map())
  const [restartNeeded, setRestartNeeded] = useState(false)
  const [recCollapsed, setRecCollapsed] = useState(() => {
    try { return localStorage.getItem('sm.recommendedRepos.collapsed') === '1' } catch { return false }
  })
  const [recExpanded, setRecExpanded] = useState<Set<string>>(new Set())
  const [updateState, setUpdateState] = useState<'idle' | 'running' | 'done'>('idle')
  const [updateResults, setUpdateResults] = useState<{ name: string; action: string; ok: boolean }[]>([])
  const [showUpdateResults, setShowUpdateResults] = useState(false)

  useEffect(() => {
    fetch('/api/plugin-sources')
      .then(r => r.json())
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setLoading(false))
    fetch('/skills-index.json')
      .then(r => r.json())
      .then(setAllSkills)
      .catch(() => {})
  }, [])

  function getSourceSkills(source: PluginSource): SkillEntry[] {
    const n = source.name.toLowerCase()
    return allSkills.filter(s =>
      s.marketplace.toLowerCase() === n ||
      s.pluginName.toLowerCase() === n ||
      s.pluginName.toLowerCase().startsWith(n + '-') ||
      s.marketplace.toLowerCase().startsWith(n + '-')
    )
  }

  function toggleExpand(url: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function copyOne(url: string) {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 1500)
  }

  function buildAllText() {
    const marketplaces = sources.filter(s => s.type === 'marketplace')
    const plugins = sources.filter(s => s.type === 'plugin')
    const skills = sources.filter(s => s.type === 'skill')
    const groups = [
      { label: '마켓플레이스', items: marketplaces },
      { label: '플러그인', items: plugins },
      { label: '스킬', items: skills },
    ].filter(g => g.items.length > 0)

    if (format === 'json') {
      return JSON.stringify(sources, null, 2)
    }
    if (format === 'plain') {
      return groups.map(g =>
        `# ${g.label}\n` + g.items.map(s => `${s.name}: ${s.url}`).join('\n')
      ).join('\n\n')
    }
    // markdown
    return groups.map(g =>
      `## ${g.label}\n` + g.items.map(s => `- [${s.name}](${s.url})`).join('\n')
    ).join('\n\n')
  }

  function copyAll() {
    navigator.clipboard.writeText(buildAllText())
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  async function handleAddSource() {
    const url = addUrl.trim()
    const name = addName.trim() || url.split('/').pop()?.replace(/\.git$/, '') || url
    if (!url) { setAddError('URL을 입력해주세요.'); return }
    try {
      const res = await fetch('/api/plugin-sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, type: addType }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setSources(prev => prev.some(s => s.url === url) ? prev : [...prev, { name, url, type: addType, manual: true }])
      setAddUrl(''); setAddName(''); setAddError(null); setShowAddForm(false)
    } catch (e) {
      setAddError(String(e))
    }
  }

  async function handleDelete(url: string) {
    await fetch('/api/plugin-sources', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    setSources(prev => prev.filter(s => s.url !== url))
  }

  const installedUrls = new Set(sources.map(s => normalizeUrl(s.url)))

  async function handleInstall(repo: RecommendedRepo) {
    setInstallStates(prev => new Map(prev).set(repo.id, 'installing'))
    setInstallErrors(prev => { const m = new Map(prev); m.delete(repo.id); return m })
    try {
      const res = await fetch('/api/plugin-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repo.url, name: repo.name, type: repo.type }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.message || data.error || '설치 실패')
      // Optimistically add to sources list
      setSources(prev => prev.some(s => normalizeUrl(s.url) === normalizeUrl(repo.url))
        ? prev
        : [...prev, { name: repo.name, url: repo.url, type: repo.type }])
      if (data.restartRequired) setRestartNeeded(true)
      setInstallStates(prev => { const m = new Map(prev); m.delete(repo.id); return m })
    } catch (e) {
      setInstallStates(prev => new Map(prev).set(repo.id, 'error'))
      setInstallErrors(prev => new Map(prev).set(repo.id, String(e)))
      setTimeout(() => {
        setInstallStates(prev => { const m = new Map(prev); m.delete(repo.id); return m })
      }, 5000)
    }
  }

  async function handleUpdateAll() {
    setUpdateState('running')
    setUpdateResults([])
    const results = await Promise.allSettled(
      sources.map(async s => {
        const res = await fetch('/api/plugin-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: s.url.replace(/\.git$/, ''), name: s.name, type: s.type }),
        })
        const data = await res.json()
        return { name: s.name, action: data.action ?? 'unknown', ok: !!data.ok }
      })
    )
    const mapped = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { name: sources[i]?.name ?? '?', action: 'error', ok: false }
    )
    setUpdateResults(mapped)
    setUpdateState('done')
    setShowUpdateResults(true)
    setRestartNeeded(true)
  }

  const recommendedUrls = new Set(RECOMMENDED_REPOS.map(r => normalizeUrl(r.url)))
  const nonRecommended = sources.filter(s => !recommendedUrls.has(normalizeUrl(s.url)))
  const grouped = {
    marketplace: nonRecommended.filter(s => s.type === 'marketplace'),
    plugin: nonRecommended.filter(s => s.type === 'plugin'),
    skill: nonRecommended.filter(s => s.type === 'skill'),
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>
            설치된 플러그인 소스
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {loading ? '로딩 중...' : `전체 ${sources.length}개 · 추천 외 ${nonRecommended.length}개`}
          </div>
        </div>

        {sources.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Update all button */}
            <button
              onClick={handleUpdateAll}
              disabled={updateState === 'running'}
              title="설치된 모든 플러그인/스킬을 git pull로 최신화"
              style={{
                padding: '7px 14px', borderRadius: '7px', border: '1px solid var(--border)',
                background: updateState === 'running' ? 'var(--surface)' : updateState === 'done' ? 'rgba(16,185,129,0.1)' : 'var(--surface)',
                color: updateState === 'done' ? '#10b981' : 'var(--text-muted)',
                cursor: updateState === 'running' ? 'wait' : 'pointer',
                fontSize: '12px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}
            >
              {updateState === 'running' ? (
                <>
                  <span style={{ display: 'inline-block', width: '11px', height: '11px', border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  업데이트 중...
                </>
              ) : updateState === 'done' ? '✓ 업데이트 완료' : '↻ 전체 업데이트'}
            </button>
            {/* Format selector */}
            <div style={{ display: 'flex', gap: '2px', padding: '3px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px' }}>
              {(['markdown', 'plain', 'json'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)} style={{
                  padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                  fontSize: '11px', fontWeight: format === f ? 600 : 400,
                  background: format === f ? 'var(--primary)' : 'transparent',
                  color: format === f ? '#fff' : 'var(--text-muted)',
                }}>{f}</button>
              ))}
            </div>
            <button onClick={copyAll} style={{
              padding: '7px 16px', borderRadius: '7px', border: 'none',
              background: copiedAll ? '#10b981' : 'var(--primary)',
              color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              {copiedAll ? '✓ 복사됨' : '📋 전체 복사'}
            </button>
          </div>
        )}
      </div>

      {/* Restart banner */}
      {restartNeeded && (
        <div style={{
          marginBottom: '16px', padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}>
          <span style={{ fontSize: '12px', color: '#f59e0b' }}>
            ✓ 설치 완료. Claude Code 재시작 후 새 플러그인이 적용됩니다.
          </span>
          <button onClick={() => setRestartNeeded(false)} style={{
            background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: '14px', padding: '0 4px',
          }}>✕</button>
        </div>
      )}

      {/* Update results */}
      {showUpdateResults && updateResults.length > 0 && (
        <div style={{ marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>업데이트 결과 ({updateResults.length}개)</span>
            <button onClick={() => setShowUpdateResults(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}>✕</button>
          </div>
          <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
            {updateResults.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                <span style={{ color: r.ok ? '#10b981' : '#ef4444', flexShrink: 0 }}>{r.ok ? '✓' : '✕'}</span>
                <span style={{ color: 'var(--text)', flexShrink: 0, fontWeight: 500 }}>{r.name}</span>
                <span style={{ color: 'var(--text-muted)' }}>{r.action === 'pulled' ? '최신화됨' : r.action === 'cloned' ? '새로 설치됨' : r.action === 'error' ? '실패' : r.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended repos section */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: recCollapsed ? 0 : '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>추천 플러그인 소스</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: '99px' }}>
              {RECOMMENDED_REPOS.length}개
            </span>
          </div>
          <button
            onClick={() => {
              const next = !recCollapsed
              setRecCollapsed(next)
              try { localStorage.setItem('sm.recommendedRepos.collapsed', next ? '1' : '0') } catch {}
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
          >
            {recCollapsed ? '▼ 펼치기' : '▲ 접기'}
          </button>
        </div>

        {!recCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {RECOMMENDED_REPOS.map(repo => {
              const isInstalled = installedUrls.has(normalizeUrl(repo.url))
              const state = installStates.get(repo.id) ?? 'idle'
              const error = installErrors.get(repo.id)
              const repoPath = repo.url.replace('https://github.com/', '')
              const repoSkills = getSourceSkills({ name: repo.name, url: repo.url, type: repo.type })
              const isRecExpanded = recExpanded.has(repo.id)
              return (
                <div key={repo.id} style={{
                  borderRadius: '10px',
                  background: isInstalled ? 'rgba(16,185,129,0.04)' : 'var(--surface)',
                  border: `1px solid ${isInstalled ? 'rgba(16,185,129,0.25)' : repo.featured ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                  padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                      background: TYPE_COLOR[repo.type], color: TYPE_TEXT[repo.type], flexShrink: 0,
                    }}>{TYPE_LABEL[repo.type]}</span>
                    {repo.featured && (
                      <span style={{ fontSize: '10px', color: '#f59e0b', flexShrink: 0 }}>★ 추천</span>
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                      {repo.name}
                    </span>
                    {repo.skillCount && (
                      <span style={{
                        fontSize: '11px', color: '#10b981',
                        background: 'rgba(16,185,129,0.1)',
                        padding: '1px 7px', borderRadius: '99px', fontWeight: 600, flexShrink: 0,
                      }}>{repo.skillCount}개 스킬</span>
                    )}
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {repo.description}
                    </span>
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '11px', color: 'var(--text-muted)',
                        textDecoration: 'none', flexShrink: 0,
                        padding: '3px 8px', borderRadius: '5px',
                        border: '1px solid var(--border)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >↗ {repoPath}</a>

                    {isInstalled ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                        background: 'rgba(16,185,129,0.1)', color: '#10b981', flexShrink: 0,
                      }}>✓ 설치됨</span>
                    ) : (
                      <button
                        onClick={() => handleInstall(repo)}
                        disabled={state === 'installing'}
                        style={{
                          padding: '4px 12px', borderRadius: '6px', border: 'none',
                          background: state === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--primary)',
                          color: state === 'error' ? '#ef4444' : '#fff',
                          fontSize: '12px', fontWeight: 600, cursor: state === 'installing' ? 'wait' : 'pointer',
                          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px',
                        }}
                      >
                        {state === 'installing' ? (
                          <>
                            <span style={{
                              display: 'inline-block', width: '10px', height: '10px',
                              border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
                              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                            }} />
                            설치 중...
                          </>
                        ) : state === 'error' ? '↺ 재시도' : '⬇ 설치'}
                      </button>
                    )}
                  </div>
                  {repoSkills.length > 0 && (
                    <div style={{ marginTop: '6px' }}>
                      <button
                        onClick={() => setRecExpanded(prev => {
                          const next = new Set(prev)
                          if (next.has(repo.id)) next.delete(repo.id)
                          else next.add(repo.id)
                          return next
                        })}
                        style={{
                          padding: '3px 9px', borderRadius: '5px', border: '1px solid var(--border)',
                          background: isRecExpanded ? 'rgba(99,102,241,0.1)' : 'none',
                          cursor: 'pointer', fontSize: '11px',
                          color: isRecExpanded ? 'var(--primary)' : 'var(--text-muted)',
                        }}
                      >
                        {isRecExpanded ? '▲ 접기' : `▼ 주요 기능 (${repoSkills.filter(s => s.userInvocable).length}개)`}
                      </button>
                      {isRecExpanded && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px', paddingLeft: '2px' }}>
                          {repoSkills.filter(s => s.userInvocable).slice(0, 8).map(sk => (
                            <div key={sk.pluginName + ':' + sk.name} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                              <code style={{ fontSize: '11px', color: 'var(--primary)', flexShrink: 0, fontFamily: 'monospace' }}>
                                {sk.invocationCommand}
                              </code>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.45', flex: 1 }}>
                                {sk.description.replace(/Triggers?:.*$/im, '').trim().slice(0, 100)}
                                {sk.description.replace(/Triggers?:.*$/im, '').trim().length > 100 ? '…' : ''}
                              </span>
                            </div>
                          ))}
                          {repoSkills.filter(s => s.userInvocable).length > 8 && (
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                              +{repoSkills.filter(s => s.userInvocable).length - 8}개 더 있음
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {error && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#ef4444' }}>
                      {error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '13px' }}>
          git 원격 주소 조회 중...
        </div>
      )}

      {!loading && sources.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
          <div style={{ fontSize: '14px' }}>git 원격 주소를 찾을 수 없습니다.</div>
          <div style={{ fontSize: '12px', marginTop: '6px' }}>
            ~/.claude/plugins/ 또는 ~/.claude/skills/ 에 git 저장소가 없습니다.
          </div>
        </div>
      )}

      {/* Grouped sections */}
      {(['marketplace', 'plugin', 'skill'] as const).map(type => {
        const items = grouped[type]
        if (items.length === 0) return null
        return (
          <div key={type} style={{ marginBottom: '24px' }}>
            <div style={{
              fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)',
              marginBottom: '8px', paddingBottom: '6px',
              borderBottom: '1px solid var(--border)',
            }}>
              {TYPE_LABEL[type]} ({items.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {items.map(s => {
                const sourceSkills = getSourceSkills(s)
                const isExpanded = expanded.has(s.url)
                const hasGithub = s.url.includes('github.com')
                return (
                <div key={s.url} style={{
                  borderRadius: '9px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  overflow: 'hidden',
                }}>
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px' }}>
                    <span style={{
                      padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                      background: TYPE_COLOR[type], color: TYPE_TEXT[type], flexShrink: 0,
                    }}>{TYPE_LABEL[type]}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                      {s.name}
                    </span>
                    {sourceSkills.length > 0 && (
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0 }}>
                        {sourceSkills.length}개 스킬
                      </span>
                    )}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1, fontSize: '12px', color: 'var(--text-muted)',
                        fontFamily: 'monospace', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: 'none',
                      }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--primary)' }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-muted)' }}
                    >
                      {s.url.replace('https://github.com/', 'github.com/')}
                    </a>
                    {hasGithub && sourceSkills.length > 0 && (
                      <button onClick={() => toggleExpand(s.url)} style={{
                        padding: '3px 9px', borderRadius: '5px', border: '1px solid var(--border)',
                        background: isExpanded ? 'rgba(99,102,241,0.1)' : 'none',
                        cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                        color: isExpanded ? 'var(--primary)' : 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}>
                        {isExpanded ? '▲ 접기' : '▼ 주요 기능'}
                      </button>
                    )}
                    <button onClick={() => copyOne(s.url)} style={{
                      padding: '3px 9px', borderRadius: '5px', border: '1px solid var(--border)',
                      background: 'none', cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                      color: copied === s.url ? 'var(--primary)' : 'var(--text-muted)',
                    }}>
                      {copied === s.url ? '✓' : '복사'}
                    </button>
                    {s.manual && (
                      <button onClick={() => handleDelete(s.url)} title="삭제" style={{
                        padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(239,68,68,0.3)',
                        background: 'none', cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                        color: 'rgba(239,68,68,0.7)',
                      }}>✕</button>
                    )}
                  </div>

                  {/* Skills summary — expanded */}
                  {isExpanded && (
                    <div style={{
                      borderTop: '1px solid var(--border)',
                      padding: '12px 14px',
                      display: 'flex', flexDirection: 'column', gap: '6px',
                    }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                        주요 스킬 ({sourceSkills.length}개)
                      </div>
                      {sourceSkills
                        .filter(sk => sk.userInvocable)
                        .slice(0, 8)
                        .map(sk => (
                        <div key={sk.pluginName + ':' + sk.name} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <code style={{ fontSize: '11px', color: 'var(--primary)', flexShrink: 0, fontFamily: 'monospace' }}>
                            {sk.invocationCommand}
                          </code>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.45', flex: 1 }}>
                            {sk.description.replace(/Triggers?:.*$/im, '').trim().slice(0, 100)}
                            {sk.description.replace(/Triggers?:.*$/im, '').trim().length > 100 ? '…' : ''}
                          </span>
                        </div>
                      ))}
                      {sourceSkills.filter(sk => sk.userInvocable).length > 8 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', paddingTop: '2px' }}>
                          +{sourceSkills.filter(sk => sk.userInvocable).length - 8}개 더 있음
                        </div>
                      )}
                      {sourceSkills.filter(sk => !sk.userInvocable).length > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                          내부 에이전트 {sourceSkills.filter(sk => !sk.userInvocable).length}개 포함
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Manual add */}
      <div style={{ marginTop: '8px' }}>
        <button onClick={() => setShowAddForm(v => !v)} style={{
          fontSize: '12px', color: 'var(--primary)', background: 'none',
          border: '1px dashed rgba(99,102,241,0.4)', borderRadius: '6px',
          padding: '5px 12px', cursor: 'pointer',
        }}>
          {showAddForm ? '✕ 취소' : '+ 수동 추가'}
        </button>
        {showAddForm && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <input
              value={addUrl}
              onChange={e => { setAddUrl(e.target.value); setAddError(null) }}
              placeholder="https://github.com/owner/repo"
              onKeyDown={e => e.key === 'Enter' && handleAddSource()}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="이름 (선택)"
                style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px', outline: 'none' }}
              />
              <select value={addType} onChange={e => setAddType(e.target.value as 'skill' | 'plugin' | 'marketplace')} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}>
                <option value="skill">스킬</option>
                <option value="plugin">플러그인</option>
                <option value="marketplace">마켓플레이스</option>
              </select>
              <button onClick={handleAddSource} style={{ padding: '7px 14px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>추가</button>
            </div>
            {addError && <div style={{ fontSize: '11px', color: '#ef4444' }}>{addError}</div>}
          </div>
        )}
      </div>

      {/* Preview of copy format */}
      {sources.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            복사 미리보기 ({format})
          </div>
          <pre style={{
            padding: '12px 14px', borderRadius: '8px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace',
            maxHeight: '160px', overflowY: 'auto', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all', margin: 0,
          }}>
            {buildAllText()}
          </pre>
        </div>
      )}
    </div>
  )
}
