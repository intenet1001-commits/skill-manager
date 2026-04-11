'use client'

import { useMemo, useState } from 'react'
import { Filters, SkillEntry } from '@/lib/types'

const PDCA_PHASES = ['pm', 'plan', 'design', 'do', 'check', 'act', 'report']
const CLASSIFICATIONS = ['workflow', 'capability', 'hybrid', 'internal']

const PHASE_COLORS: Record<string, string> = {
  pm: '#f97316', plan: '#0ea5e9', design: '#a855f7',
  do: '#22c55e', check: '#eab308', act: '#ef4444', report: '#6366f1',
}
const CLASS_COLORS: Record<string, string> = {
  workflow: '#a855f7', capability: '#3b82f6', hybrid: '#10b981', internal: '#6b7280',
}

interface Props {
  skills: SkillEntry[]
  filters: Filters
  onChange: (f: Filters) => void
}

function Pill({ label, active, color, count, onClick }: {
  label: string; active: boolean; color?: string; count?: number; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 500,
      border: `1px solid ${active ? (color || 'var(--primary)') : 'var(--border)'}`,
      background: active ? `${color || 'var(--primary)'}22` : 'transparent',
      color: active ? (color || 'var(--primary)') : 'var(--text-muted)',
      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: '4px',
    }}>
      {label}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: '10px', opacity: 0.75 }}>{count}</span>
      )}
    </button>
  )
}

function SectionLabel({ text, count, onClear }: { text: string; count?: number; onClear?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {text}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: '10px', fontWeight: 700,
          background: 'var(--primary)', color: '#fff',
          padding: '0 5px', borderRadius: '99px', lineHeight: '16px',
        }}>{count}</span>
      )}
      {onClear && count !== undefined && count > 0 && (
        <button
          onClick={onClear}
          style={{
            marginLeft: 'auto', fontSize: '10px', color: 'var(--primary)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >모두 해제</button>
      )}
    </div>
  )
}

