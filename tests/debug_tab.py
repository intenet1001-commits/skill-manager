#!/usr/bin/env python3
"""Debug script to diagnose AI tab switching issue."""
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
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(SS_DIR, "d01_loaded.png"))

        # List all buttons in the header
        print("=== ALL HEADER BUTTONS ===")
        header_btns = page.query_selector_all("header button")
        for i, btn in enumerate(header_btns):
            text = btn.inner_text().strip()
            box = btn.bounding_box()
            print(f"  btn[{i}]: text={repr(text)} box={box}")

        # Try clicking the 2nd header button (AI 추천 tab)
        print("\n=== Clicking header button index 1 (AI tab) ===")
        if len(header_btns) >= 2:
            ai_btn = header_btns[1]
            print(f"  Button text: {repr(ai_btn.inner_text())}")
            ai_btn.click()
            page.wait_for_timeout(1000)
            page.screenshot(path=os.path.join(SS_DIR, "d02_after_ai_click.png"))
            body = page.inner_text("body")
            print(f"  Body contains '자연어': {'자연어' in body}")
            print(f"  Body contains '프로젝트 폴더': {'프로젝트 폴더' in body}")
            print(f"  Body contains 'Filters': {'Filters' in body}")
            print(f"  Body snippet: {body[:300]}")

        # Try JavaScript click
        print("\n=== Trying JS click on AI tab ===")
        page.evaluate("""
            () => {
                const btns = document.querySelectorAll('header button');
                console.log('Header buttons:', btns.length);
                btns.forEach((b, i) => console.log(i, b.textContent));
                // Click the one with AI text
                for (const btn of btns) {
                    if (btn.textContent.includes('AI')) {
                        btn.click();
                        console.log('Clicked AI button');
                        break;
                    }
                }
            }
        """)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(SS_DIR, "d03_after_js_click.png"))
        body = page.inner_text("body")
        print(f"  After JS click - body contains '자연어': {'자연어' in body}")
        print(f"  After JS click - body contains 'Filters': {'Filters' in body}")

        # Check if it's a hydration issue — wait longer after initial load
        print("\n=== Reloading and waiting for full hydration ===")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(3000)  # Wait for React hydration

        # Now check buttons again
        header_btns = page.query_selector_all("header button")
        print(f"  Header buttons after reload: {len(header_btns)}")
        for i, btn in enumerate(header_btns):
            print(f"  btn[{i}]: {repr(btn.inner_text().strip())}")

        if len(header_btns) >= 2:
            ai_btn = header_btns[1]
            ai_btn.click()
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(SS_DIR, "d04_after_hydrated_click.png"))
            body = page.inner_text("body")
            print(f"  Body contains '자연어': {'자연어' in body}")
            print(f"  Body contains 'Filters': {'Filters' in body}")
            print(f"  Body snippet: {body[:400]}")

        browser.close()

if __name__ == "__main__":
    run()
