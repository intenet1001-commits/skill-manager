#!/usr/bin/env python3
"""Debug tab switching — check if React state change actually updates DOM."""
import time
import os
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:9025"
SS_DIR = "/Users/gwanli/Documents/GitHub/myproduct_v4/Skill_manager_1/tests/results/screenshots"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        page.goto(BASE_URL, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(3000)  # Extra time for React hydration

        print("=== State before click ===")
        # Check if sidebar (FilterPanel) is in DOM
        filter_panel = page.query_selector("text=PDCA PHASE")
        print(f"  FilterPanel visible: {bool(filter_panel)}")

        # Check what React thinks mode is via DOM inspection
        result = page.evaluate("""
            () => {
                // Find mode tab buttons
                const btns = Array.from(document.querySelectorAll('header button'));
                return btns.map(b => ({
                    text: b.textContent,
                    bg: b.style.background,
                    fontWeight: b.style.fontWeight,
                }));
            }
        """)
        print(f"  Tab button states: {result}")

        # Click AI tab button
        header_btns = page.query_selector_all("header button")
        print(f"\n  Clicking btn[1]: {repr(header_btns[1].inner_text())}")
        header_btns[1].click()

        # Wait and check DOM immediately
        for i in range(10):
            page.wait_for_timeout(500)
            # Check for AIPanel-specific content
            ai_content = page.query_selector("text=프로젝트 폴더 열기")
            filter_content = page.query_selector("text=PDCA PHASE")
            body_html = page.evaluate("() => document.body.innerHTML.substring(0, 500)")
            print(f"\n  t+{(i+1)*0.5}s: aiContent={bool(ai_content)}, filterContent={bool(filter_content)}")
            if ai_content:
                print("  AI PANEL FOUND!")
                page.screenshot(path=os.path.join(SS_DIR, f"d_ai_found_{i}.png"))
                break
            if i == 4:
                page.screenshot(path=os.path.join(SS_DIR, "d_still_browse.png"))
                print(f"  body html snippet: {body_html[:300]}")

        # Check tab button styles after click
        result2 = page.evaluate("""
            () => {
                const btns = Array.from(document.querySelectorAll('header button'));
                return btns.map(b => ({
                    text: b.textContent,
                    bg: b.style.background,
                    fontWeight: b.style.fontWeight,
                    color: b.style.color,
                }));
            }
        """)
        print(f"\n  Tab states after click: {result2}")

        # Check if React fiber has mode state
        react_state = page.evaluate("""
            () => {
                // Find the Dashboard component's React fiber
                const container = document.querySelector('[style*="flex-direction: column"]');
                if (!container) return 'no container';
                let fiber = container.__reactFiber || container._reactRootContainer;
                return fiber ? 'fiber found' : 'no fiber';
            }
        """)
        print(f"\n  React fiber: {react_state}")

        page.screenshot(path=os.path.join(SS_DIR, "d_final.png"))
        browser.close()

if __name__ == "__main__":
    run()
