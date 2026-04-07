'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { SkillEntry } from '@/lib/types'

interface Props {
  skills: SkillEntry[]
  onClose: () => void
}

const KO_EN: Record<string, string> = {
  '코드': 'code', '리뷰': 'review', '커밋': 'commit', '배포': 'deploy',
  '테스트': 'test', '빌드': 'build', '디버그': 'debug', '버그': 'bug',
  '리팩터': 'refactor', '문서': 'document', '보안': 'security',
  '풀리퀘': 'pull request', '깃': 'git', '분석': 'analyze',
}

function translateQuery(q: string): string {
  let out = q
  for (const [ko, en] of Object.entries(KO_EN)) {
    out = out.replace(new RegExp(ko, 'g'), en)
  }
  return out
}

export function CommandPalette({ skills, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fuse = useMemo(() => new Fuse(skills, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'invocationCommand', weight: 2 },
      { name: 'description', weight: 1 },
    ],
    threshold: 0.35,
  }), [skills])

  const results = useMemo(() => {
    if (!query.trim()) return skills.filter(s => s.userInvocable).slice(0, 10)
    const translated = translateQuery(query.trim())
    const seen = new Set<string>()
    const merged: SkillEntry[] = []
    const add = (items: SkillEntry[]) => {
      for (const s of items) {
        const k = s.pluginName + ':' + s.name
        if (!seen.has(k)) { seen.add(k); merged.push(s) }
      }
    }
    if (translated !== query.trim()) add(fuse.search(translated).map(r => r.item))
    add(fuse.search(query.trim()).map(r => r.item))
    return merged.slice(0, 10)
  }, [query, fuse, skills])

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { setSelected(s => Math.min(s + 1, results.length - 1)); e.preventDefault() }
      if (e.key === 'ArrowUp') { setSelected(s => Math.max(s - 1, 0)); e.preventDefault() }
      if (e.key === 'Enter') { copySkill(results[selected]) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [results, selected, onClose])

  function copySkill(skill: SkillEntry | undefined) {
    if (!skill) return
    const cmd = skill.invocationCommand
    navigator.clipboard.writeText(cmd).catch(() => {
      const el = document.createElement('textarea')
      el.value = cmd
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopied(cmd)
    setTimeout(() => { setCopied(null); onClose() }, 700)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: '12px', width: 'min(540px, 90vw)', maxHeight: '60vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0) }}
          placeholder="Search skills... (↑↓ navigate, ↵ copy, esc close)"
          style={{ padding: '13px 16px', fontSize: '14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', outline: 'none' }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && query.trim() ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No skills found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((skill, i) => (
              <div
                key={`${skill.pluginName}:${skill.name}`}
                onClick={() => copySkill(skill)}
                style={{
                  padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                  background: i === selected ? 'var(--surface-2)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.08s',
                }}
                onMouseEnter={() => setSelected(i)}
              >
                <code style={{ fontSize: '12px', color: copied === skill.invocationCommand ? '#22c55e' : 'var(--primary)', fontFamily: 'monospace', flexShrink: 0 }}>
                  {copied === skill.invocationCommand ? '✓ copied' : skill.invocationCommand}
                </code>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {skill.name}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: '3px' }}>
                  {skill.pluginName}
                </span>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-dim)', display: 'flex', gap: '12px' }}>
          <span>↑↓ navigate</span><span>↵ copy &amp; close</span><span>esc close</span>
        </div>
      </div>
    </div>
  )
}
