'use client'

import { ProjectResult } from '@/hooks/useRecommendStream'
import { ProjectContext } from '@/hooks/useProjectContext'

type TerminalType = 'iterm' | 'terminal' | 'tmux' | 'cmux' | 'bg'

const TERMINAL_OPTIONS: { key: TerminalType; label: string; title: string }[] = [
  { key: 'cmux', label: 'cmux', title: 'cmux 탭으로 열기' },
  { key: 'iterm', label: 'iTerm', title: 'iTerm2 창으로 열기 (기본)' },
  { key: 'terminal', label: 'Terminal', title: 'macOS Terminal.app으로 열기' },
  { key: 'bg', label: 'bg', title: '백그라운드 실행 (창 없음)' },
  { key: 'tmux', label: 'tmux', title: 'tmux 세션으로 열기 (iTerm 안에서 attach)' },
]

interface Props {
  projectResults: ProjectResult[]
  projects: ProjectContext[]
  selectedSkills: Set<string>
  anyLoading: boolean
  skipPerms: boolean
  terminalType: TerminalType
  copied: string | null
  runStatus: string | null
  totalRecs: number
  allKeys: string[]
  onToggleSkill: (projectPath: string, idx: number) => void
  onToggleAll: () => void
  onRunSelected: () => void
  onSkipPermsChange: (v: boolean) => void
  onTerminalTypeChange: (t: TerminalType) => void
  onCopyCmd: (cmd: string) => void
  installedPluginNames?: Set<string>
}

