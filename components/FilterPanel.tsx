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

export function FilterPanel({ skills, filters, onChange }: Props) {
  const allPlugins = Array.from(new Set(skills.map(s => s.pluginName))).sort((a, b) => {
    if (a === 'standalone') return 1
    if (b === 'standalone') return -1
    return a.localeCompare(b)
  })

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

  const hasFilters =
    filters.plugins.length > 0 ||
    filters.pdcaPhases.length > 0 ||
    filters.classifications.length > 0 ||
    filters.userInvocableOnly

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
      gap: '20px',
      alignSelf: 'flex-start',
      position: 'sticky',
      top: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Filters</span>
        {hasFilters && (
          <button
            onClick={() => onChange({ plugins: [], classifications: [], pdcaPhases: [], userInvocableOnly: false })}
            style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* User invocable toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)' }}>
        <button
          role="switch"
          aria-checked={filters.userInvocableOnly}
          onClick={() => onChange({ ...filters, userInvocableOnly: !filters.userInvocableOnly })}
          style={{
            width: '32px', height: '18px', borderRadius: '9px',
            background: filters.userInvocableOnly ? 'var(--primary)' : 'var(--border-2)',
            position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
            border: 'none', padding: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: '2px',
            left: filters.userInvocableOnly ? '16px' : '2px',
            width: '14px', height: '14px', borderRadius: '50%',
            background: 'white', transition: 'left 0.2s',
          }} />
        </button>
        User-invocable only
      </label>

      {/* PDCA Phase */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          PDCA Phase
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PDCA_PHASES.map(p => (
            <Pill
              key={p}
              label={p}
              active={filters.pdcaPhases.includes(p)}
              color={PHASE_COLORS[p]}
              onClick={() => togglePhase(p)}
            />
          ))}
        </div>
      </div>

      {/* Classification */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          Classification
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {CLASSIFICATIONS.map(c => (
            <Pill
              key={c}
              label={c}
              active={filters.classifications.includes(c)}
              color={CLASS_COLORS[c]}
              onClick={() => toggleClass(c)}
            />
          ))}
        </div>
      </div>

      {/* Plugin */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          Plugin
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
          {allPlugins.map(p => {
            const count = skills.filter(s => s.pluginName === p).length
            const active = filters.plugins.includes(p)
            return (
              <label
                key={p}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  cursor: 'pointer', padding: '3px 0',
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => togglePlugin(p)}
                  style={{ accentColor: 'var(--primary)', width: '13px', height: '13px', flexShrink: 0 }}
                />
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
