# Combat Wombat: working notes for Claude

(Formerly Battlemaster. The storage key `initiative-tracker-v1`, the file `dist/initiative-tracker.html` and
`tests/battlemaster_tests.py` keep their old names so saved tables and tools keep working.)

D&D 5e combat tracker, built as one self-contained HTML file that is published as a claude.ai artifact.
Read this first. `docs/CODEMAP.md` lists every file and function. Search before you read: the source is ~900 KB.

## Layout and build
- Edit `src/`, never `dist/`. `python3 build.py --check` joins `src/css/*.css` and `src/js/*.js` (file-name order) into
  `dist/initiative-tracker.html`, and checks the JavaScript with node.
- All JS is one scope (one IIFE across the files), so any function can call any other. Sections are numbered in file names.
  To add a section, pick a number so the order is right; cross-file `var`s are declared before use because of file order.
- `src/data/monsters.json` (331 SRD 5.2 creatures) and `src/data/spells.json` are generated. Spells: `tools/spells/make_spells.py`.
- The page must stay self-contained: no `window.storage`, no Claude API. Only the db/room/user capabilities.
  The QR library is bundled from `src/vendor/` (it used to come from cdnjs). Still external: Google Fonts (falls back to system fonts).
- `build.py` also writes `dist/demo.html`: the same code with `DEMO` on (the `var DEMO=false/*@demo*/;` line in `01-`).
  The demo opens on the sample table in `src/data/demo.json` (regenerate with `tools/demo/make_demo.py` after a build), keeps its own
  storage keys, never saves, shows a banner and a tour, and sends saving actions to the Subscribe window ($5.99/mo, $50/yr;
  `DEMO_PRICE`, `DEMO_CHECKOUT` and `DEMO_GATES` in `27b-demo-and-tour.js`). Checkout is not connected yet. Test: `t_demo`.
- `build.py` also writes `dist/beta.html` (`BETA` on): a sign-in screen with three test accounts (`betaAccounts()` in `27c-beta-accounts.js`),
  each with its own storage key; the free one turns on `DEMO`. `APP_VERSION` in `01-` must match the release tag (v + version).
  Public beta repo: GitHub Pages via `.github/workflows/pages.yml` (site from `tools/site/make_site.py`), pre-releases on `v*` tags. Test: `t_beta_accounts`.
- `build.py` wraps every `:hover` rule in `@media (hover:hover)` (`hover_guard`), so taps on touch screens don't leave buttons highlighted.
  Write hover styles normally. Phone and short-screen layout lives in `src/css/16-mobile.css` (loads last).
- Frost's ice texture is generated: edit and run `tools/frost_ice.py`, which writes `src/css/13-skin-frost-ice.css`.

## Tests
- `python3 tests/run_tests.py --area <name> [--quick]`, `--jobs N` for parallel, `--list` for names. One test: `python3 tests/run_one.py t_name`.
- Workflow: build, run the tests for what you touched, then the FULL suite once, then `python3 tools/selftest.py` (64 checks). Do not publish on a failure.
- Update or add tests for every behaviour change. Change an old test only when its expectation is genuinely outdated, and say so.
- Find the real cause before adjusting a test. Measure layout instead of guessing.
- Edit tests with `tools/fnedit.py` (function-scoped, unique match, refuses to shrink the suite). Never find-and-replace across the file:
  a phrase that appears in two tests once deleted a stretch of the file.
- Helpers in `tests/battlemaster_tests.py`: `basic_table` (Rowan 15 PC, Ogre 12 NPC, Alric 9 PC), `add_npc`, `nxt`, `nav`, `row`, `hp`,
  `tgt`/`mclick`/`mfill`/`mpick` (Target window), `lib_open`/`lib_close`, `set_skin`, `check(label, ok, detail)`. New tests go in SUITE.
- Computed colours can be `color(srgb r g b)` with 0-1 values (from `color-mix`), not `rgb()`: convert before comparing.
- The runners serve `dist/` over http (`tests/serve.py`): as a file:// page with the claude.ai stand-in, Chromium can drop the
  saved table on a quick reload. The app opens in Focus; `page()` starts tests in Full unless `density=None`.
  `nxt()` clicks the dock's button: the top bar has its own Start combat button before combat.

## State and rendering
- State lives in localStorage key `initiative-tracker-v1`. EVERY change goes through `mutate(fn)` (undo, sorting, saving, render).
  Transient UI state is `ui` (not saved). New saved fields need a default in `normalise()` in `04-state-and-persistence.js` (local saves and the account copy both use it).
- `render()` redraws by area (`renderTop`, `renderMonMini`, `renderParty`, `renderLibrary`, ...). The left nav is built once, so
  anything stateful in it (switches) must be synced by hand.
