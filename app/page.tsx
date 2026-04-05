import { readFileSync } from 'fs'
import { join } from 'path'
import { Dashboard } from '@/components/Dashboard'
import { SkillEntry } from '@/lib/types'

function loadSkills(): SkillEntry[] {
  try {
    const path = join(process.cwd(), 'public', 'skills-index.json')
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return []
  }
}

export default function Page() {
  const skills = loadSkills()
  return <Dashboard skills={skills} />
}
