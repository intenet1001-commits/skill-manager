'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { SkillEntry } from '@/lib/types'

interface Props {
  all: SkillEntry[]
  filtered: SkillEntry[]
  onRefresh?: () => void
}

interface ClaudeStatus {
  installed: boolean
  authenticated: boolean
  email: string
  subscriptionType: string
  authMethod: string
  version: string
}

const SUB_LABEL: Record<string, string> = {
  max: 'Max',
  pro: 'Pro',
  free: 'Free',
  team: 'Team',
}

export function StatsBar({ all, filtered, onRefresh }: Props) {
  const plugins = new Set(all.filter(s => s.source === 'plugin').map(s => s.pluginName)).size
  const invocable = all.filter(s => s.userInvocable).length
  const showing = filtered.length !== all.length
  const [claude, setClaude] = useState<ClaudeStatus | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<{
    added: string[]
    removed: string[]
    before: number
    after: number
    unchanged: boolean
  } | null>(null)
  const [showRefreshDetail, setShowRefreshDetail] = useState(false)
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(() => {
    fetch('/api/claude-status')
      .then(r => r.json())
      .then(setClaude)
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchStatus()
    return () => { if (loginPollRef.current) clearInterval(loginPollRef.current) }
  }, [fetchStatus])

  async function handleLogout() {
    if (!confirm('Claude Code 계정에서 로그아웃 하시겠습니까?')) return
    setAuthLoading(true)
    try {
      const res = await fetch('/api/claude-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      if (res.ok) {
        setClaude(prev => prev ? { ...prev, authenticated: false, email: '' } : null)
        // Refresh real status after 1s
        setTimeout(fetchStatus, 1000)
      }
    } finally { setAuthLoading(false) }
  }

  async function handleLogin() {
    setAuthLoading(true)
    try {
      const res = await fetch('/api/claude-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login' }),
      })
      if (res.ok) {
        // Poll status every 3s until logged in (max 60s)
        let attempts = 0
        if (loginPollRef.current) clearInterval(loginPollRef.current)
        loginPollRef.current = setInterval(() => {
          attempts++
          if (attempts > 20) { clearInterval(loginPollRef.current!); loginPollRef.current = null; return }
          fetch('/api/claude-status')
            .then(r => r.json())
            .then((s: ClaudeStatus) => {
              setClaude(s)
              if (s.authenticated) { clearInterval(loginPollRef.current!); loginPollRef.current = null }
            })
            .catch(() => {})
        }, 3000)
      }
    } finally { setAuthLoading(false) }
  }

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
      // Auto-dismiss after a while
      setTimeout(() => setRefreshResult(null), 12000)
      onRefresh?.()
      // Reload only if there were actual changes
      if (!data.unchanged) {
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch {
      setRefreshResult(null)
    } finally {
      setRefreshing(false)
    }
  }

  const claudeOk = claude?.installed && claude?.authenticated

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

        {/* Refresh result toast */}
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

        {/* Detail dropdown of added/removed skills */}
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

      {/* Claude account badge */}
      {claude !== null && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDetail(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontSize: '12px',
              color: claudeOk ? '#22c55e' : '#ef4444',
              padding: '2px 8px',
              borderRadius: '20px',
              border: `1px solid ${claudeOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              background: claudeOk ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              cursor: 'pointer',
            }}
          >
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: claudeOk ? '#22c55e' : '#ef4444',
              flexShrink: 0,
            }} />
            {claudeOk
              ? `Claude ${claude.email ? '(' + claude.email.split('@')[0] + ')' : '연결됨'}`
              : claude.installed ? 'Claude 미로그인' : 'Claude 미설치'}
            {claudeOk && claude.subscriptionType && (
              <span style={{
                fontSize: '10px', background: 'rgba(34,197,94,0.2)',
                padding: '0 4px', borderRadius: '3px', color: '#16a34a',
              }}>
                {SUB_LABEL[claude.subscriptionType] ?? claude.subscriptionType}
              </span>
            )}
          </button>

          {/* Detail dropdown */}
          {showDetail && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '12px 14px', zIndex: 50,
              minWidth: '220px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}>
              {claudeOk ? (
                <>
                  <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '4px', fontWeight: 600 }}>
                    {claude.email}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    플랜: {SUB_LABEL[claude.subscriptionType] ?? claude.subscriptionType}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    인증: {claude.authMethod}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    버전: {claude.version}
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={authLoading}
                    style={{
                      width: '100%', padding: '6px', borderRadius: '6px',
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                      color: '#ef4444', fontSize: '12px', cursor: authLoading ? 'wait' : 'pointer',
                    }}
                  >
                    {authLoading ? '처리 중...' : '로그아웃'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '8px' }}>
                    {claude.installed ? 'Claude Code가 설치되어 있지만 로그인이 필요합니다.' : 'Claude Code가 설치되어 있지 않습니다.'}
                  </div>
                  {claude.installed && (
                    <button
                      onClick={handleLogin}
                      disabled={authLoading}
                      style={{
                        width: '100%', padding: '6px', borderRadius: '6px',
                        background: 'var(--primary)', border: 'none',
                        color: '#fff', fontSize: '12px', cursor: authLoading ? 'wait' : 'pointer',
                      }}
                    >
                      {authLoading ? '브라우저 열는 중...' : '로그인'}
                    </button>
                  )}
                  {!claude.installed && (
                    <a
                      href="https://claude.ai/code"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'block', textAlign: 'center',
                        padding: '6px', borderRadius: '6px',
                        background: 'var(--primary)', color: '#fff',
                        fontSize: '12px', textDecoration: 'none',
                      }}
                    >
                      Claude Code 설치
                    </a>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
