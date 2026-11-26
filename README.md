# Combat Wombat

> **Public beta.** Try it at the live preview: https://otooled702.github.io/combat-wombat-beta/
> (test accounts, no passwords). Report bugs with the issue forms. Releases: see the Releases page.

A D&D 5e combat tracker in a single HTML file: a DM screen, a Combat Monitor for the TV, and a phone view for players.
Initiative, turns, conditions, death saves, groups, a Target window (damage, attacks, saves, spells, conditions, healing),
a library of 331 SRD creatures and 339 SRD spells, a character builder, 12 skins.

Creature and spell data come from the System Reference Document 5.2, © Wizards of the Coast LLC, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Keep the credits in the app.

## How the repository works

The app that gets published is **one file**: `dist/initiative-tracker.html`. You don't edit that file.
You edit the pieces in `src/`, and `build.py` joins them back into the one file.

```
src/index.template.html   the page shell
src/css/                  styles, in order (01-, 02-, ...)
src/js/                   the code, in order: one file per section (state, turn engine, DM screen, Target, ...)
src/data/                 monsters.json and spells.json (generated data, don't hand-edit)
src/vendor/               qrcode-generator 1.4.4 (MIT), built into the page so QR codes work offline
build.py                  src/  ->  dist/initiative-tracker.html (the app), dist/demo.html (the demo), dist/beta.html (test accounts)
src/site/                 the beta's landing page; tools/site/make_site.py assembles the GitHub Pages site
.github/                  Pages deploy, tests, pre-releases on a v* tag, issue forms
tests/                    the browser tests and the runner
tools/                    helpers: code map, safe test editing, spell data builder, self-test
docs/CODEMAP.md           where every function lives (regenerate with tools/codemap.py)
CLAUDE.md                 the guide Claude reads first: conventions, gotchas, how to publish
```

## One-time setup (Mac)

You need Python 3, Node, and Playwright for the tests (not needed just to edit and build).
Homebrew's Python refuses global `pip install`, so the test tools go in a virtual environment in `.venv/`
(it is in `.gitignore`):

```
brew install python node
python3 -m venv .venv
.venv/bin/pip install playwright pillow
.venv/bin/python -m playwright install chromium
```

Then either start each session with `source .venv/bin/activate` (so `python3` below means the venv's Python),
or run the commands below with `.venv/bin/python` in place of `python3`.

## Everyday use

```
python3 build.py --check                 build, and check the JavaScript for syntax errors
python3 tests/run_tests.py --list        see the test areas
python3 tests/run_tests.py --area target --quick     test one area, fast (3 skins)
python3 tests/run_tests.py --jobs 6      the whole suite, six browsers at once
python3 tools/selftest.py                the in-page self-test
python3 tools/codemap.py                 refresh docs/CODEMAP.md after moving code
```

The full suite is ~1,500 checks. It takes about 14 minutes on one core and a few minutes with `--jobs 6` on a laptop.
Use `--area` and `--quick` while you work, and the full run once before you publish.

## Making a change (with GitHub Desktop)

1. In GitHub Desktop, make a branch: *Branch > New Branch*, e.g. `spells-custom-form`.
2. Change files in `src/` (or ask Claude to).
3. `python3 build.py --check`, then the tests for the area you touched.
4. Commit: type a short sentence in the *Summary* box (what changed and why), press *Commit*.
5. When it passes the full suite and is published, *Branch > Merge into current branch* (into `main`), push, and tag it:
   *Repository > Open in Terminal*, then `git tag published-YYYY-MM-DD && git push --tags`.

To undo a bad change before you commit: right-click the file in GitHub Desktop and choose *Discard Changes*.
After committing: *History* tab, right-click the commit, *Revert Changes in Commit*.

## Working with Claude

- **Claude Code** (recommended): open this folder and it reads `CLAUDE.md` itself. It can run the build and tests in the background and commit as it goes.
- **Claude in a chat**: upload `CLAUDE.md`, `docs/CODEMAP.md` and the `src/` files for the area you want changed (not all of them). Ask for one feature at a time, and answer the open questions before it starts building.
