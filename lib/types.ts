export type RecommendErrorCode =
  | 'goal_empty'
  | 'in_progress'
  | 'index_missing'
  | 'auth'
  | 'not_installed'
  | 'parse'
  | 'failed'
  | 'spawn'

export interface SkillEntry {
  name: string
  pluginName: string
  marketplace: string
  description: string
  triggers: string[]
  classification: 'capability' | 'workflow' | 'hybrid' | 'internal' | null
  pdcaPhase: 'pm' | 'plan' | 'design' | 'do' | 'check' | 'act' | 'report' | null
  userInvocable: boolean
  argumentHint: string | null
  agent: string | null
  deprecationRisk: 'none' | 'low' | 'medium' | 'high' | null
  nextSkill: string | null
  invocationCommand: string
  source: 'plugin' | 'standalone'
}

export interface Filters {
  plugins: string[]
  classifications: string[]
  pdcaPhases: string[]
  marketplaces: string[]
  userInvocableOnly: boolean
  agentTeamsOnly: boolean
}
