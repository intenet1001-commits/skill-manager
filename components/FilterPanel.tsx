'use client'

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

// Quick-select marketplace groups
const QUICK_MARKETPLACES: Array<{ label: string; marketplaces: string[] }> = [
  { label: 'cs-plugins', marketplaces: ['cs-plugins'] },
  { label: 'nh-plugins', marketplaces: ['nh-plugins'] },
  { label: 'bkit', marketplaces: ['bkit-marketplace'] },
  { label: 'omc', marketplaces: ['omc'] },
  { label: 'impeccable', marketplaces: ['impeccable'] },
  { label: '📁 local', marketplaces: ['local'] },
]

interface Props {
  skills: SkillEntry[]
  filters: Filters
  onChange: (f: Filters) => void
}

function Pill({
  label, active, color, onClick,
}: {
  label: string; active: boolean; color?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 500,
        border: `1px solid ${active ? (color || 'var(--primary)') : 'var(--border)'}`,
        background: active ? `${color || 'var(--primary)'}22` : 'transparent',
        color: active ? (color || 'var(--primary)') : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: checked ? 'var(--text)' : 'var(--text-muted)' }}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        style={{
          width: '32px', height: '18px', borderRadius: '9px',
          background: checked ? 'var(--primary)' : 'var(--border-2)',
          position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
          border: 'none', padding: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: '2px',
          left: checked ? '16px' : '2px',
          width: '14px', height: '14px', borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
        }} />
      </button>
      {label}
    </label>
  )
}

export function FilterPanel({ skills, filters, onChange }: Props) {
  const allPlugins = Array.from(new Set(skills.map(s => s.pluginName))).sort((a, b) => {
    if (a === 'standalone') return 1
    if (b === 'standalone') return -1
    return a.localeCompare(b)
  })

  // Derive all marketplaces from skills data
  const allMarketplaces = Array.from(new Set(skills.map(s => s.marketplace).filter(Boolean))).sort()

  const agentCount = skills.filter(s => s.agent !== null && s.agent !== '').length

  function togglePlugin(p: string) {
    const next = filters.plugins.includes(p)
      ? filters.plugins.filter(x => x !== p)
      : [...filters.plugins, p]
    onChange({ ...filters, plugins: next })
  }

  function togglePhase(p: string) {
    const next = filters.pdcaPhases.includes(p)
      ? filters.pdcaPhases.filter(x => x !== p)
      : [...filters.pdcaPhases, p]
    onChange({ ...filters, pdcaPhases: next })
  }

  function toggleClass(c: string) {
    const next = filters.classifications.includes(c)
      ? filters.classifications.filter(x => x !== c)
      : [...filters.classifications, c]
    onChange({ ...filters, classifications: next })
  }

  function toggleMarketplace(m: string) {
    const next = filters.marketplaces.includes(m)
      ? filters.marketplaces.filter(x => x !== m)
      : [...filters.marketplaces, m]
    onChange({ ...filters, marketplaces: next })
  }

  function setQuickMarketplace(marketplaces: string[]) {
    // If all already selected, deselect
    const allSelected = marketplaces.every(m => filters.marketplaces.includes(m))
    const next = allSelected
      ? filters.marketplaces.filter(m => !marketplaces.includes(m))
      : Array.from(new Set([...filters.marketplaces, ...marketplaces]))
    onChange({ ...filters, marketplaces: next })
  }

  const hasFilters =
    filters.plugins.length > 0 ||
    filters.pdcaPhases.length > 0 ||
    filters.classifications.length > 0 ||
    filters.marketplaces.length > 0 ||
    filters.userInvocableOnly ||
    filters.agentTeamsOnly

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
      {text}
    </div>
  )

  return (
    <aside style={{
      width: '220px',
      flexShrink: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      alignSelf: 'flex-start',
      position: 'sticky',
      top: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Filters</span>
        {hasFilters && (
          <button
            onClick={() => onChange({ plugins: [], classifications: [], pdcaPhases: [], marketplaces: [], userInvocableOnly: false, agentTeamsOnly: false })}
            style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Toggle
          checked={filters.userInvocableOnly}
          onChange={() => onChange({ ...filters, userInvocableOnly: !filters.userInvocableOnly })}
          label="User-invocable only"
        />
        <Toggle
          checked={filters.agentTeamsOnly}
          onChange={() => onChange({ ...filters, agentTeamsOnly: !filters.agentTeamsOnly })}
          label={`Agent Teams (${agentCount})`}
        />
      </div>

      {/* Quick marketplace shortcuts */}
      <div>
        {sectionLabel('빠른 선택')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {QUICK_MARKETPLACES.filter(q =>
            q.marketplaces.some(m => allMarketplaces.includes(m))
          ).map(q => {
            const active = q.marketplaces.every(m => filters.marketplaces.includes(m))
            const count = skills.filter(s => q.marketplaces.includes(s.marketplace)).length
            return (
              <button
                key={q.label}
                onClick={() => setQuickMarketplace(q.marketplaces)}
                style={{
                  padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 500,
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {q.label} {count > 0 && <span style={{ opacity: 0.7 }}>{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* PDCA Phase */}
      <div>
        {sectionLabel('PDCA Phase')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PDCA_PHASES.map(p => (
            <Pill key={p} label={p} active={filters.pdcaPhases.includes(p)} color={PHASE_COLORS[p]} onClick={() => togglePhase(p)} />
          ))}
        </div>
      </div>

      {/* Classification */}
      <div>
        {sectionLabel('Classification')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {CLASSIFICATIONS.map(c => (
            <Pill key={c} label={c} active={filters.classifications.includes(c)} color={CLASS_COLORS[c]} onClick={() => toggleClass(c)} />
          ))}
        </div>
      </div>

      {/* Marketplace source */}
      {allMarketplaces.length > 0 && (
        <div>
          {sectionLabel('소스 (마켓플레이스)')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
            {allMarketplaces.map(m => {
              const count = skills.filter(s => s.marketplace === m).length
              const active = filters.marketplaces.includes(m)
              return (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '2px 0' }}>
                  <input type="checkbox" checked={active} onChange={() => toggleMarketplace(m)}
                    style={{ accentColor: 'var(--primary)', width: '13px', height: '13px', flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: active ? 'var(--text)' : 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{count}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Plugin */}
      <div>
        {sectionLabel('Plugin')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
          {allPlugins.map(p => {
            const count = skills.filter(s => s.pluginName === p).length
            const active = filters.plugins.includes(p)
            return (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '3px 0' }}>
                <input type="checkbox" checked={active} onChange={() => togglePlugin(p)}
                  style={{ accentColor: 'var(--primary)', width: '13px', height: '13px', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: active ? 'var(--text)' : 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{count}</span>
              </label>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
