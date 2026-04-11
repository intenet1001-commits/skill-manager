'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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

export function ClaudeAuthBadge() {
  const [claude, setClaude] = useState<ClaudeStatus | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
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
        let attempts = 0
        if (loginPollRef.current) clearInterval(loginPollRef.current)
        loginPollRef.current = setInterval(() => {
          attempts++
          if (attempts > 20) { clearInterval(loginPollRef.current!); loginPollRef.current = null; return }
          fetch('/api/claude-status')
            .then(r => r.json())
            .then((s: ClaudeStatus) => {
              setClaude(s)
              if (s.authenticated) { clearInterval(loginPollRef.current!); loginPollRef.current = null; setShowDetail(false) }
            })
            .catch(() => {})
        }, 3000)
      }
    } finally { setAuthLoading(false) }
  }

  if (claude === null) return null

  const claudeOk = claude.installed && claude.authenticated

  return (
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
  )
}
