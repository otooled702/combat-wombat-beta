#!/usr/bin/env python3
"""Run one test function and, if it crashes, show the line that failed.

    python3 tests/run_one.py t_spells [file:///other/page.html]
"""
import sys, os, traceback
name = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
url = sys.argv[2] if len(sys.argv) > 2 else 'file://' + os.path.join(os.path.dirname(HERE), 'dist', 'initiative-tracker.html')
sys.argv = ['x', url]; sys.path.insert(0, HERE)
import battlemaster_tests as T
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    try: getattr(T, name)(b)
    except Exception as e:
        tb = [f for f in traceback.extract_tb(e.__traceback__) if 'battlemaster_tests' in f.filename][-1]
        print('CRASH at line', tb.lineno, ':', tb.line[:260]); print(str(e).splitlines()[0][:200])
        for l in str(e).splitlines()[1:6]: print('  ', l[:160])
    print('PASSED', T.passed, 'FAILED', T.failed)
    b.close()
