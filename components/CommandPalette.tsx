'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { SkillEntry } from '@/lib/types'

interface Props {
  skills: SkillEntry[]
  fuse: Fuse<SkillEntry>
  onClose: () => void
}

import { translateQuery } from '@/lib/ko-en'

export function CommandPalette({ skills, fuse, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  // Reset cursor when results change
  useEffect(() => { setCursor(0) }, [results])
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { setCursor(s => Math.min(s + 1, results.length - 1)); e.preventDefault(); return }
      if (e.key === 'ArrowUp') { setCursor(s => Math.max(s - 1, 0)); e.preventDefault(); return }
      if (e.key === ' ' && document.activeElement !== inputRef.current) {
        // Space toggles multi-select on cursor row
        e.preventDefault()
        const skill = results[cursor]
        if (!skill) return
        const key = `${skill.pluginName}:${skill.name}`
        setMultiSelected(prev => {
          const n = new Set(prev)
          n.has(key) ? n.delete(key) : n.add(key)
          return n
        })
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (multiSelected.size > 0) {
          copyMulti()
        } else {
          copySingle(results[cursor])
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, cursor, multiSelected, onClose])

  function copySingle(skill: SkillEntry | undefined) {
    if (!skill) return
    const cmd = skill.invocationCommand
    navigator.clipboard.writeText(cmd).catch(() => {})
    setCopied(true)
    setTimeout(() => { setCopied(false); onClose() }, 700)
  }

  function copyMulti() {
    const cmds = results
      .filter(s => multiSelected.has(`${s.pluginName}:${s.name}`))
      .map(s => s.invocationCommand)
      .join('\n')
    navigator.clipboard.writeText(cmds).catch(() => {})
    setCopied(true)
    setTimeout(() => { setCopied(false); onClose() }, 700)
  }

  function toggleMulti(skill: SkillEntry) {
    const key = `${skill.pluginName}:${skill.name}`
    setMultiSelected(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
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
          onChange={e => { setQuery(e.target.value) }}
          placeholder="Search skills... (↑↓ navigate, Space select, ↵ copy)"
          style={{ padding: '13px 16px', fontSize: '14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', outline: 'none' }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && query.trim() ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No skills found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((skill, i) => {
              const key = `${skill.pluginName}:${skill.name}`
              const isChecked = multiSelected.has(key)
              const isCursor = i === cursor
              return (
                <div
                  key={key}
                  onClick={() => { toggleMulti(skill); setCursor(i) }}
                  style={{
                    padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                    background: isChecked
                      ? 'rgba(99,102,241,0.12)'
                      : isCursor ? 'var(--surface-2)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: isChecked ? '3px solid var(--primary)' : '3px solid transparent',
                    transition: 'background 0.08s',
                  }}
                  onMouseEnter={() => setCursor(i)}
                >
                  {/* Mini checkbox */}
                  <div style={{
                    width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0,
                    border: `1px solid ${isChecked ? 'var(--primary)' : 'var(--border)'}`,
                    background: isChecked ? 'var(--primary)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isChecked && <span style={{ color: '#fff', fontSize: '9px', lineHeight: 1 }}>✓</span>}
                  </div>
                  <code style={{ fontSize: '12px', color: 'var(--primary)', fontFamily: 'monospace', flexShrink: 0 }}>
                    {skill.invocationCommand}
                  </code>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {skill.name}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: '3px' }}>
                    {skill.pluginName}
                  </span>
                </div>
              )
            })
          )}
        </div>
        <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-dim)', display: 'flex', gap: '12px', alignItems: 'center' }}>
          {copied ? (
            <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ 복사됨!</span>
          ) : (
            <>
              <span>↑↓ navigate</span>
              <span>Space / click select</span>
              <span>↵ {multiSelected.size > 0 ? `copy ${multiSelected.size}` : 'copy'} &amp; close</span>
              <span>esc close</span>
              {multiSelected.size > 0 && (
                <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 600 }}>
                  {multiSelected.size}개 선택됨
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
