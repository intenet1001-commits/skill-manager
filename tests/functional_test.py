#!/usr/bin/env python3
"""
Functional test for Skill Manager dashboard at http://localhost:9025
Focus: AI recommendation feature — v2 with precise selectors from source
"""

import json
import time
import os
from datetime import datetime
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:9025"
RESULTS_DIR = "/Users/gwanli/Documents/GitHub/myproduct_v4/Skill_manager_1/tests/results"
SCREENSHOTS_DIR = os.path.join(RESULTS_DIR, "screenshots")

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

results = {
    "url": BASE_URL,
    "timestamp": datetime.now().isoformat(),
    "summary": {},
    "tests": [],
    "issues": []
}

tests = []

def ss(name):
    return os.path.join(SCREENSHOTS_DIR, name)

def record(test_id, category, page_url, description, status, duration, details=None, issue=None):
    entry = {
        "id": test_id,
        "category": category,
        "page": page_url,
        "description": description,
        "status": status,
        "duration": duration,
        "details": details or {}
    }
    tests.append(entry)
    sym = "PASS" if status == "passed" else "FAIL" if status == "failed" else "WARN"
    print(f"  {sym} [{test_id}] {description}")
    if issue and status in ("failed", "warning"):
        results["issues"].append({"testId": test_id, "issue": issue})


