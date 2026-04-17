'use client'

import { useState, useEffect, useCallback } from 'react'

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

export function SourcesPanel() {
  const [sources, setSources] = useState<PluginSource[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [format, setFormat] = useState<'plain' | 'markdown' | 'json'>('markdown')
  const [addUrl, setAddUrl] = useState('')
  const [addName, setAddName] = useState('')
  const [addType, setAddType] = useState<'skill' | 'plugin' | 'marketplace'>('skill')
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [updatingUrl, setUpdatingUrl] = useState<string | null>(null)
  const [restartBanner, setRestartBanner] = useState(false)

  const fetchSources = useCallback(async () => {
    try {
      const data = await fetch('/api/plugin-sources').then(r => r.json())
      setSources(data)
    } catch {
      setSources([])
    }
  }, [])

  useEffect(() => {
    fetchSources().finally(() => setLoading(false))
  }, [fetchSources])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchSources()
    setRefreshing(false)
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

    if (format === 'json') return JSON.stringify(sources, null, 2)
    if (format === 'plain') {
      return groups.map(g =>
        `# ${g.label}\n` + g.items.map(s => `${s.name}: ${s.url}`).join('\n')
      ).join('\n\n')
    }
    return groups.map(g =>
      `## ${g.label}\n` + g.items.map(s => `- [${s.name}](${s.url})`).join('\n')
    ).join('\n\n')
  }

  function copyAll() {
    navigator.clipboard.writeText(buildAllText())
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  async function handleInstall() {
    const url = addUrl.trim()
    const name = addName.trim() || url.split('/').pop()?.replace(/\.git$/, '') || url
    if (!url) { setAddError('URL을 입력해주세요.'); return }
    setInstalling(true)
    setAddError(null)
    try {
      const res = await fetch('/api/plugin-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, type: addType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || '설치 실패')
      await fetchSources()
      setAddUrl(''); setAddName(''); setAddError(null); setShowAddForm(false)
      if (data.restartRequired) setRestartBanner(true)
    } catch (e) {
      setAddError(String(e instanceof Error ? e.message : e))
    } finally {
      setInstalling(false)
    }
  }

  async function handleUpdate(s: PluginSource) {
    setUpdatingUrl(s.url)
    try {
      const res = await fetch('/api/plugin-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: s.name, url: s.url, type: s.type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || '업데이트 실패')
      if (data.restartRequired) setRestartBanner(true)
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e))
    } finally {
      setUpdatingUrl(null)
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

  const grouped = {
    marketplace: sources.filter(s => s.type === 'marketplace'),
    plugin: sources.filter(s => s.type === 'plugin'),
    skill: sources.filter(s => s.type === 'skill'),
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

      {/* Restart banner */}
      {restartBanner && (
        <div style={{
          marginBottom: '16px', padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}>
          <span style={{ fontSize: '12px', color: '#d97706', fontWeight: 600 }}>
            설치 완료. Claude Code를 재시작해야 적용됩니다. (/clear 후 재시작)
          </span>
          <button onClick={() => setRestartBanner(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#d97706', flexShrink: 0,
          }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>
            설치된 플러그인 소스
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {loading ? '로딩 중...' : `${sources.length}개 GitHub 저장소`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Refresh button */}
          <button onClick={handleRefresh} disabled={refreshing} title="새로고침" style={{
            padding: '7px 12px', borderRadius: '7px', border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text-muted)', cursor: refreshing ? 'default' : 'pointer',
            fontSize: '13px', opacity: refreshing ? 0.5 : 1,
          }}>
            {refreshing ? '⟳' : '↺'}
          </button>

          {sources.length > 0 && (
            <>
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
            </>
          )}
        </div>
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
              {items.map(s => (
                <div key={s.url} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', borderRadius: '9px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                }}>
                  <span style={{
                    padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                    background: TYPE_COLOR[type], color: TYPE_TEXT[type], flexShrink: 0,
                  }}>{TYPE_LABEL[type]}</span>
                  {s.manual && (
                    <span style={{
                      padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                      background: 'rgba(107,114,128,0.12)', color: 'var(--text-muted)', flexShrink: 0,
                    }}>수동</span>
                  )}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                    {s.name}
                  </span>
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
                  <button onClick={() => copyOne(s.url)} style={{
                    padding: '3px 9px', borderRadius: '5px', border: '1px solid var(--border)',
                    background: 'none', cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                    color: copied === s.url ? 'var(--primary)' : 'var(--text-muted)',
                  }}>
                    {copied === s.url ? '✓' : '복사'}
                  </button>
                  {/* Update (git pull) button — only for github.com URLs */}
                  {s.url.includes('github.com') && (
                    <button
                      onClick={() => handleUpdate(s)}
                      disabled={updatingUrl === s.url}
                      title="git pull로 업데이트"
                      style={{
                        padding: '3px 9px', borderRadius: '5px', border: '1px solid var(--border)',
                        background: 'none', cursor: updatingUrl === s.url ? 'default' : 'pointer',
                        fontSize: '11px', flexShrink: 0,
                        color: updatingUrl === s.url ? 'var(--text-muted)' : '#10b981',
                        opacity: updatingUrl === s.url ? 0.5 : 1,
                      }}
                    >
                      {updatingUrl === s.url ? '...' : '업데이트'}
                    </button>
                  )}
                  {s.manual && (
                    <button onClick={() => handleDelete(s.url)} title="삭제" style={{
                      padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(239,68,68,0.3)',
                      background: 'none', cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                      color: 'rgba(239,68,68,0.7)',
                    }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Install from GitHub */}
      <div style={{ marginTop: '8px' }}>
        <button onClick={() => setShowAddForm(v => !v)} style={{
          fontSize: '12px', color: 'var(--primary)', background: 'none',
          border: '1px dashed rgba(99,102,241,0.4)', borderRadius: '6px',
          padding: '5px 12px', cursor: 'pointer',
        }}>
          {showAddForm ? '✕ 취소' : '+ GitHub에서 설치'}
        </button>
        {showAddForm && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <input
              value={addUrl}
              onChange={e => { setAddUrl(e.target.value); setAddError(null) }}
              placeholder="https://github.com/owner/repo"
              onKeyDown={e => e.key === 'Enter' && !installing && handleInstall()}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="이름 (선택 — URL에서 자동 추출)"
                style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px', outline: 'none' }}
              />
              <select value={addType} onChange={e => setAddType(e.target.value as 'skill' | 'plugin' | 'marketplace')} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}>
                <option value="skill">스킬</option>
                <option value="plugin">플러그인</option>
                <option value="marketplace">마켓플레이스</option>
              </select>
              <button onClick={handleInstall} disabled={installing} style={{
                padding: '7px 14px', borderRadius: '6px', border: 'none',
                background: installing ? 'var(--text-muted)' : 'var(--primary)',
                color: '#fff', fontSize: '12px', fontWeight: 600,
                cursor: installing ? 'default' : 'pointer', minWidth: '60px',
              }}>
                {installing ? '설치 중...' : 'git clone'}
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              git clone으로 실제 설치됩니다. 완료 후 Claude Code 재시작 필요.
            </div>
            {addError && <div style={{ fontSize: '11px', color: '#ef4444' }}>{addError}</div>}
          </div>
        )}
      </div>

      {/* Preview of copy format */}
      {sources.length > 0 && (
        <div style={{ marginTop: '16px' }}>
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
