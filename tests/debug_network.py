#!/usr/bin/env python3
"""Capture all network requests to find which 404s are blocking hydration."""
import time
import os
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:9025"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        failed = []
        all_requests = []

        page.on("response", lambda r: all_requests.append((r.status, r.url)))
        page.on("requestfailed", lambda r: failed.append((r.failure, r.url)))

        page.goto(BASE_URL, wait_until="networkidle", timeout=20000)
        page.wait_for_timeout(3000)

        print("=== FAILED REQUESTS ===")
        for f in failed:
            print(f"  FAIL: {f}")

        print("\n=== ALL RESPONSES (non-200) ===")
        for status, url in all_requests:
            if status != 200:
                print(f"  [{status}] {url}")

        print("\n=== ALL JS RESPONSES ===")
        for status, url in all_requests:
            if '.js' in url or '_next' in url:
                print(f"  [{status}] {url}")

        browser.close()

if __name__ == "__main__":
    run()
