#!/usr/bin/env python3
"""Build dist/initiative-tracker.html (the app), dist/demo.html (the demo) and dist/beta.html (the beta, with test accounts) from src/.

    python3 build.py              build both into dist/
    python3 build.py --check      also check the JavaScript syntax (needs node)
    python3 build.py --out FILE   write the app somewhere else (the demo still goes to dist/)

The demo is the same code with DEMO switched on and the sample table from src/data/demo.json
(made by tools/demo/make_demo.py).

The result is the single self-contained HTML file that gets published.
Order matters: CSS and JS files are joined in file-name order (01-, 02-, ...).
"""
import os, sys, subprocess, re, tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')

def read(*p):
    with open(os.path.join(SRC, *p), encoding='utf-8', newline='') as f:
        return f.read()

def joined(folder, ext):
    files = sorted(f for f in os.listdir(os.path.join(SRC, folder)) if f.endswith(ext))
    return ''.join(read(folder, f) for f in files), files

DEMO_FLAG = 'var DEMO=false/*@demo*/;'

def favicon_svg():
    """The browser-tab icon: the wombat mark from 12-dm-screen.js on a square canvas, dark on light tabs and light on dark ones."""
    src = read('js', '12-dm-screen.js')
    paths = re.search(r"var LOGO_PATHS='(.*?)';", src, re.S).group(1).replace(' class="lg-k"', '')
    x0, y0, w, h = (float(v) for v in re.search(r"var LOGO_VB='([^']+)'", src).group(1).split())
    side = max(w, h); vb = '%g %g %g %g' % (x0 - (side - w) / 2, y0 - (side - h) / 2, side, side)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><style>path{fill:#1A1A1A}'
            '@media (prefers-color-scheme:dark){path{fill:#F8F8F2}}</style>%s</svg>' % (vb, paths))

def favicon_uri():
    from urllib.parse import quote
    return 'data:image/svg+xml,' + quote(favicon_svg(), safe=" =:/'-.,()")
BETA_FLAG = 'var BETA=false/*@beta*/;'

def build(demo=False, beta=False):
    tpl = read('index.template.html')
    css, cfiles = joined('css', '.css')
    js, jfiles = joined('js', '.js')
    if js.count(DEMO_FLAG) != 1:
        raise SystemExit('the DEMO flag line is missing from src/js')
    if js.count(BETA_FLAG) != 1:
        raise SystemExit('the BETA flag line is missing from src/js')
    if demo:
        js = js.replace(DEMO_FLAG, 'var DEMO=true;')
    if beta:
        js = js.replace(BETA_FLAG, 'var BETA=true;')
    out = tpl
    for key, val in (('{{FAVICON}}', favicon_uri()), ('{{CSS}}', css), ('{{DEMODATA}}', read('data', 'demo.json') if (demo or beta) else 'null'), ('{{QRLIB}}', read('vendor', 'qrcode-generator-1.4.4.js')), ('{{MMDATA}}', read('data', 'monsters.json')), ('{{SPDATA}}', read('data', 'spells.json')), ('{{JS}}', js)):
        if out.count(key) != 1:
            raise SystemExit('template problem: %s appears %d times' % (key, out.count(key)))
        out = out.replace(key, val)
    return out, js, cfiles, jfiles

def main():
    args = sys.argv[1:]
    dest = os.path.join(ROOT, 'dist', 'initiative-tracker.html')
    if '--out' in args:
        dest = os.path.abspath(args[args.index('--out') + 1])
    out, js, cfiles, jfiles = build()
    if '--check' in args:
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t:
            t.write(js); tmp = t.name
        try:
            r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        except FileNotFoundError:
            print('node not found: skipped the syntax check'); r = None
        os.unlink(tmp)
        if r is not None:
            if r.returncode:
                print(r.stderr); raise SystemExit('JavaScript syntax error')
            print('JavaScript syntax OK')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8', newline='') as f:
        f.write(out)
    print('built %s (%d KB: %d css files, %d js files)' % (os.path.relpath(dest, ROOT), len(out.encode('utf-8')) // 1024, len(cfiles), len(jfiles)))
    dout = build(demo=True)[0]
    ddest = os.path.join(ROOT, 'dist', 'demo.html')
    with open(ddest, 'w', encoding='utf-8', newline='') as f:
        f.write(dout)
    print('built %s (%d KB, the demo)' % (os.path.relpath(ddest, ROOT), len(dout.encode('utf-8')) // 1024))
    bout = build(beta=True)[0]
    bdest = os.path.join(ROOT, 'dist', 'beta.html')
    with open(bdest, 'w', encoding='utf-8', newline='') as f:
        f.write(bout)
    print('built %s (%d KB, the beta with test accounts)' % (os.path.relpath(bdest, ROOT), len(bout.encode('utf-8')) // 1024))

if __name__ == '__main__':
    main()
