'use client'

import { ProjectContext, RecentProject } from '@/hooks/useProjectContext'

interface Props {
  projects: ProjectContext[]
  loadingContext: boolean
  loadingPath: string | null
  pathError: string | null
  recentProjects: RecentProject[]
  inlinePath: string
  addedMsg: string | null
  onInlinePathChange: (v: string) => void
  onClearPathError: () => void
  onLoad: (path: string) => void
  onOsPicker: () => void
  onRemove: (path: string) => void
  onClose: () => void
}

export function InlineFolderPanel({
  projects, loadingContext, loadingPath, pathError, recentProjects,
  inlinePath, addedMsg,
  onInlinePathChange, onClearPathError, onLoad, onOsPicker, onRemove, onClose,
}: Props) {
  return (
    <div style={{
      marginTop: '8px', padding: '10px 12px', borderRadius: '9px',
      border: '1px solid var(--border)', background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          프로젝트 추가{projects.length > 0 ? ` (${projects.length}개 선택됨)` : ''}
        </span>
        <button onClick={onClose}
          style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          ✕ 닫기
        </button>
      </div>

      {/* Added projects */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {projects.map(p => (
            <span key={p.path} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 8px', borderRadius: '5px', fontSize: '11px',
              background: 'rgba(99,102,241,0.12)', color: 'var(--primary)',
              border: '1px solid rgba(99,102,241,0.3)',
            }}>
              ✓ {p.name}
              <button onClick={() => onRemove(p.path)} style={{ fontSize: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 1px' }}>✕</button>
            </span>
          ))}
        </div>
      )}

      {addedMsg && <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 500 }}>{addedMsg}</div>}
      {pathError && <div style={{ fontSize: '11px', color: '#f59e0b' }}>💡 {pathError}</div>}

      {/* Path input row */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={onOsPicker} title="OS 폴더 선택" style={{
          padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)',
          background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', flexShrink: 0,
        }}>📂</button>
        <input
          autoFocus
          value={inlinePath}
          onChange={e => { onInlinePathChange(e.target.value); onClearPathError() }}
          onKeyDown={e => {
            if (e.key === 'Enter' && inlinePath.trim()) onLoad(inlinePath)
            if (e.key === 'Escape') onClose()
          }}
          placeholder="/Users/.../my-project"
          style={{
            flex: 1, padding: '7px 10px', borderRadius: '7px',
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: '12px', fontFamily: 'monospace', outline: 'none',
          }}
        />
        <button
          onClick={() => inlinePath.trim() && onLoad(inlinePath)}
          disabled={!inlinePath.trim() || loadingContext}
          style={{
            padding: '7px 14px', borderRadius: '7px', border: 'none', flexShrink: 0,
            background: inlinePath.trim() ? 'var(--primary)' : 'var(--border)',
            color: '#fff', fontSize: '12px', fontWeight: 600,
            cursor: inlinePath.trim() ? 'pointer' : 'not-allowed',
          }}
        >{loadingContext ? '⟳' : '추가'}</button>
      </div>

      {/* Recent projects */}
      {recentProjects.filter(p => !projects.some(proj => proj.path === p.path)).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-dim)', paddingLeft: '2px' }}>최근 프로젝트</div>
          {recentProjects
            .filter(p => !projects.some(proj => proj.path === p.path))
            .slice(0, 8)
            .map(p => (
              <button key={p.path} onClick={() => onLoad(p.path)}
                disabled={loadingPath === p.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '6px', border: 'none',
                  background: loadingPath === p.path ? 'rgba(99,102,241,0.08)' : 'none',
                  color: 'var(--text)', cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                }}
                onMouseEnter={e => { if (loadingPath !== p.path) e.currentTarget.style.background = 'rgba(99,102,241,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.background = loadingPath === p.path ? 'rgba(99,102,241,0.08)' : 'none' }}
              >
                <span style={{ flexShrink: 0 }}>{loadingPath === p.path ? '⟳' : '📁'}</span>
                <span style={{ fontWeight: 500, flexShrink: 0 }}>{p.name}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.path}</span>
                {p.techs.slice(0, 2).map(t => (
                  <span key={t} style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', flexShrink: 0 }}>{t}</span>
                ))}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
