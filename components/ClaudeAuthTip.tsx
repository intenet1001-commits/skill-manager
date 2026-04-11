'use client'

import { useState, useRef, useEffect } from 'react'

const PROMPT = `# Claude Code 계정 로그인 기능 구현 프롬프트

아래 패턴으로 이 Next.js 앱에 Claude Code 구독 계정 로그인 기능을 구현해줘.

## 핵심 아이디어
- Next.js API Route에서 로컬 \`claude\` CLI를 \`execSync\`로 직접 실행
- 인증 상태는 클로드가 \`~/.claude/\` 파일시스템에 저장 → 새로고침/재시작해도 유지
- 서버 사이드 30초 캐시로 CLI 호출 최소화 (UX 속도 확보)
- 로그인은 fire-and-forget + 3초 폴링 패턴 (브라우저 OAuth 비동기 대응)
- localhost만 허용하는 origin 체크로 보안 확보

## 구현할 파일 목록

### 1. lib/narrow-env.ts
Node.js에서 execSync 실행 시 PATH 문제를 방지하기 위해
HOME, PATH, USER, SHELL만 포함한 최소 환경변수를 반환하는 함수.
\`\`\`ts
export function narrowEnv() {
  return {
    HOME: process.env.HOME ?? '',
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    USER: process.env.USER ?? '',
    SHELL: process.env.SHELL ?? '/bin/sh',
  }
}
\`\`\`

### 2. lib/check-origin.ts
localhost / 127.0.0.1 / ::1 origin만 허용. 외부 호출 차단.
\`\`\`ts
import { NextRequest } from 'next/server'
export const ORIGIN_FORBIDDEN = Response.json({ error: 'forbidden' }, { status: 403 })
export function checkOrigin(req: NextRequest | Request): boolean {
  const origin = req.headers.get('origin') ?? ''
  const host = req.headers.get('host') ?? ''
  if (!origin) return host.startsWith('localhost') || host.startsWith('127.')
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch { return false }
}
\`\`\`

### 3. app/api/claude-status/route.ts (GET)
Claude CLI 설치 여부와 인증 상태를 조회. 30초 서버 메모리 캐시 적용.

흐름:
1. \`claude --version\` 실행 → 설치 확인 (실패 시 installed: false 반환)
2. \`claude auth status\` 실행 → JSON 파싱
3. 캐시에 저장 후 반환

반환 타입:
\`\`\`ts
{
  installed: boolean
  authenticated: boolean
  email: string
  subscriptionType: string  // 'max' | 'pro' | 'free' | 'team'
  authMethod: string
  version: string
}
\`\`\`

캐시 패턴:
\`\`\`ts
let cache: StatusCache | null = null
const CACHE_TTL = 30_000
if (cache && Date.now() - cache.ts < CACHE_TTL) return Response.json(cache)
\`\`\`

### 4. app/api/claude-auth/route.ts (POST)
body: { action: 'login' | 'logout' }

- logout: \`claude auth logout\` 동기 실행 후 응답
- login: \`claude auth login --claudeai\` 비동기 실행 (브라우저 OAuth 오픈),
  child process를 detach한 뒤 1초 후 즉시 응답 (기다리지 않음)
  → 프론트엔드가 폴링으로 완료 감지

### 5. components/ClaudeAuthBadge.tsx
\`\`\`
상태 표시 버튼 (클릭 시 드롭다운):
  ● 초록 dot: "Claude (이메일앞부분)" + 플랜 뱃지 (Max/Pro/Free)
  ● 빨간 dot: "Claude 미로그인" 또는 "Claude 미설치"

드롭다운 내용:
  - 인증됨: 이메일, 플랜, 인증방식, 버전 표시 + 로그아웃 버튼
  - 미로그인: 설명 + 로그인 버튼

로그인 플로우:
  1. 버튼 클릭 → POST /api/claude-auth { action: 'login' }
  2. 응답 받으면 setInterval 3000ms 시작 (최대 20회 = 60초)
  3. 매 interval: GET /api/claude-status → authenticated === true 이면 clearInterval
  4. 성공 시 배지 자동 업데이트, 드롭다운 닫기

폴링 구현:
\`\`\`ts
const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
let attempts = 0
loginPollRef.current = setInterval(() => {
  attempts++
  if (attempts > 20) { clearInterval(loginPollRef.current!); return }
  fetch('/api/claude-status').then(r => r.json()).then((s: ClaudeStatus) => {
    setClaude(s)
    if (s.authenticated) { clearInterval(loginPollRef.current!); setShowDetail(false) }
  })
}, 3000)
\`\`\`
\`\`\`

## 스타일 가이드
- CSS 변수 사용: var(--surface), var(--surface-2), var(--border), var(--primary), var(--text), var(--text-muted)
- 인증됨: #22c55e (초록), 미인증: #ef4444 (빨강)
- TypeScript strict 모드 준수
- 'use client' 클라이언트 컴포넌트로 작성

## 사용 위치
헤더 우측에 <ClaudeAuthBadge /> 삽입.
next.config.ts에서 서버 사이드에서 child_process 사용 가능하도록 확인 (App Router 기본 지원).

구현 후 http://localhost:{포트}/api/claude-status 로 동작 확인.
`

export function ClaudeAuthTip() {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function handleCopy() {
    navigator.clipboard.writeText(PROMPT).then(() => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { setCopied(false); setOpen(false) }, 1800)
    }).catch(() => {})
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Claude Code 로그인 기능 구현 프롬프트 복사"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
          border: '1px solid rgba(234,179,8,0.4)',
          background: open ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.06)',
          color: '#ca8a04',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        🍯 꿀팁
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          width: '320px',
          background: 'var(--surface)', border: '1px solid rgba(234,179,8,0.35)',
          borderRadius: '10px', zIndex: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(234,179,8,0.05)',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>
              🍯 Claude Code 로그인 구현 프롬프트
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              다른 Next.js 앱에서 Claude Code 구독 계정 로그인·인증 상태 표시 기능을 붙일 때 Claude에게 붙여넣기
            </div>
          </div>

          {/* Preview */}
          <div style={{
            padding: '10px 14px',
            maxHeight: '180px', overflowY: 'auto',
            fontSize: '11px', color: 'var(--text-muted)',
            fontFamily: 'ui-monospace, monospace',
            lineHeight: '1.6', whiteSpace: 'pre-wrap',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}>
            {PROMPT.slice(0, 400)}…
          </div>

          {/* What's included */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>포함 내용</div>
            {[
              'lib/narrow-env.ts — PATH 환경변수 격리',
              'lib/check-origin.ts — localhost 보안 체크',
              'app/api/claude-status/route.ts — 30초 캐시 상태 조회',
              'app/api/claude-auth/route.ts — 로그인/로그아웃',
              'components/ClaudeAuthBadge.tsx — 배지 + 폴링',
            ].map(item => (
              <div key={item} style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', display: 'flex', gap: '6px' }}>
                <span style={{ color: '#22c55e', flexShrink: 0 }}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Copy button */}
          <div style={{ padding: '10px 14px' }}>
            <button
              onClick={handleCopy}
              style={{
                width: '100%', padding: '8px', borderRadius: '7px',
                background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(234,179,8,0.4)'}`,
                color: copied ? '#22c55e' : '#ca8a04',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {copied ? '✓ 클립보드에 복사됨!' : '📋 프롬프트 전체 복사'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
