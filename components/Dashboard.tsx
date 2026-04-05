'use client'

import { useState, useMemo, useCallback } from 'react'
import Fuse from 'fuse.js'
import { SkillEntry, Filters } from '@/lib/types'
import { SearchBar } from './SearchBar'
import { FilterPanel } from './FilterPanel'
import { SkillCard } from './SkillCard'
import { StatsBar } from './StatsBar'
import { AIPanel } from './AIPanel'

type Mode = 'browse' | 'ai'

const PAGE_SIZE = 60

interface Props {
  skills: SkillEntry[]
}

export function Dashboard({ skills }: Props) {
  const [mode, setMode] = useState<Mode>('browse')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({
    plugins: [],
    classifications: [],
    pdcaPhases: [],
    userInvocableOnly: false,
  })
  const [page, setPage] = useState(1)

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
        result = fuse.search(query).map(r => r.item)
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

    return result
  }, [query, filters, fuse, skills])

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
          {(['browse', 'ai'] as Mode[]).map(m => (
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
              {m === 'browse' ? '🔍 탐색' : '✨ AI 추천'}
            </button>
          ))}
        </div>

        {mode === 'browse' && <SearchBar value={query} onChange={handleQueryChange} />}
        <StatsBar all={skills} filtered={filtered} />
      </header>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {mode === 'ai' ? (
          <main style={{ flex: 1, overflowY: 'auto' }}>
            <AIPanel />
          </main>
        ) : (
        <>
        {/* Sidebar */}
        <div style={{ overflowY: 'auto', padding: '16px', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          <FilterPanel skills={skills} filters={filters} onChange={handleFiltersChange} />
        </div>

        {/* Grid */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '16px', marginBottom: '6px' }}>No skills found</div>
              <div style={{ fontSize: '13px' }}>Try a different search or clear filters</div>
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '12px',
              }}>
                {paged.map(skill => (
                  <SkillCard key={`${skill.pluginName}:${skill.name}`} skill={skill} />
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
