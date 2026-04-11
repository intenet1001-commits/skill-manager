'use client'

interface Props {
  onClose: () => void
}

const SECTIONS = [
  {
    title: '🔍 탐색 모드 (기본)',
    items: [
      { label: '검색창', desc: '스킬 이름, 설명, 트리거 키워드로 퍼지 검색. 한국어도 지원 (커밋 → commit 자동 변환).' },
      { label: '빠른 검색 칩', desc: '커밋, 코드리뷰, deploy 등 자주 쓰는 키워드를 클릭. 같은 칩을 다시 클릭하면 검색 해제.' },
      { label: '⌘K', desc: '커맨드 팔레트 열기 — 키보드로 스킬 검색 후 Enter로 복사.' },
      { label: '정렬', desc: '이름 / 플러그인 / 페이즈 기준 정렬 전환.' },
    ],
  },
  {
    title: '☐ 복수 선택 복사 (새 기능)',
    items: [
      { label: '선택 모드 켜기', desc: '정렬 버튼 옆 "☐ 선택" 버튼 클릭 → 카드에 체크박스 오버레이 표시.' },
      { label: '카드 선택', desc: '선택 모드에서 카드 클릭 → 선택/해제 토글. 복사(⎘)·실행(▶) 버튼은 선택에 영향 없음.' },
      { label: '📋 모두 복사', desc: '하단 플로팅 바에서 클릭 → 선택한 모든 스킬 커맨드를 줄바꿈으로 구분해 클립보드에 복사.' },
      { label: '✕ 해제', desc: '선택 초기화. 선택 모드 버튼을 다시 누르면 모드 종료 + 선택 초기화.' },
    ],
  },
  {
    title: '🔗 필터 패널 (왼쪽 사이드바)',
    items: [
      { label: '호출 가능 스킬만', desc: '/slash-command 형태로 직접 호출 가능한 스킬만 표시.' },
      { label: 'Agent Teams', desc: 'tmux 팀 실행 가능한 에이전트 스킬만 표시.' },
      { label: 'PDCA Phase', desc: 'pm / plan / design / do / check / act / report 단계별 필터. 여러 개 동시 선택 가능. "모두 해제" 버튼으로 일괄 해제.' },
      { label: '분류', desc: 'workflow · capability · hybrid · internal 유형 필터.' },
      { label: 'Plugin', desc: '33개 플러그인 중 선택. 검색창으로 좁히고, "전체 선택/해제"로 일괄 처리.' },
      { label: '초기화', desc: '헤더의 "초기화" 버튼으로 모든 필터 한 번에 제거.' },
    ],
  },
  {
    title: '✨ AI 추천 모드',
    items: [
      { label: '목표 입력', desc: '"코드 리뷰를 해주세요" 같은 자연어로 목표를 입력하면 AI가 적합한 스킬을 추천.' },
      { label: '프로젝트 폴더', desc: '"+ 폴더 추가"로 실제 프로젝트 경로를 추가하면 CLAUDE.md 기반으로 더 정확한 추천 제공.' },
      { label: '.md 드래그', desc: '요구사항 파일(.md/.txt)을 텍스트박스에 드래그하면 파일 내용이 자동 삽입.' },
      { label: '다중 프로젝트', desc: '여러 폴더를 추가하면 프로젝트별로 병렬 추천 실행.' },
      { label: '스킬 실행', desc: '추천 결과에서 스킬을 선택 후 "실행" → iTerm에서 claude CLI 자동 실행.' },
    ],
  },
  {
    title: '🔗 플러그인 소스',
    items: [
      { label: '설치된 플러그인 목록', desc: '마켓플레이스별 플러그인 목록과 각 플러그인의 스킬 수 확인.' },
      { label: '인덱스 새로고침', desc: '헤더 우측 ↺ 버튼 → 새로 추가/삭제된 스킬을 감지해 인덱스 갱신.' },
    ],
  },
  {
    title: '⌨️ 키보드 단축키',
    items: [
      { label: '⌘K / Ctrl+K', desc: '커맨드 팔레트 열기/닫기.' },
      { label: 'Esc (검색창)', desc: '검색어 지우기.' },
      { label: 'Esc (팔레트)', desc: '팔레트 닫기.' },
      { label: '↑↓ (팔레트)', desc: '결과 탐색.' },
      { label: 'Enter (팔레트)', desc: '선택한 스킬 커맨드 복사 후 닫기.' },
    ],
  },
]

export function HelpModal({ onClose }: Props) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '5vh', paddingBottom: '5vh', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: '14px', width: 'min(640px, 92vw)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>🎯 Skill Manager 사용 가이드</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>1,200+ Claude Code 스킬을 탐색하고 복사하는 방법</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '4px 8px', borderRadius: '6px' }}
          >✕</button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>{section.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {section.items.map((item, i) => (
                  <div
                    key={item.label}
                    style={{
                      display: 'flex', gap: '12px', padding: '8px 10px',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ width: '130px', flexShrink: 0, fontSize: '12px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'ui-monospace, monospace', paddingTop: '1px' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.55', flex: 1 }}>
                      {item.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Tip box */}
          <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            <strong style={{ color: 'var(--primary)' }}>💡 빠른 시작:</strong> 검색창에 하고 싶은 작업을 입력하거나 (예: <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: '3px' }}>코드리뷰</code>, <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: '3px' }}>deploy</code>), AI 추천 탭에서 자연어로 목표를 설명해보세요.
          </div>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >확인</button>
        </div>
      </div>
    </div>
  )
}
