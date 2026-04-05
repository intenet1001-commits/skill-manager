'use client'

import { useEffect, useState, useCallback } from 'react'
import { SkillEntry } from '@/lib/types'

interface Props {
  all: SkillEntry[]
  filtered: SkillEntry[]
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

export function StatsBar({ all, filtered }: Props) {
  const plugins = new Set(all.filter(s => s.source === 'plugin').map(s => s.pluginName)).size
  const invocable = all.filter(s => s.userInvocable).length
  const showing = filtered.length !== all.length
  const [claude, setClaude] = useState<ClaudeStatus | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const fetchStatus = useCallback(() => {
    fetch('/api/claude-status')
      .then(r => r.json())
      .then(setClaude)
      .catch(() => {})
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

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
        const poll = setInterval(() => {
          fetchStatus()
          attempts++
          if (attempts > 20) clearInterval(poll)
        }, 3000)
        fetch('/api/claude-status').then(r => r.json()).then(s => {
          if (s.authenticated) clearInterval(poll)
        })
      }
    } finally { setAuthLoading(false) }
  }

  const claudeOk = claude?.installed && claude?.authenticated

  return (
    <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--text-muted)', flexWrap: 'wrap' }}>
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
