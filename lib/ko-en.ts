/**
 * Korean → English keyword map for search.
 * Single source of truth used by Dashboard, CommandPalette, and the recommend API.
 */
export const KO_EN: Record<string, string> = {
  '코드': 'code', '리뷰': 'review', '커밋': 'commit', '배포': 'deploy',
  '테스트': 'test', '빌드': 'build', '디버그': 'debug', '버그': 'bug',
  '리팩터': 'refactor', '문서': 'document', '보안': 'security',
  '풀리퀘': 'pull request', '깃': 'git', '분석': 'analyze',
  '자동화': 'automation', '설계': 'design', '아키텍처': 'architecture',
  '테스팅': 'testing', '검색': 'search', '인증': 'auth', '데이터': 'data',
  '브랜치': 'branch', '머지': 'merge', '성능': 'performance', '최적화': 'optimize',
  '코드리뷰': 'code review', 'PR': 'pull request', '스킬': 'skill', '에이전트': 'agent',
}

/** Pre-compiled RegExp patterns for translateQuery — avoids re-compiling on every call. */
const KO_PATTERNS: Array<[RegExp, string]> = Object.entries(KO_EN).map(
  ([ko, en]) => [new RegExp(ko, 'g'), en]
)

/**
 * String-replacement translation for UI search (Dashboard, CommandPalette).
 * Replaces Korean keywords in-place with English equivalents.
 */
export function translateQuery(q: string): string {
  let out = q
  for (const [re, en] of KO_PATTERNS) {
    out = out.replace(re, en)
  }
  return out
}

/**
 * Term-extraction translation for the recommend API (Fuse.js multi-term search).
 * Extracts English terms from raw input and translates Korean terms.
 * Returns up to 6 unique terms of length >= 3.
 */
export function extractSearchTerms(input: string): string[] {
  const terms: string[] = (input.match(/[a-zA-Z][a-zA-Z0-9\-_]{2,}/g) || [])
  for (const [ko, en] of Object.entries(KO_EN)) {
    if (input.includes(ko)) {
      en.split(' ').filter(w => w.length > 2).forEach(w => terms.push(w))
    }
  }
  return [...new Set(terms)].filter(t => t.length >= 3).slice(0, 6)
}
