#!/usr/bin/env python3
"""Final diagnostic: visit page, wait for full compilation, test tab switching."""
import time
import os
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:9025"
SS_DIR = "/Users/gwanli/Documents/GitHub/myproduct_v4/Skill_manager_1/tests/results/screenshots"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=100)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        responses = {}
        page.on("response", lambda r: responses.update({r.url.split('?')[0].split('/')[-1]: r.status}))

        print("Navigating to page (triggers on-demand compilation)...")
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60000)

        # Wait up to 30s for main-app.js to arrive — it compiles on first request
        print("Waiting for main-app.js (up to 30s)...")
        for i in range(60):
            time.sleep(0.5)
            main_status = responses.get("main-app.js")
            if main_status and main_status == 200:
                print(f"  main-app.js loaded successfully at t+{(i+1)*0.5:.1f}s!")
                break
            if i % 10 == 9:
                print(f"  t+{(i+1)*0.5:.1f}s: main-app.js={main_status}, responses={list(responses.keys())[:10]}")

        # Check React hydration
        print("\nChecking React hydration...")
        for i in range(20):
            time.sleep(0.5)
            fiber_ok = page.evaluate("""
                () => {
                    const btn = document.querySelector('header button');
                    if (!btn) return false;
                    return Object.keys(btn).some(k => k.startsWith('__react'));
                }
            """)
            if fiber_ok:
                print(f"  React hydrated at t+{(i+1)*0.5:.1f}s!")
                break
            if i == 19:
                print("  React NOT hydrated after 10s")

        # Check button state
        btn_states = page.evaluate("""
            () => Array.from(document.querySelectorAll('header button')).map(b => ({
                text: b.textContent.trim()[:20],
                bg: b.style.background,
            }))
        """)
        print(f"\nButton states: {btn_states}")

        # Click AI tab
        print("\nClicking AI tab...")
        btns = page.query_selector_all("header button")
        if len(btns) >= 2:
            btns[1].click()
            time.sleep(1.5)

            ai_content = page.query_selector("text=프로젝트 폴더 열기")
            filter_content = page.query_selector("text=PDCA PHASE")
            btn_states2 = page.evaluate("""
                () => Array.from(document.querySelectorAll('header button')).map(b => ({
                    text: b.textContent.trim(),
                    bg: b.style.background,
                }))
            """)
            print(f"  AI panel: {bool(ai_content)}")
            print(f"  Filter panel: {bool(filter_content)}")
            print(f"  Button states after click: {btn_states2}")
            page.screenshot(path=os.path.join(SS_DIR, "final_ai_tab.png"))

        # All JS responses
        print(f"\nAll responses: {dict(list(responses.items())[:15])}")

        browser.close()

if __name__ == "__main__":
    run()
