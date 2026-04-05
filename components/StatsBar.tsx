'use client'

import { SkillEntry } from '@/lib/types'

interface Props {
  all: SkillEntry[]
  filtered: SkillEntry[]
}

export function StatsBar({ all, filtered }: Props) {
  const plugins = new Set(all.filter(s => s.source === 'plugin').map(s => s.pluginName)).size
  const invocable = all.filter(s => s.userInvocable).length
  const showing = filtered.length !== all.length

  return (
    <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--text-muted)' }}>
      <span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{all.length.toLocaleString()}</span> skills
      </span>
      <span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{plugins}</span> plugins
      </span>
      <span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{invocable.toLocaleString()}</span> invocable
      </span>
      {showing && (
        <span style={{ color: 'var(--primary)' }}>
          showing <strong>{filtered.length}</strong>
        </span>
      )}
    </div>
  )
}
