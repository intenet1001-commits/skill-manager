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

type Mode = 'browse' | 'ai' | 'sources'

const PAGE_SIZE = 60

type SortKey = 'name' | 'plugin' | 'phase'

const QUICK_SEARCHES = [
  { label: '커밋', q: '커밋' }, { label: '코드리뷰', q: '코드리뷰' },
  { label: 'deploy', q: 'deploy' }, { label: 'test', q: 'test' },
  { label: 'security', q: 'security' }, { label: 'debug', q: 'debug' },
  { label: 'git', q: 'git' }, { label: 'document', q: 'document' },
]

// Korean → English keyword map for search
const KO_EN: Record<string, string> = {
  '코드': 'code', '리뷰': 'review', '커밋': 'commit', '배포': 'deploy',
  '테스트': 'test', '빌드': 'build', '디버그': 'debug', '버그': 'bug',
  '리팩터': 'refactor', '문서': 'document', '보안': 'security',
  '풀리퀘': 'pull request', '깃': 'git', '분석': 'analyze',
  '자동화': 'automation', '설계': 'design', '아키텍처': 'architecture',
  '테스팅': 'testing', '검색': 'search', '인증': 'auth', '데이터': 'data',
  '브랜치': 'branch', '머지': 'merge', '성능': 'performance', '최적화': 'optimize',
  '코드리뷰': 'code review', '에이전트': 'agent', '스킬': 'skill',
}

function translateQuery(q: string): string {
  let out = q
  for (const [ko, en] of Object.entries(KO_EN)) {
    out = out.replace(new RegExp(ko, 'g'), en)
  }
  return out
}

interface Props {
  skills: SkillEntry[]
}

export function Dashboard({ skills }: Props) {
  const [mode, setMode] = useState<Mode>('browse')
  const [query, setQuery] = useState('')
  const [showPalette, setShowPalette] = useState(false)
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

  const paged = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = filtered.length > paged.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {showPalette && <CommandPalette skills={skills} onClose={() => setShowPalette(false)} />}
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '18px' }}>🎯</span>
          <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>Skill Manager</span>
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

        {mode === 'browse' && <SearchBar value={query} onChange={handleQueryChange} />}
        <button
          onClick={() => setShowPalette(true)}
          title="Command palette (⌘K)"
          style={{
            padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: '11px',
            cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          ⌘K
        </button>
        <StatsBar all={skills} filtered={filtered} />
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
              <button key={q} onClick={() => { handleQueryChange(q); setPage(1) }}
                style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 500,
                  border: `1px solid ${query === q ? 'var(--primary)' : 'var(--border)'}`,
                  background: query === q ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: query === q ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{label}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>정렬:</span>
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

          {filtered.length === 0 ? (
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
                {paged.map(skill => (
                  <SkillCard key={`${skill.pluginName}:${skill.name}`} skill={skill} onRun={handleRunSkill} />
                ))}
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
    </div>
  )
}
