#!/usr/bin/env python3
"""Assemble the GitHub Pages site for the beta (run after build.py).

    python3 tools/site/make_site.py [OUT_DIR]        default OUT_DIR: _site

    OUT_DIR/index.html   the testers' landing page (src/site/index.html)
    OUT_DIR/app.html     the beta app with test accounts (dist/beta.html)
    OUT_DIR/demo.html    the public demo (dist/demo.html)

The repository named on the page comes from GITHUB_REPOSITORY (set in GitHub Actions),
else from REPO, else otooled702/combat-wombat-beta.
"""
import os, re, sys, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '_site'))
repo = os.environ.get('GITHUB_REPOSITORY') or os.environ.get('REPO') or 'otooled702/combat-wombat-beta'

consts = open(os.path.join(ROOT, 'src', 'js', '01-constants-and-static-data.js'), encoding='utf-8').read()
version = re.search(r"var APP_VERSION='([^']+)'", consts).group(1)
paths = re.search(r"var LOGO_PATHS='(.*?)';", open(os.path.join(ROOT, 'src', 'js', '12-dm-screen.js'), encoding='utf-8').read(), re.S).group(1)
paths = (paths.replace('class="lg-k"', 'fill="#2A2012"').replace('class="lg-w"', 'fill="#FBF4DF"')
         .replace('class="lg-g1"', 'fill="#7F7766"').replace('class="lg-g3"', 'fill="#938A76"'))
logo = '<svg viewBox="0 0 136.33 142.6" role="img" aria-label="Combat Wombat">%s</svg>' % paths

for f in ('beta.html', 'demo.html'):
    if not os.path.exists(os.path.join(ROOT, 'dist', f)):
        raise SystemExit('dist/%s is missing: run python3 build.py first' % f)

if os.path.isdir(out): shutil.rmtree(out)
os.makedirs(out)
page = open(os.path.join(ROOT, 'src', 'site', 'index.html'), encoding='utf-8').read()
page = page.replace('{{LOGO}}', logo).replace('{{VERSION}}', version).replace('{{REPO}}', repo)
assert '{{' not in page, 'unfilled placeholder in the landing page'
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
shutil.copy(os.path.join(ROOT, 'dist', 'beta.html'), os.path.join(out, 'app.html'))
shutil.copy(os.path.join(ROOT, 'dist', 'demo.html'), os.path.join(out, 'demo.html'))
open(os.path.join(out, '.nojekyll'), 'w').close()
print('site in %s: index.html, app.html, demo.html (version %s, repo %s)' % (os.path.relpath(out, ROOT), version, repo))
