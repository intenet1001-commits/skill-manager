#!/usr/bin/env python3
"""Warm up the Next.js dev server by visiting the page and waiting for full compilation."""
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

        all_responses = {}
        page.on("response", lambda r: all_responses.update({r.url: r.status}))

        print("=== First visit — triggering compilation ===")
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
        # Wait for all scripts to load including lazy ones
        page.wait_for_timeout(5000)

        main_app_status = {url: s for url, s in all_responses.items() if 'main-app' in url}
        print(f"  main-app responses: {main_app_status}")

        # Check React loaded
        react_ok = page.evaluate("() => typeof window.__next_f !== 'undefined'")
        print(f"  __next_f loaded: {react_ok}")

        # Check for React fiber on buttons
        fiber_ok = page.evaluate("""
            () => {
                const btn = document.querySelector('header button');
                if (!btn) return false;
                return Object.keys(btn).some(k => k.startsWith('__react'));
            }
        """)
        print(f"  React fiber on buttons: {fiber_ok}")

        # Wait longer if needed
        if not fiber_ok:
            print("  Waiting more for hydration...")
            page.wait_for_timeout(5000)
            fiber_ok = page.evaluate("""
                () => {
                    const btn = document.querySelector('header button');
                    if (!btn) return false;
                    return Object.keys(btn).some(k => k.startsWith('__react'));
                }
            """)
            print(f"  React fiber after extra wait: {fiber_ok}")

        # Try clicking now
        print("\n=== Clicking AI tab ===")
        btns = page.query_selector_all("header button")
        print(f"  Found {len(btns)} header buttons")
        if len(btns) >= 2:
            btns[1].click()
            page.wait_for_timeout(2000)

            ai_content = page.query_selector("text=프로젝트 폴더 열기")
            filter_content = page.query_selector("text=PDCA PHASE")
            print(f"  AI panel visible: {bool(ai_content)}")
            print(f"  Filter panel visible: {bool(filter_content)}")

            btn_states = page.evaluate("""
                () => Array.from(document.querySelectorAll('header button')).map(b => ({
                    text: b.textContent.trim(),
                    bg: b.style.background,
                }))
            """)
            print(f"  Button states: {btn_states}")

            page.screenshot(path=os.path.join(SS_DIR, "warmup_after_click.png"))

        # Show all network responses for JS
        print("\n=== All JS responses ===")
        for url, status in all_responses.items():
            if '.js' in url:
                print(f"  [{status}] {url[-80:]}")

        browser.close()

if __name__ == "__main__":
    run()