export function FilterPanel({ skills, filters, onChange }: Props) {
  const [pluginOpen, setPluginOpen] = useState(true)
  const [pluginSearch, setPluginSearch] = useState('')

  const allPlugins = useMemo(() =>
    Array.from(new Set(skills.map(s => s.pluginName))).sort((a, b) => {
      if (a === 'standalone') return 1
      if (b === 'standalone') return -1
      return a.localeCompare(b)
    }),
    [skills]
  )

  const allMarketplaces = useMemo(() =>
    Array.from(new Set(skills.map(s => s.marketplace).filter(Boolean))).sort((a, b) => {
      const ca = skills.filter(s => s.marketplace === a).length
      const cb = skills.filter(s => s.marketplace === b).length
      return cb - ca  // sort by count desc
    }),
    [skills]
  )

  const agentCount = useMemo(() => skills.filter(s => s.agent !== null && s.agent !== '').length, [skills])

  function togglePlugin(p: string) {
    const next = filters.plugins.includes(p) ? filters.plugins.filter(x => x !== p) : [...filters.plugins, p]
    onChange({ ...filters, plugins: next })
  }
  function togglePhase(p: string) {
    const next = filters.pdcaPhases.includes(p) ? filters.pdcaPhases.filter(x => x !== p) : [...filters.pdcaPhases, p]
    onChange({ ...filters, pdcaPhases: next })
  }
  function toggleClass(c: string) {
    const next = filters.classifications.includes(c) ? filters.classifications.filter(x => x !== c) : [...filters.classifications, c]
    onChange({ ...filters, classifications: next })
  }
  function toggleMarketplace(m: string) {
    const next = filters.marketplaces.includes(m) ? filters.marketplaces.filter(x => x !== m) : [...filters.marketplaces, m]
    onChange({ ...filters, marketplaces: next })
  }

  const hasFilters =
    filters.plugins.length > 0 || filters.pdcaPhases.length > 0 ||
    filters.classifications.length > 0 || filters.marketplaces.length > 0 ||
    filters.userInvocableOnly || filters.agentTeamsOnly

  const filteredPlugins = useMemo(() =>
    allPlugins.filter(p => !pluginSearch || p.toLowerCase().includes(pluginSearch.toLowerCase())),
    [allPlugins, pluginSearch]
  )

  return (
    <aside style={{
      width: '220px', flexShrink: 0,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '10px',
      display: 'flex', flexDirection: 'column', gap: '0',
      alignSelf: 'flex-start', position: 'sticky', top: '16px',
      overflowY: 'auto', maxHeight: 'calc(100vh - 48px)',
    }}>

      {/* Sticky header — always visible even when sidebar is scrolled */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: 'var(--surface)',
        borderBottom: hasFilters ? '1px solid var(--border)' : 'none',
        padding: '14px 14px 10px',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>필터</span>
          {hasFilters && (
            <button
              onClick={() => onChange({ plugins: [], classifications: [], pdcaPhases: [], marketplaces: [], userInvocableOnly: false, agentTeamsOnly: false })}
              style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >초기화</button>
          )}
        </div>

        {/* Active filter chips summary */}
        {hasFilters && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {filters.userInvocableOnly && (
              <span style={chipStyle} onClick={() => onChange({ ...filters, userInvocableOnly: false })}>
                호출 가능 ✕
              </span>
            )}
            {filters.agentTeamsOnly && (
              <span style={chipStyle} onClick={() => onChange({ ...filters, agentTeamsOnly: false })}>
                Agent Teams ✕
              </span>
            )}
            {filters.pdcaPhases.map(p => (
              <span key={p} style={{ ...chipStyle, borderColor: `${PHASE_COLORS[p]}66`, color: PHASE_COLORS[p], background: `${PHASE_COLORS[p]}18` }}
                onClick={() => togglePhase(p)}>
                {p} ✕
              </span>
            ))}
            {filters.classifications.map(c => (
              <span key={c} style={{ ...chipStyle, borderColor: `${CLASS_COLORS[c]}66`, color: CLASS_COLORS[c], background: `${CLASS_COLORS[c]}18` }}
                onClick={() => toggleClass(c)}>
                {c} ✕
              </span>
            ))}
            {filters.marketplaces.map(m => (
              <span key={m} style={chipStyle} onClick={() => toggleMarketplace(m)}>
                {m} ✕
              </span>
            ))}
            {filters.plugins.map(p => (
              <span key={p} style={chipStyle} onClick={() => togglePlugin(p)}>
                {p} ✕
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable filter content */}
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Toggles — compact 2-column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <ToggleRow
          checked={filters.userInvocableOnly}
          onChange={() => onChange({ ...filters, userInvocableOnly: !filters.userInvocableOnly })}
          label="호출 가능 스킬만"
        />
        <ToggleRow
          checked={filters.agentTeamsOnly}
          onChange={() => onChange({ ...filters, agentTeamsOnly: !filters.agentTeamsOnly })}
          label={`Agent Teams (${agentCount})`}
        />
      </div>

      <Divider />

      {/* Source (marketplace) — pill style, sorted by count */}
      {allMarketplaces.length > 0 && (
        <div>
          <SectionLabel text="소스" count={filters.marketplaces.length} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {allMarketplaces.map(m => {
              const count = skills.filter(s => s.marketplace === m).length
              return (
                <Pill
                  key={m}
                  label={m}
                  active={filters.marketplaces.includes(m)}
                  count={count}
                  onClick={() => toggleMarketplace(m)}
                />
              )
            })}
          </div>
        </div>
      )}

      <Divider />

      {/* PDCA Phase */}
      <div>
        <SectionLabel text="PDCA Phase" count={filters.pdcaPhases.length} onClear={() => onChange({ ...filters, pdcaPhases: [] })} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {PDCA_PHASES.map(p => (
            <Pill key={p} label={p} active={filters.pdcaPhases.includes(p)} color={PHASE_COLORS[p]} onClick={() => togglePhase(p)} />
          ))}
        </div>
      </div>

      <Divider />

      {/* Classification */}
      <div>
        <SectionLabel text="분류" count={filters.classifications.length} onClear={() => onChange({ ...filters, classifications: [] })} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {CLASSIFICATIONS.map(c => (
            <Pill key={c} label={c} active={filters.classifications.includes(c)} color={CLASS_COLORS[c]} onClick={() => toggleClass(c)} />
          ))}
        </div>
      </div>

      <Divider />

      {/* Plugin — collapsible with search */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: pluginOpen ? '8px' : 0 }}>
          <button
            onClick={() => setPluginOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, flex: 1,
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Plugin</span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>({allPlugins.length})</span>
            {filters.plugins.length > 0 && (
              <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--primary)', color: '#fff', padding: '0 5px', borderRadius: '99px', lineHeight: '16px' }}>
                {filters.plugins.length}/{allPlugins.length}
              </span>
            )}
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: 'auto' }}>{pluginOpen ? '▲' : '▼'}</span>
          </button>
          {pluginOpen && (
            <button
              onClick={e => {
                e.stopPropagation()
                const allSelected = filteredPlugins.length > 0 &&
                  filteredPlugins.every(p => filters.plugins.includes(p))
                const next = allSelected
                  ? filters.plugins.filter(p => !filteredPlugins.includes(p))
                  : Array.from(new Set([...filters.plugins, ...filteredPlugins]))
                onChange({ ...filters, plugins: next })
              }}
              style={{
                fontSize: '10px', color: 'var(--primary)', background: 'none',
                border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {filteredPlugins.every(p => filters.plugins.includes(p)) && filteredPlugins.length > 0
                ? '전체 해제' : '전체 선택'}
            </button>
          )}
        </div>

        {pluginOpen && (
          <>
            <input
              value={pluginSearch}
              onChange={e => setPluginSearch(e.target.value)}
              placeholder="플러그인 검색..."
              style={{
                width: '100%', padding: '5px 8px', borderRadius: '6px', boxSizing: 'border-box',
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: '11px', outline: 'none', marginBottom: '6px',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {filteredPlugins.map(p => {
                const count = skills.filter(s => s.pluginName === p).length
                const active = filters.plugins.includes(p)
                return (
                  <label key={p} style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    cursor: 'pointer', padding: '3px 4px', borderRadius: '5px',
                    background: active ? 'rgba(99,102,241,0.07)' : 'none',
                    transition: 'background 0.1s',
                  }}>
                    {/* Custom checkbox: hidden native input preserves keyboard/focus; styled div is the visual */}
                    <div style={{ position: 'relative', width: '13px', height: '13px', flexShrink: 0 }}>
                      <input type="checkbox" checked={active} onChange={() => togglePlugin(p)}
                        style={{ position: 'absolute', opacity: 0, inset: 0, width: '100%', height: '100%', cursor: 'pointer', margin: 0 }} />
                      <div style={{
                        width: '13px', height: '13px', borderRadius: '3px',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border-2)'}`,
                        background: active ? 'var(--primary)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s', pointerEvents: 'none',
                      }}>
                        {active && <span style={{ color: '#fff', fontSize: '9px', lineHeight: 1, fontWeight: 700 }}>✓</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: active ? 'var(--text)' : 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0 }}>{count}</span>
                  </label>
                )
              })}
              {filteredPlugins.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', padding: '4px' }}>검색 결과 없음</div>
              )}
            </div>
          </>
        )}
      </div>

      </div>{/* end scrollable content */}
    </aside>
  )
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '3px',
  padding: '2px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: 500,
  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
  color: 'var(--primary)', cursor: 'pointer', userSelect: 'none',
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
      <button
        role="switch" aria-checked={checked} onClick={onChange}
        style={{
          width: '30px', height: '17px', borderRadius: '9px',
          background: checked ? 'var(--primary)' : 'var(--border-2)',
          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
          flexShrink: 0, border: 'none', padding: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: '2px',
          left: checked ? '15px' : '2px',
          width: '13px', height: '13px', borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
        }} />
      </button>
      <span style={{ fontSize: '12px', color: checked ? 'var(--text)' : 'var(--text-muted)', userSelect: 'none' }}>{label}</span>
    </label>
  )
}

function Divider() {
  return <div style={{ height: '1px', background: 'var(--border)', margin: '-4px 0' }} />
}
