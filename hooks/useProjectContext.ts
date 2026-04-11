'use client'

import { useState, useEffect } from 'react'

export interface ProjectContext {
  path: string
  name: string
  techs: string[]
  summary: string
  claudeMd: string | null
}

export interface RecentProject {
  name: string
  path: string
  techs: string[]
  modifiedAt: number
}

const PROJECTS_KEY = 'sm-projects'

export function useProjectContext() {
  const [projects, setProjects] = useState<ProjectContext[]>([])
  const [loadingContext, setLoadingContext] = useState(false)
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [inlinePath, setInlinePath] = useState('')
  const [showInlinePath, setShowInlinePath] = useState(false)
  const [addedMsg, setAddedMsg] = useState<string | null>(null)

  // Load persisted projects + recent projects on mount
  useEffect(() => {
    fetch('/api/recent-projects').then(r => r.json()).then(setRecentProjects).catch(() => {})
    try {
      const saved = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
      if (Array.isArray(saved) && saved.length > 0) setProjects(saved)
    } catch {}
  }, [])

  // Persist projects whenever they change
  useEffect(() => {
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)) } catch {}
  }, [projects])

  async function loadProjectContext(path: string) {
    const p = path.trim()
    if (!p) return
    if (projects.some(proj => proj.path === p)) {
      setAddedMsg(`"${p.split('/').pop()}" 이미 추가됨`)
      setTimeout(() => setAddedMsg(null), 2000)
      return
    }
    setLoadingContext(true)
    setLoadingPath(p)
    setPathError(null)
    try {
      const res = await fetch(`/api/project-context?path=${encodeURIComponent(p)}`)
      if (res.status === 404) { setPathError('폴더를 찾을 수 없습니다.'); return }
      if (!res.ok) { setPathError('컨텍스트 로드 실패'); return }
      const data = await res.json()
      setProjects(prev => [...prev, data])
      setPathError(null)
      setInlinePath('')
      setAddedMsg(`✓ "${data.name}" 추가됨`)
      setTimeout(() => setAddedMsg(null), 2500)
    } catch { setPathError('연결 오류가 발생했습니다.') }
    finally { setLoadingContext(false); setLoadingPath(null) }
  }

  async function handlePickFolder() {
    setInlinePath('')
    setPathError(null)
    setShowInlinePath(true)
  }

  async function handleOsPicker() {
    try {
      if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
        const handle = await (window as Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
        const folderName = handle.name
        const match = recentProjects.find(p => p.name === folderName)
        if (match) {
          loadProjectContext(match.path)
        } else {
          setInlinePath('')
          setPathError(`"${folderName}" 폴더의 절대 경로를 입력하세요`)
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setPathError('폴더 선택에 실패했습니다. 아래에서 직접 입력하세요.')
      }
    }
  }

  function removeProject(path: string) {
    setProjects(prev => prev.filter(p => p.path !== path))
  }

  return {
    projects, setProjects,
    loadingContext, loadingPath,
    pathError, setPathError,
    recentProjects,
    inlinePath, setInlinePath,
    showInlinePath, setShowInlinePath,
    addedMsg,
    loadProjectContext,
    handlePickFolder,
    handleOsPicker,
    removeProject,
  }
}