export function RecommendResults({
  projectResults, projects, selectedSkills, anyLoading,
  skipPerms, terminalType, copied, runStatus, totalRecs, allKeys,
  onToggleSkill, onToggleAll, onRunSelected, onSkipPermsChange, onTerminalTypeChange, onCopyCmd,
  installedPluginNames,
}: Props) {
  if (projectResults.length === 0) {
    if (anyLoading) return null
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
        <div style={{ fontSize: '15px', marginBottom: '6px', color: 'var(--text)' }}>자연어로 스킬을 찾아보세요</div>
        <div style={{ fontSize: '13px' }}>
          {projects.length > 0
            ? `${projects.map(p => p.name).join(', ')} 프로젝트 컨텍스트가 적용됩니다.`
            : '📂 폴더를 추가하면 기술 스택이 자동 감지되어 더 정확한 추천을 받을 수 있습니다.'}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Global controls */}
      {totalRecs > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={selectedSkills.size === allKeys.length && allKeys.length > 0}
              ref={el => { if (el) el.indeterminate = selectedSkills.size > 0 && selectedSkills.size < allKeys.length }}
              onChange={onToggleAll}
              style={{ cursor: 'pointer', width: '14px', height: '14px' }}
            />
            전체 선택
          </label>
          {/* Terminal type picker — always visible when results exist */}
          <div style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
            {TERMINAL_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => onTerminalTypeChange(opt.key)}
                title={opt.title}
                style={{
                  padding: '3px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 600,
                  border: `1px solid ${terminalType === opt.key ? 'var(--primary)' : 'var(--border)'}`,
                  background: terminalType === opt.key ? 'var(--primary)' : 'none',
                  color: terminalType === opt.key ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {selectedSkills.size > 1 && !installedPluginNames?.has('csncompany_2-0') && (
            <a
              href="https://github.com/intenet1001-commits/CSnCompany_2-0"
              target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '11px', color: '#f59e0b',
                padding: '3px 8px', borderRadius: '5px',
                border: '1px solid rgba(245,158,11,0.4)',
                background: 'rgba(245,158,11,0.06)',
                textDecoration: 'none',
              }}
              title="팀 리드(cs-ceo)는 CSnCompany_2-0 플러그인이 필요합니다. 클릭해서 설치 방법 확인"
            >
              ⚠️ 팀 실행엔 CSnCompany_2-0 필요
            </a>
          )}

          {selectedSkills.size > 0 && (
            <>
              {selectedSkills.size === 1 ? (
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', color: skipPerms ? '#f59e0b' : 'var(--text-muted)',
                  cursor: 'pointer', userSelect: 'none', padding: '3px 8px', borderRadius: '5px',
                  border: `1px solid ${skipPerms ? '#f59e0b' : 'var(--border)'}`,
                  background: skipPerms ? 'rgba(245,158,11,0.08)' : 'none',
                  transition: 'all 0.15s',
                }} title="--dangerously-skip-permissions 플래그로 실행">
                  <input type="checkbox" checked={skipPerms}
                    onChange={e => onSkipPermsChange(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: '#f59e0b' }}
                  />
                  ⚡ 권한 스킵
                </label>
              ) : (
                <span style={{
                  fontSize: '11px', color: '#f59e0b', padding: '3px 8px', borderRadius: '5px',
                  border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)',
                }} title="팀 모드에서 워커는 권한 프롬프트에 응답할 수 없어 자동으로 --dangerously-skip-permissions가 적용됩니다">
                  🔓 팀 모드: 권한 자동 스킵
                </span>
              )}
              <button onClick={onRunSelected} style={{
                padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                background: selectedSkills.size > 1 ? '#f59e0b' : skipPerms ? '#f59e0b' : 'var(--primary)',
                color: '#fff', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}>
                {selectedSkills.size === 1 ? `▶ 실행${skipPerms ? ' 🔓' : ''}` : '▶ 팀 실행 (Agent Teams) 🔓'}
              </button>
            </>
          )}
        </div>
      )}

      {runStatus && (
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: runStatus.startsWith('❌') ? '#ef4444' : 'var(--primary)' }}>
            {runStatus}
          </span>
        </div>
      )}

      {/* Per-project result sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {projectResults.map((pr) => (
          <div key={pr.projectPath}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {projectResults.length > 1 && (
                <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>📂 {pr.projectName}</span>
              )}
              {pr.loading && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🔍 분석 중...</span>}
              {!pr.loading && !pr.error && pr.recs.length > 0 && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {pr.fallback
                    ? '⚠️ 시간 초과 — 키워드 검색 결과'
                    : `✨ ${pr.recs.length}개 스킬 추천됨${projectResults.length === 1 && pr.projectName !== '기본' ? ` (${pr.projectName} 기준)` : ''}`}
                </span>
              )}
            </div>

            {pr.streamText && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{
                  display: 'inline-block', width: '14px', height: '14px',
                  border: '2px solid var(--border)', borderTopColor: 'var(--primary)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0,
                }} />
                <span style={{ color: 'var(--primary)' }}>Claude가 분석 중...</span>
              </div>
            )}

            {pr.error && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontSize: '13px', marginBottom: '8px',
              }}>❌ {pr.error}</div>
            )}

            {pr.recs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pr.recs.map((r, i) => {
                  const key = `${pr.projectPath}:${i}`
                  const selected = selectedSkills.has(key)
                  return (
                    <div key={i} onClick={() => onToggleSkill(pr.projectPath, i)} style={{
                      padding: '10px 14px', borderRadius: '10px',
                      background: selected ? 'rgba(99,102,241,0.07)' : 'var(--surface)',
                      border: `1px solid ${selected ? 'var(--primary)' : i === 0 ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSkill(pr.projectPath, i)}
                        onClick={e => e.stopPropagation()}
                        style={{ marginTop: '3px', cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0, accentColor: 'var(--primary)' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <code style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '13px',
                            fontWeight: 700, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)',
                          }}>{r.cmd}</code>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '4px' }}>{r.plugin}</span>
                            {installedPluginNames && (
                              installedPluginNames.has(r.plugin.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                              || installedPluginNames.has(r.plugin.toLowerCase())
                                ? <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>✓</span>
                                : null
                            )}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{r.reason}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); onCopyCmd(r.cmd) }} style={{
                        padding: '3px 9px', borderRadius: '5px', background: 'none',
                        border: '1px solid var(--border)',
                        color: copied === r.cmd ? 'var(--primary)' : 'var(--text-muted)',
                        cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                      }}>{copied === r.cmd ? '✓' : '복사'}</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
