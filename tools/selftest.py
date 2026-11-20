#!/usr/bin/env python3
"""Open the built page with #selftest and print how many of its in-page checks passed.

    python3 tools/selftest.py [file:///other/page.html]
"""
import sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = sys.argv[1] if len(sys.argv) > 1 else 'file://' + os.path.join(ROOT, 'dist', 'initiative-tracker.html')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url + '#selftest'); pg.wait_for_timeout(2500)
    lines = [l for l in pg.inner_text('body').splitlines() if 'checks passed' in l]
    print(lines[0] if lines else pg.inner_text('body')[:300]); print('page errors:', errs or 'none')
    b.close()
    sys.exit(0 if lines and not errs and lines[0].split()[0] == lines[0].split()[2] else 1)
