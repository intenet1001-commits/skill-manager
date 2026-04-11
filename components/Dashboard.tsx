'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Fuse from 'fuse.js'
import { SkillEntry, Filters } from '@/lib/types'
import { SearchBar } from './SearchBar'
import { FilterPanel } from './FilterPanel'
import { SkillCard } from './SkillCard'
import { StatsBar } from './StatsBar'
import { AIPanel } from './AIPanel'
import { SourcesPanel } from './SourcesPanel'
import { CommandPalette } from './CommandPalette'
import { HelpModal } from './HelpModal'
import { ClaudeAuthTip } from './ClaudeAuthTip'

type Mode = 'browse' | 'ai' | 'sources'

const PAGE_SIZE = 60

type SortKey = 'name' | 'plugin' | 'phase'

const QUICK_SEARCHES = [
  { label: '커밋', q: '커밋' }, { label: '코드리뷰', q: '코드리뷰' },
  { label: 'deploy', q: 'deploy' }, { label: 'test', q: 'test' },
  { label: 'security', q: 'security' }, { label: 'debug', q: 'debug' },
  { label: 'git', q: 'git' }, { label: 'document', q: 'document' },
]

import { translateQuery } from '@/lib/ko-en'

export function Dashboard() {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loadingSkills, setLoadingSkills] = useState(true)
  const [mode, setMode] = useState<Mode>('browse')
  const [query, setQuery] = useState('')
  const [showPalette, setShowPalette] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    plugins: [],
    classifications: [],
    pdcaPhases: [],
    marketplaces: [],
    userInvocableOnly: false,
    agentTeamsOnly: false,
  })
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortKey>('name')

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copyAllDone, setCopyAllDone] = useState(false)

  useEffect(() => {
    // 1. Load immediately from disk (no browser cache)
    fetch('/skills-index.json', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: SkillEntry[]) => { setSkills(data); setLoadingSkills(false) })
      .catch(() => setLoadingSkills(false))

    // 2. Background rebuild: silently re-scan filesystem and update state if anything changed
    //    This ensures deleted/added skills are reflected on every page load without manual ↺
    fetch('/api/build-index', { method: 'POST' })
      .then(r => r.json())
      .then(result => {
        if (!result.unchanged) {
          // Index changed → re-fetch updated file and replace state (no full page reload)
          fetch('/skills-index.json', { cache: 'no-store' })
            .then(r => r.json())
            .then((data: SkillEntry[]) => setSkills(data))
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  const fuse = useMemo(() => new Fuse(skills, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'invocationCommand', weight: 2 },
      { name: 'triggers', weight: 2 },
      { name: 'description', weight: 1 },
    ],
    threshold: 0.35,
    includeScore: true,
  }), [skills])

  const filtered = useMemo(() => {
    let result: SkillEntry[]

    if (query.trim()) {
      try {
        const translated = translateQuery(query.trim())
        // Search with both original and translated query, merge + deduplicate
        const seen = new Set<string>()
        const merge = (items: SkillEntry[]) => {
          for (const s of items) if (!seen.has(s.name + s.pluginName)) { seen.add(s.name + s.pluginName); result.push(s) }
        }
        result = []
        if (translated !== query.trim()) merge(fuse.search(translated).map(r => r.item))
        merge(fuse.search(query.trim()).map(r => r.item))
        if (result.length === 0) {
          result = skills.filter(s =>
            s.name.includes(query) || s.description.includes(query)
          )
        }
      } catch {
        result = skills.filter(s =>
          s.name.includes(query) || s.description.includes(query)
        )
      }
    } else {
      result = skills
    }

    if (filters.plugins.length > 0) {
      result = result.filter(s => filters.plugins.includes(s.pluginName))
    }
    if (filters.classifications.length > 0) {
      result = result.filter(s => s.classification && filters.classifications.includes(s.classification))
    }
    if (filters.pdcaPhases.length > 0) {
      result = result.filter(s => s.pdcaPhase && filters.pdcaPhases.includes(s.pdcaPhase))
    }
    if (filters.userInvocableOnly) {
      result = result.filter(s => s.userInvocable)
    }
    if (filters.agentTeamsOnly) {
      result = result.filter(s => s.agent !== null && s.agent !== '')
    }
    if (filters.marketplaces.length > 0) {
      result = result.filter(s => filters.marketplaces.includes(s.marketplace))
    }

    // Sort — skip when sort='name' with no query (JSON is already sorted by build-index)
    if (sort !== 'name' || query.trim()) {
      // Use simple comparison (not localeCompare) for SSR/client consistency
      const cmp = (x: string, y: string) => x < y ? -1 : x > y ? 1 : 0
      result = [...result].sort((a, b) => {
        if (sort === 'plugin') return cmp(a.pluginName, b.pluginName) || cmp(a.name, b.name)
        if (sort === 'phase') return cmp(a.pdcaPhase || 'zzz', b.pdcaPhase || 'zzz') || cmp(a.name, b.name)
        return cmp(a.name, b.name)
      })
    }

    return result
  }, [query, filters, fuse, skills, sort])

  // Cmd+K / Ctrl+K to open command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowPalette(p => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function handleRunSkill(cmd: string) {
    try {
      await fetch('/api/run-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmds: [cmd], skipPerms: false }),
      })
    } catch { /* ignore — iTerm opens regardless */ }
  }

  const handleQueryChange = useCallback((v: string) => {
    setQuery(v)
    setPage(1)
  }, [])

  const handleFiltersChange = useCallback((f: Filters) => {
    setFilters(f)
    setPage(1)
  }, [])

  const skillByKey = useMemo(() => {
    const m = new Map<string, SkillEntry>()
    for (const s of skills) m.set(`${s.pluginName}:${s.name}`, s)
    return m
  }, [skills])

  const toggleSelected = useCallback((key: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }, [])

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) setSelected(new Set())
      return !prev
    })
  }, [])

  const copySelected = useCallback(() => {
    const cmds = [...selected]
      .map(k => skillByKey.get(k)?.invocationCommand)
      .filter((c): c is string => Boolean(c))
      .join('\n')
    navigator.clipboard.writeText(cmds).then(() => {
      setCopyAllDone(true)
      setTimeout(() => setCopyAllDone(false), 1500)
    }).catch(() => {})
  }, [selected, skillByKey])

  const paged = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = filtered.length > paged.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {showPalette && <CommandPalette skills={skills} fuse={fuse} onClose={() => setShowPalette(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '10px 20px',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {/* Row 1: logo + tabs + search + ⌘K hint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '18px' }}>🎯</span>
            <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>Skill Manager</span>
            <ClaudeAuthTip />
          </div>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: '2px', padding: '3px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', flexShrink: 0 }}>
            {(['browse', 'ai', 'sources'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: mode === m ? 600 : 400,
                  background: mode === m ? 'var(--primary)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'browse' ? '🔍 탐색' : m === 'ai' ? '✨ AI 추천' : '🔗 플러그인 소스'}
              </button>
            ))}
          </div>

          {/* SearchBar always visible; disabled in non-browse modes */}
          <div style={{ flex: 1 }}>
            <SearchBar
              value={query}
              onChange={handleQueryChange}
              disabled={mode !== 'browse'}
              placeholder={mode === 'browse' ? 'Search skills by name, description, or trigger...' : '탐색 모드에서 검색할 수 있어요'}
            />
          </div>

          {/* ⌘K hint chip */}
          <button
            onClick={() => setShowPalette(true)}
            title="Command palette (⌘K)"
            style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text-dim)', fontSize: '11px',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            ⌘K
          </button>

          {/* Help button */}
          <button
            onClick={() => setShowHelp(true)}
            title="사용 가이드"
            style={{
              padding: '4px 9px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: '13px',
              cursor: 'pointer', flexShrink: 0, fontWeight: 600,
            }}
          >
            ?
          </button>
        </div>

        {/* Row 2: StatsBar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
          <StatsBar all={skills} filtered={filtered} />
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {mode === 'ai' ? (
          <main style={{ flex: 1, overflowY: 'auto' }}>
            <AIPanel />
          </main>
        ) : mode === 'sources' ? (
          <main style={{ flex: 1, overflowY: 'auto' }}>
            <SourcesPanel />
          </main>
        ) : (
        <>
        {/* Sidebar */}
        <div style={{ overflowY: 'auto', padding: '16px', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          <FilterPanel skills={skills} filters={filters} onChange={handleFiltersChange} />
        </div>

        {/* Grid */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px', scrollbarGutter: 'stable' }}>

          {/* Quick search chips + sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', flexShrink: 0 }}>빠른 검색:</span>
            {QUICK_SEARCHES.map(({ label, q }) => (
              <button key={q} onClick={() => handleQueryChange(query === q ? '' : q)}
                style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 500,
                  border: `1px solid ${query === q ? 'var(--primary)' : 'var(--border)'}`,
                  background: query === q ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: query === q ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{label}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Selection mode toggle */}
              <button
                onClick={toggleSelectionMode}
                style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
                  border: `1px solid ${selectionMode ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectionMode ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: selectionMode ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                title="여러 스킬을 선택해서 복사하기"
              >
                {selectionMode ? `☑ ${selected.size}개 선택` : '☐ 선택'}
              </button>
              {selectionMode && selected.size > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  style={{
                    padding: '3px 8px', borderRadius: '6px', fontSize: '11px',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-dim)', cursor: 'pointer',
                  }}
                >해제</button>
              )}
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>정렬:</span>
              {(['name', 'plugin', 'phase'] as SortKey[]).map(k => (
                <button key={k} onClick={() => setSort(k)}
                  style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: sort === k ? 600 : 400,
                    border: `1px solid ${sort === k ? 'var(--primary)' : 'var(--border)'}`,
                    background: sort === k ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: sort === k ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}>{k === 'name' ? '이름' : k === 'plugin' ? '플러그인' : '페이즈'}</button>
              ))}
            </div>
          </div>

          {loadingSkills ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '13px' }}>스킬 로딩 중…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '16px', marginBottom: '6px', color: 'var(--text)' }}>No skills found</div>
              <div style={{ fontSize: '13px', marginBottom: '16px' }}>Try a different search or clear filters</div>
              {(query || filters.plugins.length > 0 || filters.classifications.length > 0 || filters.pdcaPhases.length > 0 || filters.userInvocableOnly || filters.agentTeamsOnly || filters.marketplaces.length > 0) && (
                <button
                  onClick={() => { handleQueryChange(''); handleFiltersChange({ plugins: [], classifications: [], pdcaPhases: [], marketplaces: [], userInvocableOnly: false, agentTeamsOnly: false }) }}
                  style={{
                    padding: '7px 18px', borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'var(--surface)', color: 'var(--text)', fontSize: '13px',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
                gap: '12px',
              }}>
                {paged.map(skill => {
                  const cardKey = `${skill.pluginName}:${skill.name}`
                  return (
                    <SkillCard
                      key={cardKey}
                      skill={skill}
                      onRun={handleRunSkill}
                      selectionMode={selectionMode}
                      isSelected={selected.has(cardKey)}
                      onToggleSelect={() => toggleSelected(cardKey)}
                    />
                  )
                })}
              </div>
              {hasMore && (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      padding: '8px 24px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Load more ({filtered.length - paged.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </main>
        </>
        )}
      </div>

      {/* Floating multi-select action bar */}
      {selectionMode && selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="선택 액션"
          style={{
            position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '999px',
            background: 'var(--surface)', border: '1px solid var(--primary)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            zIndex: 100, whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
            ✓ {selected.size}개 선택됨
          </span>
          <button
            onClick={copySelected}
            style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              background: copyAllDone ? '#22c55e22' : 'var(--primary)',
              color: copyAllDone ? '#22c55e' : '#fff',
              border: copyAllDone ? '1px solid #22c55e44' : 'none',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {copyAllDone ? '✓ 복사됨' : '📋 모두 복사'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            ✕ 해제
          </button>
        </div>
      )}
    </div>
  )
}
