#!/usr/bin/env python3
"""Debug: wait for React hydration before clicking tab."""
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

        # Wait for React hydration: the hidden div should become empty or React fiber attaches
        # Strategy: poll until clicking a button changes its style
        print("=== Waiting for React hydration ===")
        hydrated = False
        for i in range(20):
            page.wait_for_timeout(500)
            # Check if the React fiber is attached to header buttons
            is_hydrated = page.evaluate("""
                () => {
                    const btn = document.querySelector('header button');
                    if (!btn) return false;
                    // Check for React internal properties
                    const keys = Object.keys(btn);
                    return keys.some(k => k.startsWith('__react') || k.startsWith('_reactFiber'));
                }
            """)
            print(f"  t+{(i+1)*0.5:.1f}s: hydrated={is_hydrated}")
            if is_hydrated:
                hydrated = True
                break

        print(f"\nHydration detected: {hydrated}")

        # Now try clicking and check if state changes
        print("\n=== Clicking AI tab after hydration wait ===")
        header_btns = page.query_selector_all("header button")
        if len(header_btns) >= 2:
            # Check initial state
            initial_state = page.evaluate("""
                () => {
                    const btns = document.querySelectorAll('header button');
                    return Array.from(btns).map(b => b.style.background);
                }
            """)
            print(f"  Initial btn backgrounds: {initial_state}")

            # Click the AI tab
            header_btns[1].click()
            page.wait_for_timeout(1000)

            # Check state after click
            after_state = page.evaluate("""
                () => {
                    const btns = document.querySelectorAll('header button');
                    return Array.from(btns).map(b => b.style.background);
                }
            """)
            print(f"  After click btn backgrounds: {after_state}")

            # Check for AI panel content
            ai_content = page.query_selector("text=프로젝트 폴더 열기")
            filter_content = page.query_selector("text=PDCA PHASE")
            print(f"  AI panel visible: {bool(ai_content)}")
            print(f"  Filter panel visible: {bool(filter_content)}")

            page.screenshot(path=os.path.join(SS_DIR, "d3_after_click.png"))

            # If still not working, try waiting for the hidden div to clear
            print("\n=== Checking hidden div state ===")
            hidden_html = page.evaluate("""
                () => {
                    const hidden = document.querySelector('[hidden]');
                    return hidden ? hidden.innerHTML.substring(0, 200) : 'no hidden div';
                }
            """)
            print(f"  Hidden div: {hidden_html}")

            # Try force-dispatching a React synthetic event
            print("\n=== Trying dispatchEvent approach ===")
            page.evaluate("""
                () => {
                    const btns = document.querySelectorAll('header button');
                    const aiBtn = btns[1];
                    // Simulate a full mouse event sequence
                    aiBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                    aiBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                    aiBtn.dispatchEvent(new MouseEvent('click', {bubbles: true}));
                }
            """)
            page.wait_for_timeout(1000)
            ai_content2 = page.query_selector("text=프로젝트 폴더 열기")
            print(f"  After dispatchEvent - AI panel: {bool(ai_content2)}")
            page.screenshot(path=os.path.join(SS_DIR, "d3_after_dispatch.png"))

        browser.close()

if __name__ == "__main__":
    run()
