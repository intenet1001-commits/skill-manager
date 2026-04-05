#!/usr/bin/env python3
"""Capture browser console errors to diagnose hydration failure."""
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

        console_msgs = []
        errors = []

        page.on("console", lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: errors.append(str(err)))

        page.goto(BASE_URL, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(5000)

        print("=== CONSOLE MESSAGES ===")
        for msg in console_msgs:
            print(f"  {msg}")

        print("\n=== PAGE ERRORS ===")
        for err in errors:
            print(f"  {err}")

        print("\n=== NETWORK FAILED REQUESTS ===")
        # Check loaded scripts
        scripts = page.evaluate("""
            () => Array.from(document.querySelectorAll('script[src]')).map(s => s.src)
        """)
        for s in scripts:
            print(f"  script: {s}")

        # Check if React is loaded at all
        react_loaded = page.evaluate("""
            () => {
                // Check for React in global scope or webpack chunks
                return {
                    hasReact: typeof React !== 'undefined',
                    hasReactDOM: typeof ReactDOM !== 'undefined',
                    windowKeys: Object.keys(window).filter(k =>
                        k.includes('react') || k.includes('React') || k.includes('next') || k.includes('__next')
                    ).slice(0, 20)
                };
            }
        """)
        print(f"\n=== REACT STATE ===")
        print(f"  {react_loaded}")

        # Try clicking the button and watching for state change via MutationObserver
        print("\n=== Setting up MutationObserver and clicking ===")
        page.evaluate("""
            () => {
                window._mutations = [];
                const observer = new MutationObserver(mutations => {
                    mutations.forEach(m => {
                        if (m.type === 'childList') {
                            window._mutations.push({
                                type: 'childList',
                                added: m.addedNodes.length,
                                removed: m.removedNodes.length,
                                target: m.target.tagName
                            });
                        }
                    });
                });
                observer.observe(document.body, { childList: true, subtree: true });
                window._observer = observer;
            }
        """)

        # Click AI tab
        btns = page.query_selector_all("header button")
        btns[1].click()
        page.wait_for_timeout(2000)

        mutations = page.evaluate("() => window._mutations.slice(0, 20)")
        print(f"  DOM mutations after click: {mutations}")

        page.screenshot(path=os.path.join(SS_DIR, "d_console_test.png"))
        browser.close()

if __name__ == "__main__":
    run()
