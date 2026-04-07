'use client'

import { useState } from 'react'
import { SkillEntry } from '@/lib/types'



const PHASE_COLORS: Record<string, string> = {
  pm: '#f97316', plan: '#0ea5e9', design: '#a855f7',
  do: '#22c55e', check: '#eab308', act: '#ef4444', report: '#6366f1',
}
const CLASS_COLORS: Record<string, string> = {
  workflow: '#a855f7', capability: '#3b82f6', hybrid: '#10b981', internal: '#6b7280',
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 500,
      background: color + '22', color, border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

interface Props {
  skill: SkillEntry
  onRun?: (cmd: string) => void
}

export function SkillCard({ skill, onRun }: Props) {
  const [copied, setCopied] = useState(false)
  const [ran, setRan] = useState(false)
  const [expanded, setExpanded] = useState(false)

  function copy() {
    navigator.clipboard.writeText(skill.invocationCommand).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {
      // Fallback: select text if clipboard API unavailable
      const el = document.createElement('textarea')
      el.value = skill.invocationCommand
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const shortDesc = skill.description
    .replace(/Triggers?:.*$/im, '').replace(/Keywords?:.*$/im, '')
    .replace(/^\|[\s|]*$/m, '').trim()  // strip bare pipe/table rows left over from YAML
  const hasDesc = shortDesc.length > 1
  const truncated = shortDesc.length > 120 && !expanded

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Top row: name + copy button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {skill.name}
          </div>
          <code style={{
            fontSize: '12px', color: 'var(--primary)', background: 'var(--surface-2)',
            padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace',
          }}>
            {skill.invocationCommand}
            {skill.argumentHint && <span style={{ color: 'var(--text-muted)' }}> {skill.argumentHint}</span>}
          </code>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={copy}
            title="Copy command"
            aria-label={`Copy invocation command: ${skill.invocationCommand}`}
            style={{
              background: copied ? '#22c55e22' : 'var(--surface-2)',
              border: `1px solid ${copied ? '#22c55e44' : 'var(--border)'}`,
              borderRadius: '6px',
              padding: '5px 8px',
              cursor: 'pointer',
              color: copied ? '#22c55e' : 'var(--text-muted)',
              fontSize: '11px',
              transition: 'all 0.15s',
            }}
          >
            {copied ? '✓' : '⎘'}
          </button>
          {onRun && (
            <button
              onClick={() => { onRun(skill.invocationCommand); setRan(true); setTimeout(() => setRan(false), 1500) }}
              title="Run in terminal"
              aria-label={`Run ${skill.invocationCommand}`}
              style={{
                background: ran ? '#6366f122' : 'var(--surface-2)',
                border: `1px solid ${ran ? '#6366f144' : 'var(--border)'}`,
                borderRadius: '6px',
                padding: '5px 8px',
                cursor: 'pointer',
                color: ran ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '11px',
                transition: 'all 0.15s',
              }}
            >
              {ran ? '✓' : '▶'}
            </button>
          )}
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        <Badge label={skill.pluginName} color="#6b7280" />
        {skill.classification && (
          <Badge label={skill.classification} color={CLASS_COLORS[skill.classification] || '#6b7280'} />
        )}
        {skill.pdcaPhase && (
          <Badge label={skill.pdcaPhase} color={PHASE_COLORS[skill.pdcaPhase] || '#6b7280'} />
        )}
        {!skill.userInvocable && (
          <Badge label="internal" color="#6b7280" />
        )}
      </div>

      {/* Description */}
      {hasDesc && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
          {truncated ? shortDesc.slice(0, 120) + '…' : shortDesc}
          {shortDesc.length > 120 && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '11px', padding: '0 0 0 4px' }}
            >
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      )}

      {/* Triggers */}
      {skill.triggers.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {skill.triggers.slice(0, 6).map((t, i) => (
            <span key={i} style={{
              fontSize: '10px', padding: '1px 6px', borderRadius: '3px',
              background: 'var(--surface-2)', color: 'var(--text-dim)',
              border: '1px solid var(--border)',
            }}>
              {t}
            </span>
          ))}
          {skill.triggers.length > 6 && (
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>+{skill.triggers.length - 6}</span>
          )}
        </div>
      )}

      {/* Next skill */}
      {skill.nextSkill && (
        <div style={{ fontSize: '11px', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          next → <code style={{ color: 'var(--text-muted)' }}>{skill.nextSkill}</code>
        </div>
      )}
    </div>
  )
}