- Clicks use `data-act="name"` (DM) and `data-aoe="name"` (Target window); handlers are big `switch`es in `20-events.js` and `26-target.js`.
- Modals share one pattern: container div (`#libwrap`, `#addwrap`, `#pedwrap`, `#buildwrap`, `#aoepanel`), a `.scrim`, a `.qrmodal` panel.
- Do not rebuild a list on a `change`/blur event while the user is clicking in it: the click lands on a destroyed element.
  The Target window skips redraws while a text box has focus (`renderAoe(soft)`).

## Target window (`26-target.js`)
- Tabs: Damage, Spells, Condition, Heal. Engine state is `ui.aoe` with `kind` = `dmg` | `cond` | `heal` | `temp`.
  The Spells tab is a picker on top of the same engine: `A.spellTab` is only a view flag; picking a spell configures `dmg` or `cond`.
- Damage: typed lines (`att.lines`, default type "untyped" shown as "Unspecified"), optional attack roll (`att.use`, d20 + modifier),
  optional saving throw (`A.sv`: DC, ability, success half/none). A save halves/cancels lines marked `sv`, and always cancels a condition.
- Apply is one undo step. Legendary Resistance on a failed save is spent when applying (damage and condition paths).
- Spells: `SPELLS` from `spells.json` plus your own in `state.customSpells` (`spellsAll()`, look up by name with `spellGet(n)`, never `SPELL_BY`).
  Tags are derived, not stored (`spTags`: damage, heal, condition, else utility). Library > Spells (`26b-spell-library.js`) filters by tag,
  makes new spells and edits copies (`custom:true`, `base` = original name; SRD spells are never changed). The Target window's tag chips
  (`A.sptag`) filter the picker; All hides utility spells. Test: `t_custom_spells`.
  Healing spells (`hl` dice or number, `hm` add modifier, `hu` upcast, `hf` full, `hx` divided) configure the Heal engine.
  Caster DC: stat-block text first ("spell save DC N, +N to hit"), else 8 + proficiency (from CR, +2 if unknown) + casting ability mod.
  Concentration is optional and adds a Concentrating condition with `note` = spell name.
- Group conditions: a condition on a group can list members in `cd.mem` (ids); none means the whole group. `condTidy(c)` cleans up after
  members leave. Durations tick on the group's turn. The Target window still applies conditions to the whole group.
- Timer: `state.timer.scope` is `turn` (resets each turn) or `combat` (from Start combat); a combat countdown uses `cmins`.

## Design conventions
- Controls need roles, labels and keyboard support. Colour is never the only cue. Fields keep a visible label (no placeholder-only labels);
  placeholders that look like real values must say "Example:" or be paler italic.
- Spark skins centre League Spartan text with a `--nudge` padding trick: do not zero vertical button padding (a test checks pixel centring).
  Keep line heights on whole pixels in Spark.
- DM screen is dense and fast: fewer clicks, rare actions in the ⋯ menu. Monitor cards that are not up are one size; the Now card is 1.2x.
- Popovers open without moving the scroll position. Turn shading is a soft background wash so buttons stay readable.
- Keyboard: Right arrow next turn, Left arrow previous turn, Ctrl/Cmd+Z undo (ignored while typing or when a window is open).

## Publishing (claude.ai artifact)
- Publish `dist/initiative-tracker.html` to the EXISTING artifact URL (https://claude.ai/artifact/UsKqBKxAzzh9WAy7t4rdXy). Never create a second artifact.
- Always pass capabilities `{"db":{"rules":[{"path":"dm","read":"admin","write":"admin"}]},"room":{},"user":{}}` (admin, so an Editor gets the full app).
- Favicon ⚔️, title "⚔️ Combat Wombat". For small changes after a publish use the Artifact tool's `edit` action.
- After publishing, hand over the updated `tests/battlemaster_tests.py`.

## Be honest in reports
- Say what was and was not verified. Not tested so far: Safari/iOS (incl. sound), real phones, Collapsed cards and the AC/Save/Regroup popovers on a phone.
- If you run out of room before publishing, say so and list what is left. Never imply something is live when it is not.

## Known limits and ideas
- Library is SRD only (the full Monster Manual and Player's Handbook are copyrighted). Builder: simplified standard array, no point buy/subclasses.
- Spells not done: several damage types or conditions in your own spells (the form takes one of each), Constitution-save prompt when a concentrating caster is hurt, spells with several different effects do not scale
  with slot level, Magic Missile-style spells apply the full dart count to each selected target.
- Images are base64 in localStorage (large uploads can hit the quota).
- Environment gotchas (chat sandbox): one CPU core, background jobs die between turns, no version history. Use git and Claude Code where possible.
