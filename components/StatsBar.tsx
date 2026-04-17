'use client'

import { useState, useMemo } from 'react'
import { SkillEntry } from '@/lib/types'
import { ClaudeAuthBadge } from './ClaudeAuthBadge'

interface Props {
  all: SkillEntry[]
  filtered: SkillEntry[]
  onRefresh?: () => void
}

export function StatsBar({ all, filtered, onRefresh }: Props) {
  const plugins = useMemo(() =>
    new Set(all.filter(s => s.source === 'plugin').map(s => s.pluginName)).size,
    [all]
  )
  const invocable = useMemo(() =>
    all.filter(s => s.userInvocable).length,
    [all]
  )
  const showing = filtered.length !== all.length
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{
    added: string[]
    removed: string[]
    before: number
    after: number
    unchanged: boolean
  } | null>(null)
  const [showRefreshDetail, setShowRefreshDetail] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    setShowRefreshDetail(false)
    try {
      const res = await fetch('/api/build-index', { method: 'POST' })
      if (!res.ok) {
        setRefreshResult({ added: [], removed: [], before: 0, after: 0, unchanged: false })
        setTimeout(() => setRefreshResult(null), 4000)
        return
      }
      const data = await res.json() as {
        ok: boolean
        before: number
        after: number
        added: string[]
        removed: string[]
        unchanged: boolean
      }
      setRefreshResult({
        added: data.added,
        removed: data.removed,
        before: data.before,
        after: data.after,
        unchanged: data.unchanged,
      })
      setTimeout(() => setRefreshResult(null), 12000)
      if (!data.unchanged) {
        onRefresh?.()
      }
    } catch {
      setRefreshResult(null)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--text-muted)', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="스킬 인덱스 새로고침 (추가/삭제된 스킬 감지)"
          style={{
            padding: '2px 7px', borderRadius: '5px', border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: refreshing ? 'var(--text-dim)' : 'var(--text-muted)',
            fontSize: '11px', cursor: refreshing ? 'wait' : 'pointer',
          }}
        >
          {refreshing ? '↺ 스캔 중…' : '↺'}
        </button>

        {refreshResult && (
          <button
            onClick={() => setShowRefreshDetail(v => !v)}
            style={{
              padding: '2px 8px', borderRadius: '12px', fontSize: '11px',
              border: '1px solid',
              borderColor: refreshResult.unchanged
                ? 'var(--border)'
                : refreshResult.added.length > 0
                  ? 'rgba(34,197,94,0.4)'
                  : 'rgba(245,158,11,0.4)',
              background: refreshResult.unchanged
                ? 'var(--surface-2)'
                : refreshResult.added.length > 0
                  ? 'rgba(34,197,94,0.08)'
                  : 'rgba(245,158,11,0.08)',
              color: refreshResult.unchanged
                ? 'var(--text-muted)'
                : refreshResult.added.length > 0
                  ? '#22c55e'
                  : '#f59e0b',
              cursor: (refreshResult.added.length + refreshResult.removed.length) > 0 ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}
          >
            {refreshResult.unchanged
              ? `✓ 변경 없음 (${refreshResult.after.toLocaleString()})`
              : `${refreshResult.added.length > 0 ? `+${refreshResult.added.length}` : ''}${refreshResult.added.length > 0 && refreshResult.removed.length > 0 ? ' ' : ''}${refreshResult.removed.length > 0 ? `−${refreshResult.removed.length}` : ''} (${refreshResult.before.toLocaleString()} → ${refreshResult.after.toLocaleString()})`}
          </button>
        )}

        {refreshResult && showRefreshDetail && (refreshResult.added.length + refreshResult.removed.length) > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '10px 12px', zIndex: 50,
            minWidth: '280px', maxWidth: '420px', maxHeight: '320px', overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            fontSize: '11px',
          }}>
            {refreshResult.added.length > 0 && (
              <div style={{ marginBottom: refreshResult.removed.length > 0 ? '10px' : 0 }}>
                <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: '4px' }}>
                  + 추가됨 ({refreshResult.added.length})
                </div>
                {refreshResult.added.map(s => (
                  <div key={s} style={{ color: 'var(--text-muted)', paddingLeft: '8px', fontFamily: 'ui-monospace, monospace' }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
            {refreshResult.removed.length > 0 && (
              <div>
                <div style={{ color: '#f59e0b', fontWeight: 600, marginBottom: '4px' }}>
                  − 삭제됨 ({refreshResult.removed.length})
                </div>
                {refreshResult.removed.map(s => (
                  <div key={s} style={{ color: 'var(--text-muted)', paddingLeft: '8px', fontFamily: 'ui-monospace, monospace' }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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

      <ClaudeAuthBadge />
    </div>
  )
}