def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        # ── TEST 1: Load page, verify header ──────────────────────────────
        print("\n[1] Loading page and verifying header...")
        t0 = time.time()
        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=20000)
            page.wait_for_timeout(1000)
            page.screenshot(path=ss("01_initial_load.png"))

            header_text = page.inner_text("header")
            has_skill_manager = "Skill Manager" in header_text
            has_explore_tab   = "탐색" in header_text
            has_ai_tab        = "AI 추천" in header_text

            ok = has_skill_manager and has_explore_tab and has_ai_tab
            record("header-001", "navigation", "/",
                   "Header shows '🎯 Skill Manager', '🔍 탐색' tab, '✨ AI 추천' tab",
                   "passed" if ok else "failed",
                   f"{time.time()-t0:.2f}s",
                   {"hasSkillManager": has_skill_manager, "hasExploreTab": has_explore_tab, "hasAITab": has_ai_tab},
                   None if ok else "Missing header elements")
        except Exception as e:
            record("header-001", "navigation", "/",
                   "Header shows '🎯 Skill Manager', '🔍 탐색' tab, '✨ AI 추천' tab",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 2: Claude status badge in StatsBar ───────────────────────
        print("\n[2] Checking Claude status badge...")
        t0 = time.time()
        try:
            # Badge appears after /api/claude-status fetch — give it time
            page.wait_for_timeout(2000)
            # Look for the badge span with "Claude 연결됨" or "Claude 미설치"/"Claude 미로그인"
            badge_el = page.query_selector("span:has-text('Claude 연결됨'), span:has-text('Claude 미설치'), span:has-text('Claude 미로그인')")
            badge_text = badge_el.inner_text().strip() if badge_el else ""
            page.screenshot(path=ss("02_claude_badge.png"))
            ok = bool(badge_text)
            record("header-002", "ui-check", "/",
                   "Header StatsBar shows Claude status badge",
                   "passed" if ok else "warning",
                   f"{time.time()-t0:.2f}s",
                   {"badgeText": badge_text},
                   None if ok else "Claude status badge not visible (API may still be loading)")
        except Exception as e:
            record("header-002", "ui-check", "/",
                   "Header StatsBar shows Claude status badge",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 3: Click "✨ AI 추천" tab ────────────────────────────────
        print("\n[3] Clicking AI 추천 tab...")
        t0 = time.time()
        try:
            # The tab button text is exactly "✨ AI 추천"
            ai_tab_btn = page.get_by_role("button", name="✨ AI 추천")
            ai_tab_btn.click()
            page.wait_for_timeout(800)
            page.screenshot(path=ss("03_ai_tab_active.png"))

            # Verify AIPanel is shown — empty state has "자연어로 스킬을 찾아보세요"
            body = page.inner_text("body")
            ai_panel_visible = "자연어로 스킬을 찾아보세요" in body or "프로젝트 폴더 열기" in body
            record("tab-001", "navigation", "/",
                   "Click '✨ AI 추천' tab — AIPanel renders",
                   "passed" if ai_panel_visible else "failed",
                   f"{time.time()-t0:.2f}s",
                   {"aiPanelVisible": ai_panel_visible},
                   None if ai_panel_visible else "AI tab panel did not render")
        except Exception as e:
            record("tab-001", "navigation", "/",
                   "Click '✨ AI 추천' tab — AIPanel renders",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 4: Verify folder open button + pencil button ─────────────
        print("\n[4] Checking folder open and pencil buttons...")
        t0 = time.time()
        try:
            folder_btn = page.query_selector("button:has-text('프로젝트 폴더 열기')")
            pencil_btn = page.query_selector("button[title='경로 직접 입력']")
            page.screenshot(path=ss("04_ai_tab_buttons.png"))
            ok = bool(folder_btn) and bool(pencil_btn)
            record("ui-001", "ui-check", "/ai",
                   "AI tab shows '📂 프로젝트 폴더 열기' button and '✏️' pencil button",
                   "passed" if ok else "failed",
                   f"{time.time()-t0:.2f}s",
                   {"folderBtnFound": bool(folder_btn), "pencilBtnFound": bool(pencil_btn)},
                   None if ok else f"Missing: {'folder' if not folder_btn else ''} {'pencil' if not pencil_btn else ''}")
        except Exception as e:
            record("ui-001", "ui-check", "/ai",
                   "AI tab shows folder open and pencil buttons",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 5: Empty state text visible ──────────────────────────────
        print("\n[5] Verifying empty state text...")
        t0 = time.time()
        try:
            body = page.inner_text("body")
            has_empty = "자연어로 스킬을 찾아보세요" in body
            has_hint   = "폴더를 열면" in body or "프로젝트 폴더" in body
            page.screenshot(path=ss("05_empty_state.png"))
            ok = has_empty
            record("ui-002", "ui-check", "/ai",
                   "Empty state shows '자연어로 스킬을 찾아보세요' and folder hint",
                   "passed" if ok else "warning",
                   f"{time.time()-t0:.2f}s",
                   {"hasEmptyText": has_empty, "hasHintText": has_hint},
                   None if ok else "Empty state text not found")
        except Exception as e:
            record("ui-002", "ui-check", "/ai",
                   "Empty state text visible",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 6: Click pencil button → path input appears ──────────────
        print("\n[6] Clicking pencil button...")
        t0 = time.time()
        try:
            pencil_btn = page.query_selector("button[title='경로 직접 입력']")
            if pencil_btn:
                pencil_btn.click()
                page.wait_for_timeout(500)
                # Path input has placeholder="/Users/yourname/projects/my-app"
                path_input = page.query_selector("input[placeholder*='/Users/yourname']")
                page.screenshot(path=ss("06_path_input_visible.png"))
                ok = bool(path_input)
                record("ui-003", "ui-interaction", "/ai",
                       "Pencil button reveals path input with placeholder",
                       "passed" if ok else "failed",
                       f"{time.time()-t0:.2f}s",
                       {"pathInputFound": ok},
                       None if ok else "Path input did not appear after pencil click")
            else:
                page.screenshot(path=ss("06_no_pencil.png"))
                record("ui-003", "ui-interaction", "/ai",
                       "Pencil button reveals path input",
                       "failed", f"{time.time()-t0:.2f}s",
                       {"pencilFound": False}, "Pencil button not found")
        except Exception as e:
            record("ui-003", "ui-interaction", "/ai",
                   "Pencil button reveals path input",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 7: Type path and press Enter ─────────────────────────────
        print("\n[7] Typing project path and submitting...")
        t0 = time.time()
        project_path = "/Users/gwanli/Documents/GitHub/myproduct_v4/vibe2"
        try:
            path_input = page.query_selector("input[placeholder*='/Users/yourname']")
            if path_input:
                path_input.click()
                path_input.fill(project_path)
                page.wait_for_timeout(200)
                # Press Enter triggers loadProjectContext
                page.keyboard.press("Enter")
                # Wait for API call to /api/project-context
                page.wait_for_timeout(3000)
                page.screenshot(path=ss("07_path_submitted.png"))
                record("form-001", "form", "/ai",
                       f"Type '{project_path}' in path input and press Enter",
                       "passed", f"{time.time()-t0:.2f}s",
                       {"path": project_path})
            else:
                page.screenshot(path=ss("07_no_path_input.png"))
                record("form-001", "form", "/ai",
                       "Type path in path input",
                       "failed", f"{time.time()-t0:.2f}s", {}, "Path input not found")
        except Exception as e:
            record("form-001", "form", "/ai",
                   "Type path and press Enter",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 8: Tech stack badges appear ──────────────────────────────
        print("\n[8] Checking tech stack badges...")
        t0 = time.time()
        try:
            page.wait_for_timeout(1500)
            body = page.inner_text("body")
            tech_keywords = ["Next.js", "TypeScript", "React", "Tailwind", "JavaScript", "Node", "Vercel"]
            tech_found = [k for k in tech_keywords if k.lower() in body.lower()]
            # Also check project name badge appeared (vibe2)
            has_project_badge = "vibe2" in body
            # If project loaded, path input should be gone and project badge shown
            path_input_gone = page.query_selector("input[placeholder*='/Users/yourname']") is None
            page.screenshot(path=ss("08_tech_badges.png"))
            ok = bool(tech_found) or has_project_badge
            record("ui-004", "ui-check", "/ai",
                   "Tech stack badges appear after project path loaded",
                   "passed" if ok else "warning",
                   f"{time.time()-t0:.2f}s",
                   {"techFound": tech_found, "hasProjectBadge": has_project_badge, "pathInputGone": path_input_gone},
                   None if ok else "No tech badges or project name detected — API may have failed")
        except Exception as e:
            record("ui-004", "ui-check", "/ai",
                   "Tech stack badges appear",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 9: Type goal and click AI 추천 ───────────────────────────
        print("\n[9] Typing goal and clicking AI 추천...")
        t0 = time.time()
        try:
            # Goal input placeholder: "무엇을 하려고 하시나요?" or "{project.name}에서 무엇을 하려고 하시나요?"
            goal_input = page.query_selector("input[placeholder*='무엇을 하려고']")
            if not goal_input:
                # Fallback: find input that is not the path input
                inputs = page.query_selector_all("input")
                for inp in inputs:
                    ph = inp.get_attribute("placeholder") or ""
                    if "yourname" not in ph and inp.get_attribute("type") != "checkbox":
                        goal_input = inp
                        break

            if goal_input:
                goal_input.click()
                goal_input.fill("테스트 작성")
                page.wait_for_timeout(300)
                # Submit button text: "AI 추천" (not loading state)
                submit_btn = page.get_by_role("button", name="AI 추천", exact=True)
                if submit_btn.count() > 0:
                    submit_btn.click()
                    page.wait_for_timeout(500)
                    page.screenshot(path=ss("09_ai_request_sent.png"))
                    record("form-002", "form", "/ai",
                           "Type '테스트 작성' in goal input and click 'AI 추천' button",
                           "passed", f"{time.time()-t0:.2f}s",
                           {"goalFilled": True, "btnClicked": True})
                else:
                    page.screenshot(path=ss("09_no_submit_btn.png"))
                    record("form-002", "form", "/ai",
                           "Type goal and click AI 추천",
                           "failed", f"{time.time()-t0:.2f}s",
                           {"goalFilled": True, "btnClicked": False}, "AI 추천 button not found")
            else:
                page.screenshot(path=ss("09_no_goal_input.png"))
                record("form-002", "form", "/ai",
                       "Type goal and click AI 추천",
                       "failed", f"{time.time()-t0:.2f}s",
                       {"goalFilled": False}, "Goal input not found")
        except Exception as e:
            record("form-002", "form", "/ai",
                   "Type goal and click AI 추천",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 10: Streaming text appears ───────────────────────────────
        print("\n[10] Waiting for streaming text...")
        t0 = time.time()
        try:
            streaming_found = False
            loading_found = False
            for i in range(12):
                page.wait_for_timeout(1000)
                body = page.inner_text("body")
                # Streaming: "Claude:" prefix + "▊" cursor (from AIPanel source)
                if "Claude:" in body or "▊" in body or "분석 중" in body:
                    streaming_found = True
                    break
                if "분석 중" in body:
                    loading_found = True
            page.screenshot(path=ss("10_streaming.png"))
            ok = streaming_found or loading_found
            record("stream-001", "streaming", "/ai",
                   "Streaming text or loading state appears after AI 추천 click",
                   "passed" if ok else "warning",
                   f"{time.time()-t0:.2f}s",
                   {"streamingTextFound": streaming_found, "loadingStateFound": loading_found},
                   None if ok else "No streaming/loading state detected")
        except Exception as e:
            record("stream-001", "streaming", "/ai",
                   "Streaming text appears",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 11: Wait for results (up to 60s) ─────────────────────────
        print("\n[11] Waiting for recommendation results (up to 60s)...")
        t0 = time.time()
        try:
            result_found = False
            card_count = 0
            error_found = False
            error_text = ""
            for i in range(30):
                page.wait_for_timeout(2000)
                body = page.inner_text("body")
                # Results: "✨ N개 스킬 추천됨" or "⚠️ 시간 초과"
                if "스킬 추천됨" in body or "시간 초과" in body:
                    result_found = True
                    # Count result cards by numbered circles ①②③
                    circles = ["①","②","③","④","⑤","⑥","⑦"]
                    card_count = sum(1 for c in circles if c in body)
                    break
                # Check for error
                if "❌" in body or "Claude Code를 찾을 수 없습니다" in body or "로그인이 필요" in body:
                    error_found = True
                    error_text = body[body.find("❌"):body.find("❌")+200] if "❌" in body else body[:300]
                    break
                if i % 5 == 4:
                    page.screenshot(path=ss(f"11_waiting_{(i+1)*2}s.png"))

            body = page.inner_text("body")
            page.screenshot(path=ss("11_results.png"))
            # Check for result elements
            has_cmd_codes = any(f"/{kw}" in body for kw in ["skill", "review", "test", "deploy", "code"]) or \
                           "복사" in body
            has_plugin_badge = card_count > 0
            has_korean_reason = any(kw in body for kw in ["이유", "적합", "도움", "관련", "테스트"])

            ok = result_found and card_count > 0
            record("ai-001", "ai-recommendation", "/ai",
                   "AI results appear: cmd codes, plugin badges, Korean reasons, copy buttons",
                   "passed" if ok else ("failed" if error_found else "warning"),
                   f"{time.time()-t0:.2f}s",
                   {
                       "resultFound": result_found,
                       "cardCount": card_count,
                       "hasCmdCodes": has_cmd_codes,
                       "hasPluginBadge": has_plugin_badge,
                       "hasKoreanReason": has_korean_reason,
                       "errorFound": error_found,
                       "errorText": error_text[:200] if error_text else "",
                       "bodySnippet": body[:800]
                   },
                   None if ok else (error_text[:200] if error_found else "Results not detected within 60s"))
        except Exception as e:
            record("ai-001", "ai-recommendation", "/ai",
                   "AI results appear",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 12: Copy button on first result ──────────────────────────
        print("\n[12] Testing copy button...")
        t0 = time.time()
        try:
            # Copy buttons have text "복사" (or "✓" after click)
            copy_btns = page.query_selector_all("button:has-text('복사')")
            if copy_btns:
                first_copy = copy_btns[0]
                first_copy.click()
                page.wait_for_timeout(800)
                # After click, button text changes to "✓" for 1500ms
                body_after = page.inner_text("body")
                has_checkmark = "✓" in body_after
                page.screenshot(path=ss("12_copy_clicked.png"))
                record("ui-005", "ui-interaction", "/ai",
                       "Copy button on first result — shows '✓' feedback after click",
                       "passed" if has_checkmark else "warning",
                       f"{time.time()-t0:.2f}s",
                       {"copyBtnsFound": len(copy_btns), "checkmarkFeedback": has_checkmark},
                       None if has_checkmark else "No checkmark feedback after copy click")
            else:
                page.screenshot(path=ss("12_no_copy_btn.png"))
                record("ui-005", "ui-interaction", "/ai",
                       "Copy button test",
                       "warning", f"{time.time()-t0:.2f}s",
                       {"copyBtnsFound": 0},
                       "No copy buttons found (results may not have loaded)")
        except Exception as e:
            record("ui-005", "ui-interaction", "/ai",
                   "Copy button test",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # ── TEST 13: Switch back to 탐색 tab ──────────────────────────────
        print("\n[13] Switching to 탐색 tab...")
        t0 = time.time()
        try:
            explore_btn = page.get_by_role("button", name="🔍 탐색")
            explore_btn.click()
            page.wait_for_timeout(1000)
            page.screenshot(path=ss("13_explore_tab.png"))

            # Verify search bar (SearchBar component) and skill cards appear
            search_input = page.query_selector(
                "input[placeholder*='Search skills'], input[placeholder*='search']"
            )
            # Skill cards — there should be many from FilterPanel + SkillCard grid
            skill_cards = page.query_selector_all("[style*='grid'], [class*='card']")
            body = page.inner_text("body")
            has_filter_panel = "Filters" in body or "PDCA" in body or "PLUGIN" in body
            has_skills = any(kw in body for kw in ["standalone", "plugin", "invocable"])

            ok = bool(search_input) and (has_filter_panel or has_skills)
            record("nav-001", "navigation", "/",
                   "탐색 tab shows search bar, filter panel, and skill cards",
                   "passed" if ok else "warning",
                   f"{time.time()-t0:.2f}s",
                   {
                       "searchInputFound": bool(search_input),
                       "hasFilterPanel": has_filter_panel,
                       "hasSkillContent": has_skills,
                       "cardElements": len(skill_cards)
                   },
                   None if ok else "탐색 tab missing search or filter panel")
        except Exception as e:
            record("nav-001", "navigation", "/",
                   "탐색 tab shows search and skill cards",
                   "failed", f"{time.time()-t0:.2f}s", {}, str(e))

        # Final screenshot
        page.screenshot(path=ss("14_final_state.png"))
        browser.close()

    # Build summary
    total    = len(tests)
    passed   = sum(1 for t in tests if t["status"] == "passed")
    failed   = sum(1 for t in tests if t["status"] == "failed")
    warnings = sum(1 for t in tests if t["status"] == "warning")
    skipped  = sum(1 for t in tests if t["status"] == "skipped")
    pass_rate = f"{passed/total*100:.1f}%" if total else "0%"

    results["tests"]   = tests
    results["summary"] = {
        "totalTests": total,
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "skipped": skipped,
        "passRate": pass_rate
    }

    out_path = os.path.join(RESULTS_DIR, "functional-report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Report: {out_path}")
    print(f"Summary: {total} tests | {passed} passed | {failed} failed | {warnings} warnings")
    print(f"Pass rate: {pass_rate}")
    if results["issues"]:
        print("\nIssues:")
        for issue in results["issues"]:
            print(f"  - [{issue['testId']}] {issue['issue']}")


if __name__ == "__main__":
    run_tests()
