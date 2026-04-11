export interface RecommendedRepo {
  id: string
  name: string           // git clone target dir name
  description: string
  url: string            // https://github.com/... (no .git suffix)
  type: 'marketplace' | 'plugin' | 'skill'
  skillCount?: number
  tags?: string[]
  featured?: boolean
}

export const RECOMMENDED_REPOS: RecommendedRepo[] = [
  // Marketplaces
  {
    id: 'bkit',
    name: 'bkit-marketplace',
    description: 'Vibecoding Kit — PDCA workflow, PM tools, enterprise dev patterns (36+ skills)',
    url: 'https://github.com/popup-studio-ai/bkit-claude-code',
    type: 'marketplace',
    skillCount: 36,
    tags: ['pdca', 'workflow', 'enterprise'],
    featured: true,
  },
  {
    id: 'anthropic-cc',
    name: 'claude-code-plugins',
    description: 'Official Anthropic Claude Code plugins',
    url: 'https://github.com/anthropics/claude-code',
    type: 'marketplace',
    skillCount: 7,
    tags: ['official', 'anthropic'],
    featured: true,
  },
  {
    id: 'cs-plugins',
    name: 'cs-plugins',
    description: 'CS test, plan, codebase review agent team suites (14+ skills)',
    url: 'https://github.com/intenet1001-commits/cs_plugins',
    type: 'marketplace',
    skillCount: 14,
    tags: ['testing', 'planning', 'review'],
    featured: true,
  },
  {
    id: 'omc',
    name: 'omc',
    description: 'Oh My Claude Code — comprehensive agent enhancement suite (36+ skills)',
    url: 'https://github.com/Yeachan-Heo/oh-my-claudecode',
    type: 'marketplace',
    skillCount: 36,
    tags: ['agents', 'workflow', 'quality'],
    featured: true,
  },
  {
    id: 'codex',
    name: 'codex-plugin-cc',
    description: 'OpenAI Codex integration for Claude Code',
    url: 'https://github.com/openai/codex-plugin-cc',
    type: 'marketplace',
    skillCount: 3,
    tags: ['codex', 'openai'],
  },
  {
    id: 'gws-cli',
    name: 'cli',
    description: 'Google Workspace CLI tools and automation skills',
    url: 'https://github.com/googleworkspace/cli',
    type: 'marketplace',
    tags: ['google', 'workspace', 'gmail', 'calendar'],
  },
  {
    id: 'impeccable',
    name: 'impeccable',
    description: 'Impeccable — UI/design-focused skills and workflows',
    url: 'https://github.com/pbakaus/impeccable',
    type: 'marketplace',
    skillCount: 21,
    tags: ['ui', 'design', 'frontend'],
  },
  {
    id: 'obsidian-cc',
    name: 'obsidian-claude-code',
    description: 'Obsidian integration skills for Claude Code',
    url: 'https://github.com/SmartAndPoint/obsidian-claude-code',
    type: 'marketplace',
    tags: ['obsidian', 'notes', 'pkm'],
  },
  {
    id: 'team-attention',
    name: 'team-attention-plugins',
    description: 'Team Attention plugins for Claude Code natives',
    url: 'https://github.com/team-attention/plugins-for-claude-natives',
    type: 'marketplace',
    tags: ['team', 'collaboration'],
  },
  // Skills
  {
    id: 'claude-code-skills',
    name: 'claude-code-skills',
    description: 'Curated standalone skill collection for Claude Code',
    url: 'https://github.com/intenet1001-commits/claude-code-skills',
    type: 'skill',
    tags: ['skills', 'collection'],
  },
  {
    id: 'gstack',
    name: 'gstack',
    description: 'gstack — Google Cloud skills and workflows',
    url: 'https://github.com/garrytan/gstack',
    type: 'skill',
    tags: ['gcp', 'google', 'cloud'],
  },
  {
    id: 'antigravity',
    name: 'antigravity-awesome-skills',
    description: 'Antigravity awesome skill collection',
    url: 'https://github.com/sickn33/antigravity-awesome-skills',
    type: 'skill',
    tags: ['skills', 'collection'],
  },
]
