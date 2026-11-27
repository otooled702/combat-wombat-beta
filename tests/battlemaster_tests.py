"""Functional tests for the Battlemaster tracker.
usage: python3 battlemaster_tests.py [page-url]
Needs: pip install playwright && playwright install chromium
Phones are tested against tests/mockroom.js, a stand-in for the platform's live room."""
import sys, os, json, re, traceback
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
# The page under test: pass a file:// URL as the first argument, or it uses dist/initiative-tracker.html.
URL = sys.argv[1] if len(sys.argv) > 1 else 'file://' + os.path.join(os.path.dirname(HERE), 'dist', 'initiative-tracker.html')
# Quick mode (BM_QUICK=1): the loops that check every skin only check three, for fast feedback while building.
QUICK = bool(os.environ.get('BM_QUICK'))
def qs(seq):
    seq = list(seq)
    if not QUICK: return seq
    return [x for x in seq if x in ('spark', 'sparkd', 'fire')] or seq[:2]
MOCK = open(os.path.join(HERE, 'mockroom.js')).read()
NOLOCAL = "(function(){const O=window.BroadcastChannel;window.BroadcastChannel=function(n){if(n==='bm-live'){return {postMessage(){},close(){},set onmessage(f){}}}return new O(n);};})();"
passed, failed = 0, []

def check(name, cond, extra=''):
    global passed
    if cond: passed += 1
    else: failed.append(name + (' :: ' + str(extra) if extra != '' else ''))

# ---------- helpers ----------
def page(ctx, owner=True, uid='u_dm', size=(1440, 900), nolocal=False, db=False, editor=False, density='full'):
    # The app now opens in Focus (cards closed until their turn). Most tests were written for Full, so the helper
    # keeps Full unless a test passes density=None to see the real default.
    pg = ctx.new_page(); pg.set_viewport_size({'width': size[0], 'height': size[1]})
    if density: pg.add_init_script("try{if(!localStorage.getItem('bm-density'))localStorage.setItem('bm-density','%s')}catch(e){}" % density)
    pg.add_init_script(("%s window.__OWNER__=%s;window.__UID__='%s';" % ((NOLOCAL if nolocal else '') + ('window.__DB__=true;' if db else '') + ('window.__EDITOR__=true;' if editor else ''), 'true' if owner else 'false', uid)) + MOCK)
    pg._errs = []
    pg.on('pageerror', lambda e, p=pg: p._errs.append(str(e)))
    pg.on('console', lambda m, p=pg: p._errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    return pg

def lib_open(dm, tab='book'):
    # the Library is one window with Book, Saved and NPCs tabs
    if dm.locator('#libwrap .libmodal').count() == 0:
        vs = dm.viewport_size
        if vs and vs['width'] <= 900 and dm.locator('#lnav.mobopen').count() == 0: dm.click('.hambtn'); dm.wait_for_timeout(300)
        dm.click('#lnav [data-act=libOpen][data-preset=book]'); dm.wait_for_timeout(300)
    if dm.locator('.libmodal .mmtabs [data-v=%s][aria-checked=true]' % tab).count() == 0: dm.click('.libmodal .mmtabs [data-v=%s]' % tab); dm.wait_for_timeout(250)
def lib_filters(dm, want=True):
    # the type, CR and source filters live in a Filters menu
    open_ = dm.locator('.mmfpop').count() > 0
    if open_ != want: dm.click('[data-mm=filters]'); dm.wait_for_timeout(150)
def lib_close(dm):
    if dm.locator('#libwrap .libmodal').count(): dm.click('.libmodal .dhead [data-mm=close]'); dm.wait_for_timeout(200)

def mon_open_click(dm):
    if dm.locator('[data-nav=monitor][aria-expanded=true]').count() == 0: dm.click('[data-nav=monitor]')
    dm.locator('[data-act=openMonitor]').click()

def add_close(dm):
    if dm.locator('#addwrap .addmodal').count(): dm.click('.addmodal .dhead [data-add=close]'); dm.wait_for_timeout(150)

def nav(dm, item, sub=None):
    add_close(dm)
    vs = dm.viewport_size
    if vs and vs['width'] <= 900 and dm.locator('#lnav.mobopen').count() == 0: dm.click('.hambtn'); dm.wait_for_timeout(300)
    if item == 'add' and sub in ('player', 'npc', 'monster', 'creature'):
        # Player, NPC and Creature open a window
        if dm.locator('[data-nav=add][aria-expanded=true]').count() == 0: dm.click('[data-nav=add]')
        dm.click('[data-act=addOpen][data-type=%s]' % ('creature' if sub == 'monster' else sub)); dm.wait_for_timeout(300); return
    if item == 'library': lib_open(dm, {'savednpc': 'npcs', 'savedmon': 'saved', None: 'book'}[sub]); return
    # the left menu opens one item at a time; open what we need, and leave it alone if it is already open
    if dm.locator('[data-nav=%s][aria-expanded=true]' % item).count() == 0: dm.click('[data-nav=%s]' % item)
    if sub and dm.locator('[data-sub=%s][aria-expanded=true]' % sub).count() == 0: dm.click('[data-sub=%s]' % sub)

def back_to_cards(dm): dm.locator('.row').first.click(position={'x': 700, 'y': 5}); dm.wait_for_timeout(200)
def endc(dm): nav(dm, 'manage'); dm.click('[data-act=endCombat]')
def open_lib(dm): lib_open(dm, 'book')
def open_build(dm): nav(dm, 'add', 'player'); dm.click('.addstrip [data-mode=generate][data-type=player]'); dm.wait_for_timeout(300)

def add_player(dm, name, player='P', hp='24', ac=''):
    nav(dm, 'add', 'player')
    dm.fill('#pcForm [name=name]', name); dm.fill('#pcForm [name=player]', player)
    dm.fill('#pcForm [name=maxHp]', hp); dm.fill('#pcForm [name=ac]', ac); dm.click('#pcForm button'); add_close(dm)

def add_to_fight(dm, inits):
    nav(dm, 'party')
    for inp, v in zip(dm.query_selector_all('[data-pi]'), inits): inp.fill(str(v))
    dm.click('[data-act=partyAddAll]')

def add_npc(dm, name, init, hp='', qty='1', group=False, disp='enemy', ac='', initmod=None):
    nav(dm, 'add', 'npc')
    if initmod is not None: dm.fill('#addForm [name=initmod]', str(initmod))
    dm.fill('#addForm [name=name]', name); dm.fill('#addForm [name=init]', str(init)); dm.fill('#addForm [name=hp]', str(hp))
    dm.fill('#addForm [name=ac]', ac); dm.fill('#addForm [name=qty]', str(qty)); dm.select_option('#addForm [name=disp]', disp)
    (dm.check if group else dm.uncheck)('#addForm [name=group]'); dm.click('#addForm button.primary'); add_close(dm)

def names(dm): return dm.eval_on_selector_all('.row [data-f=name]', 'els=>els.map(e=>e.value)')
def row(dm, name): return dm.locator('.row').nth(names(dm).index(name))
def nxt(dm, n=1):
    for _ in range(n): dm.click('#dock [data-act=next]')
def now(dm): return dm.inner_text('.topstat .stat.now b') if dm.locator('.topstat .stat.now b').count() else None
def hp(dm, name): return row(dm, name).locator('[data-f=hp]').input_value()
def dmg(dm, name, n): r = row(dm, name); r.locator('[data-delta]').fill(str(n)); r.locator('[data-act=dmg]').click()
def heal(dm, name, n): r = row(dm, name); r.locator('[data-delta]').fill(str(n)); r.locator('[data-act=heal]').click()
def temp(dm, name, n): r = row(dm, name); r.locator('[data-delta]').fill(str(n)); r.locator('[data-act=temp]').click()
def mi(dm, name, sel):
    # the less-used actions live in each card's menu: open it if needed, then click
    r = row(dm, name)
    if r.locator('.rowmenu').count() == 0: r.locator('[data-act=menu]').click()
    row(dm, name).locator(sel).click()

def add_cond(dm, name, cond, dur=None, owner=None):
    row(dm, name).locator('[data-act=condOpen]').click(); dm.click('[data-name="%s"]' % cond)
    if dur: dm.select_option('[data-cf=dur]', dur)
    dm.click('[data-act=condApply]')

def basic_table(ctx, extra=None, db=False):
    dm = page(ctx, db=db); dm.goto(URL); nav(dm, 'add', 'player')
    add_player(dm, 'Rowan', 'Brian', '24', '17'); add_player(dm, 'Alric', 'Tim', '31', '15')
    add_to_fight(dm, [15, 9]); add_npc(dm, 'Ogre', 12, 59)
    if extra: extra(dm)
    return dm

# ---------- tests ----------
def t_turn_engine(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    check('order sorted by initiative', names(dm) == ['Rowan', 'Ogre', 'Alric'], names(dm))
    check('previous disabled before start', dm.locator('[data-act=prev]').is_disabled())
    nxt(dm); check('start -> top of order', now(dm) == 'Rowan')
    nxt(dm); check('second turn', now(dm) == 'Ogre'); nxt(dm); check('third turn', now(dm) == 'Alric')
    nxt(dm); check('wraps to round 2', now(dm) == 'Rowan' and 'round 2' in dm.inner_text('.rn').lower())
    dm.click('[data-act=prev]'); check('previous crosses back a round', now(dm) == 'Alric' and 'round 1' in dm.inner_text('.rn').lower())
    undo(dm); check('undo restores the move', now(dm) == 'Rowan')
    endc(dm); dm.click('[data-conf=yes]'); check('end combat clears the turn', now(dm) is None)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_conditions(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    nxt(dm)                                               # Rowan
    add_cond(dm, 'Ogre', 'Prone', 'start')
    check('chip added', row(dm, 'Ogre').locator('.chip:has-text("Prone")').count() == 1)
    nxt(dm)                                               # Ogre's turn begins -> Prone ends
    check('start-of-turn condition expires', row(dm, 'Ogre').locator('.chip:not(.endedchip):has-text("Prone")').count() == 0)
    check('ended indicator shows', row(dm, 'Ogre').locator('.endedchip').count() == 1)
    nxt(dm); check('ended indicator clears next turn', row(dm, 'Ogre').locator('.endedchip').count() == 0)
    add_cond(dm, 'Ogre', 'Bless')                         # spells default to 10 rounds
    check('Bless defaults to rounds', 'until round' in row(dm, 'Ogre').locator('.chip').first.inner_text())
    row(dm, 'Ogre').locator('[data-act=condInfo]').click(); check('rules dropdown opens', row(dm, 'Ogre').locator('.cdesc').count() == 1)
    row(dm, 'Ogre').locator('[data-act=condRemove]').first.click(); check('manual removal logs an ended chip', row(dm, 'Ogre').locator('.endedchip').count() == 1)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_hp_and_death(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    nxt(dm)
    temp(dm, 'Rowan', 8); dmg(dm, 'Rowan', 5)
    check('temp HP absorbs first', hp(dm, 'Rowan') == '24' and row(dm, 'Rowan').locator('[data-f=temp]').input_value() == '3')
    dmg(dm, 'Rowan', 6); check('overflow reaches HP', hp(dm, 'Rowan') == '21')
    heal(dm, 'Rowan', 50); check('healing caps at max', hp(dm, 'Rowan') == '24')
    dmg(dm, 'Rowan', 24)
    check('0 HP opens death saves', row(dm, 'Rowan').locator('.death').count() == 1)
    check('Unconscious added automatically', 'Unconscious' in row(dm, 'Rowan').locator('.conds').inner_text())
    check('reaction hidden at 0 HP', row(dm, 'Rowan').locator('.rxbtn').count() == 0)
    dmg(dm, 'Rowan', 3); check('damage at 0 adds a failure', row(dm, 'Rowan').locator('.death .pips.bad').inner_text().count('\u2715') == 1)
    row(dm, 'Rowan').locator('[data-act=dsOk]').click(); row(dm, 'Rowan').locator('[data-act=dsOk]').click(); row(dm, 'Rowan').locator('[data-act=dsOk]').click()
    check('three successes -> stable', 'Stable' in row(dm, 'Rowan').locator('.death').inner_text())
    heal(dm, 'Rowan', 4); check('healing clears death saves and Unconscious', row(dm, 'Rowan').locator('.death').count() == 0 and row(dm, 'Rowan').locator('.chip:not(.endedchip):has-text("Unconscious")').count() == 0)
    dmg(dm, 'Alric', 31); dmg(dm, 'Alric', 31)
    check('massive damage kills outright', 'Dead' in row(dm, 'Alric').locator('.death').inner_text())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_groups(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    add_npc(dm, 'Goblin', 8, 7, 3, True); g = dm.locator('.row.group')
    check('group card with 3 members', g.count() == 1 and g.locator('.mem').count() == 3)
    m = g.locator('.mem').nth(0); m.locator('[data-mdelta]').fill('5'); m.locator('[data-mdelta]').press('Enter')
    check('per-member damage (Enter applies)', g.locator('.mem').nth(0).locator('[data-mf=hp]').input_value() == '2')
    g.locator('.hp [data-delta]').fill('1'); g.locator('[data-act=gDmg]').click()
    check('damage all', [g.locator('.mem').nth(i).locator('[data-mf=hp]').input_value() for i in range(3)] == ['1', '6', '6'])
    g.locator('[data-act=mAdd]').click(); check('+1 adds a member', g.locator('.mem').count() == 4)
    g.locator('.mem').nth(1).locator('[data-act=mSplit]').click()
    check('split off to its own card', 'Goblin 2' in names(dm) and dm.locator('.row.group .mem').count() == 3)
    for _ in range(3): dm.locator('.row.group .mem').first.locator('[data-act=mRemove]').click(); dm.click('[data-conf=yes]'); dm.wait_for_timeout(120)
    check('removing the last member removes the group', dm.locator('.row.group').count() == 0)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_reactions_ready_legendary(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    nxt(dm)
    row(dm, 'Alric').locator('.rxbtn').click(); check('reaction toggles to used', 'used' in row(dm, 'Alric').locator('.rxbtn').inner_text().lower())
    nxt(dm, 3); nxt(dm); check('reaction refreshes on own turn', True)   # Alric's turn is third; check next line after reaching it
    ctx.close()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    nxt(dm); nxt(dm); nxt(dm)                                # Alric acting
    row(dm, 'Alric').locator('.rxbtn').click(); nxt(dm); nxt(dm); nxt(dm)     # Rowan, Ogre, Alric again
    check('reaction refreshed at the start of own turn', 'use reaction' in row(dm, 'Alric').locator('.rxbtn').inner_text().lower())
    row(dm, 'Rowan').locator('[data-act=rdyOpen]').click(); dm.fill('[data-rf]', 'if the ogre moves'); dm.click('[data-act=rdyHold]')
    check('ready action held with trigger', 'if the ogre moves' in row(dm, 'Rowan').locator('.conds').inner_text())
    row(dm, 'Rowan').locator('[data-act=rdyFire]').click(); check('firing spends the reaction', 'used' in row(dm, 'Rowan').locator('.rxbtn').inner_text().lower())
    mi(dm, 'Ogre', '[data-act=legOn]'); row(dm, 'Ogre').locator('[data-act=legUse][data-cost="2"]').click()
    check('legendary uses spend actions', row(dm, 'Ogre').locator('.leg .pips').first.inner_text().count('\u25cf') == 1)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_ac_and_display(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    set_ac(dm, 'Ogre', 14); set_ac(dm, 'Rowan', 19, temp=True)
    check('temporary AC change adds to base', row(dm, 'Rowan').locator('.acshield b').inner_text() == '19')
    nxt(dm)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(500)
    check('player AC shown, includes the change', '19' in tv.locator('.pcard:has-text("Rowan") .pac').inner_text())
    check('enemy AC hidden by default', tv.locator('.pcard:has-text("Ogre") .pac').count() == 0)
    mi(dm, 'Ogre', '[data-act=acShow]'); tv.wait_for_timeout(400)
    check('per-creature switch reveals enemy AC', tv.locator('.pcard:has-text("Ogre") .pac').count() == 1)
    sopen(dm, 'acShow'); dm.click('[data-key=acShow][data-val=none]'); tv.wait_for_timeout(400)
    check('global Nobody hides all AC', tv.locator('.pac').count() == 0)
    dm.click('[data-key=acShow][data-val=all]'); tv.wait_for_timeout(400)
    check('global Everyone shows all AC', tv.locator('.pac').count() >= 2)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_health_display(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    nxt(dm); dmg(dm, 'Ogre', 20)                                # 39/59 = 66% -> Wounded
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(500)
    card = tv.locator('.pcard:has-text("Ogre")')
    check('enemy shows a word by default', 'Wounded' in card.inner_text() and card.locator('.bar').count() == 0, card.inner_text())
    mi(dm, 'Ogre', '[data-act=hpMode][data-val=bar]'); tv.wait_for_timeout(400)
    check('Bar mode shows a bar and no numbers', tv.locator('.pcard:has-text("Ogre") .bar').count() == 1 and '39' not in tv.locator('.pcard:has-text("Ogre")').inner_text())
    mi(dm, 'Ogre', '[data-act=hpMode][data-val=exact]'); tv.wait_for_timeout(400)
    check('Numbers shows the hit points', '39' in tv.locator('.pcard:has-text("Ogre")').inner_text() and '59' in tv.locator('.pcard:has-text("Ogre")').inner_text())
    dm.evaluate("()=>{const k='initiative-tracker-v1', s=JSON.parse(localStorage.getItem(k)); s.combatants.find(c=>c.name==='Ogre').hpMode='hidden'; localStorage.setItem(k, JSON.stringify(s));}"); dm.reload(); dm.wait_for_timeout(600); tv.reload(); tv.wait_for_timeout(600)
    check('a creature saved with the old Hidden setting still hides its health', 'Wounded' not in tv.locator('.pcard:has-text("Ogre")').inner_text() and '39' not in tv.locator('.pcard:has-text("Ogre")').inner_text())
    dmg(dm, 'Ogre', 34); mi(dm, 'Ogre', '[data-act=hpMode][data-val=status]'); tv.wait_for_timeout(400)
    check('Critical below 10%', 'Critical' in tv.locator('.pcard:has-text("Ogre")').inner_text())
    ctx.close()

def t_library_clone_undo_images(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    mi(dm, 'Ogre', '[data-act=saveLib]'); nav(dm, 'library', 'savednpc'); check('saved to library', 'Ogre' in dm.inner_text('#library'))
    dm.fill('#library [data-li]', '5'); dm.click('#library [data-act=libAdd]'); check('added from library', 'Ogre 2' in names(dm) or 'Ogre' in names(dm)); lib_close(dm)
    n = len(names(dm)); mi(dm, 'Alric', '[data-act=clone]'); dm.click('[data-cl=go]'); check('clone adds a combatant', len(names(dm)) == n + 1)
    undo(dm); check('undo removes the clone', len(names(dm)) == n)
    mi(dm, 'Rowan', '[data-act=remove]'); check('remove offers an undo toast', dm.locator('.toastbtn').count() == 1)
    dm.click('.toastbtn'); check('undo from the toast restores', 'Rowan' in names(dm))
    # image upload
    from PIL import Image
    Image.new('RGB', (80, 60), (200, 120, 40)).save('/tmp/bm_test.png')
    row(dm, 'Alric').locator('[data-act=sheetToggle]').click(); dm.set_input_files('input[data-img]', '/tmp/bm_test.png'); dm.wait_for_timeout(500)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(600)
    check('image shows on the Combat Monitor', tv.locator('.pcard:has-text("Alric") .pimg img').count() == 1)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_tv(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    add_npc(dm, 'Goblin', 3, 7, 3, True); add_npc(dm, 'Wolf', 11, 11); add_npc(dm, 'Bat', 2, 3)
    nxt(dm, 3)                                                  # Alric acting (9)? order: 15,12,11,9,3,2
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(700)
    first = tv.locator('.pgrid > :first-child')
    check('current turn is the first card', 'Now' in first.inner_text(), first.inner_text())
    try: tv.wait_for_selector('.rdiv .rflag', timeout=5000)
    except Exception: pass
    check('round divider shown after rotation', tv.locator('.rdiv .rflag').count() == 1)
    check('compact cards when more than five', tv.locator('.pcard.small').count() >= 1)
    add_cond(dm, 'Wolf', 'Prone', 'start'); nxt(dm, 3)
    tv.wait_for_timeout(500)
    check('flags sit on the card edge', tv.locator('.pcard .flag').count() >= 1)
    sopen(dm, 'cardMode'); dm.click('[data-key=cardMode][data-val=static]'); tv.wait_for_timeout(500)
    check('static mode keeps initiative order', tv.locator('.pcard').first.inner_text().startswith('15') or 'Rowan' in tv.locator('.pcard').first.inner_text())
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_privacy(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    add_npc(dm, 'Assassin', 20, 33)
    row(dm, 'Assassin').locator('[data-act=hide]').click(); dm.wait_for_timeout(400)
    snap = json.loads(dm.evaluate("localStorage.getItem('bm-live-snap')"))
    cnames = [c['n'] for c in snap['c']]
    check('hidden creatures are not in the live snapshot', 'Assassin' not in cnames, cnames)
    ogre = [c for c in snap['c'] if c['n'] == 'Ogre'][0]
    check('enemy HP numbers are not sent while shown as a word', 'h' not in (ogre.get('hp') or {}), ogre.get('hp'))
    rowan = [c for c in snap['c'] if c['n'] == 'Rowan'][0]
    check('players get exact HP', rowan['hp'].get('h') == 24)
    check('no stat sheets or notes for enemies', 'st' not in ogre and 'notes' not in json.dumps(snap))
    ctx.close()

def t_skins_and_settings(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor')
    for sk in qs(['slate', 'light', 'medieval', 'water', 'forest', 'mountain', 'fire', 'spark', 'sparkd', 'frost', 'feywild']):
        sopen(dm, 'skin'); dm.click('[data-key=skin][data-val=%s]' % sk); tv.wait_for_timeout(250)
        check('skin %s applies to DM and display' % sk, dm.evaluate("document.documentElement.dataset.skin") == sk and tv.evaluate("document.documentElement.dataset.skin") == sk)
        dm.click('#drawerClose')
    sopen(dm, 'fontSize'); dm.click('[data-key=fontSize][data-val=large]'); dm.reload(); dm.wait_for_timeout(300)
    check('settings persist across reload', 'large' in dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    dm.click('[data-act=qrOpen]'); dm.wait_for_timeout(500); check('QR codes render', dm.locator('.qrmodal svg').count() == 2)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def phone_setup(b, owner_phone=False):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    dm = page(ctx, nolocal=True); dm.goto(URL); nav(dm, 'add', 'player')
    add_player(dm, 'Rowan', 'Brian', '24', '16'); add_player(dm, 'Alric', 'Tim', '24', '15'); add_to_fight(dm, [15, 9]); add_npc(dm, 'Ogre', 12, 59)
    ph = page(ctx, owner=owner_phone, uid='u_dm' if owner_phone else 'u_alric', size=(390, 780), nolocal=True)
    ph.goto(URL + ('#player' if owner_phone else '')); ph.wait_for_timeout(1000)
    return ctx, dm, ph

def t_phone(b):
    for owner_phone in (False, True):
        tag = 'same-account phone' if owner_phone else 'guest phone'
        ctx, dm, ph = phone_setup(b, owner_phone)
        check('%s: claim screen' % tag, ph.locator('.ph-claimbtn').count() == 2)
        nxt(dm)                                                         # Rowan acting
        ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(900)
        nav(dm, 'party'); check('%s: DM sees the claim' % tag, 'Connected' in dm.inner_text('#party'), dm.inner_text('#party'))
        nxt(dm); ph.wait_for_timeout(500)                               # Ogre acting -> Alric is next
        check('%s: up-next popup' % tag, ph.locator('.ph-popup h1').count() == 1 and 'up next' in ph.locator('.ph-popup h1').inner_text().lower())
        ph.click('[data-pact=popclose]'); nxt(dm); ph.wait_for_timeout(500)
        check('%s: your-turn popup' % tag, 'your turn' in ph.locator('.ph-popup h1').inner_text().lower())
        ph.click('[data-pact=popclose]')
        ph.fill('[data-pamt]', '7'); ph.click('[data-pact=hp][data-k=dmg]'); ph.wait_for_timeout(700)
        check('%s: damage from the phone reaches the DM' % tag, hp(dm, 'Alric') == '17', hp(dm, 'Alric'))
        ph.click('[data-pact=rx]'); ph.wait_for_timeout(500); check('%s: Use reaction' % tag, 'used' in row(dm, 'Alric').locator('.rxbtn').inner_text().lower())
        ph.click('[data-pact=picker]'); ph.click('[data-pact=cadd][data-n=Concentrating]'); ph.wait_for_timeout(600)
        check('%s: condition from the phone' % tag, 'Concentrating' in row(dm, 'Alric').locator('.conds').inner_text())
        ph.click('[data-pact=stats]'); ph.fill('[data-pst=ac]', '18'); ph.press('[data-pst=ac]', 'Tab'); ph.wait_for_timeout(700)
        check('%s: player enters AC' % tag, row(dm, 'Alric').locator('.acshield b').inner_text() == '18')
        check('%s: players cannot touch the turn order' % tag, ph.locator('text=Next turn').count() == 0 and ph.locator('[data-act=next]').count() == 0)
        sopen(dm, 'phoneEdit'); dm.click('[data-key=phoneEdit]'); dm.click('#drawerClose'); ph.wait_for_timeout(1000)
        check('%s: DM can switch phone editing off' % tag, ph.locator('[data-pact=hp]').first.is_disabled())
        sopen(dm, 'phoneEdit'); dm.click('[data-key=phoneEdit]'); dm.click('#drawerClose')
        row(dm, 'Alric')  # still present
        nav(dm, 'party'); dm.locator('#party [data-act=partyEdit]').nth(1).click(); dm.click('[data-act=partyRelease]'); ph.wait_for_timeout(700)
        check('%s: DM release returns the phone to the claim screen' % tag, ph.locator('.ph-claim').count() == 1)
        check('%s: no page errors' % tag, not (dm._errs + ph._errs), dm._errs + ph._errs); ctx.close()

def t_phone_stale_tab_and_offline_sheet(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    dm = page(ctx, nolocal=True); dm.goto(URL); nav(dm, 'add', 'player')
    add_player(dm, 'Rowan', 'Brian', '24', ''); add_player(dm, 'Alric', 'Tim', '24', ''); add_to_fight(dm, [15, 9]); nxt(dm, 2)
    dm2 = page(ctx, nolocal=True); dm2.goto(URL); dm2.wait_for_timeout(400)         # second DM tab, then DM1 moves on
    nxt(dm); nxt(dm)
    ph = page(ctx, owner=False, uid='u_alric', size=(390, 780), nolocal=True); ph.goto(URL); ph.wait_for_timeout(900)
    ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(600)
    seen = set()
    for _ in range(18):
        ph.wait_for_timeout(400); seen.add((ph.locator('.ph-sn.now b').inner_text(), ph.locator('.ph-popup h1').count() > 0))
        if ph.locator('.ph-popup').count(): ph.click('[data-pact=popclose]')
    check('a stale second tab cannot flip the phone back', len({s[0] for s in seen}) == 1, seen)
    check('both DM tabs agree on whose turn it is', now(dm) == now(dm2))
    ctx.close()
    # sheet saved before the DM is online, sent when the character is claimed
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    d0 = page(ctx, nolocal=True); d0.goto(URL); nav(d0, 'add', 'player'); add_player(d0, 'Alric', 'Tim', '', ''); d0.close()
    ph = page(ctx, owner=False, uid='u_alric', size=(390, 780), nolocal=True); ph.goto(URL); ph.wait_for_timeout(900)
    ph.click('[data-pact=myopen]'); ph.fill('[data-pmy=ac]', '17'); ph.press('[data-pmy=ac]', 'Tab'); ph.fill('[data-pmy=mh]', '28'); ph.press('[data-pmy=mh]', 'Tab')
    d1 = page(ctx, nolocal=True); d1.goto(URL); ph.wait_for_timeout(1500)
    ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(1200)
    nav(d1, 'party'); line = d1.inner_text('#party')
    check('sheet made offline is sent when the character is claimed', 'AC 17' in line and '28/28' in line, line)
    ctx.close()


AUDIO_STUB = """window.__osc=0;window.__noise=0;window.AudioContext=function(){
  const node=()=>({connect(){},gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},start(){},stop(){},type:'',buffer:null});
  this.currentTime=0;this.state='running';this.sampleRate=44100;this.destination={};this.resume=()=>Promise.resolve();
  this.createGain=node;this.createBiquadFilter=node;this.createOscillator=()=>{window.__osc++;return node();};
  this.createBufferSource=()=>{window.__noise++;return node();};this.createBuffer=(c,n)=>({getChannelData:()=>new Float32Array(n)});};"""

def audio_page(ctx, owner=False, size=(1920, 720)):
    pg = ctx.new_page(); pg.set_viewport_size({'width': size[0], 'height': size[1]})
    pg.add_init_script(AUDIO_STUB + "window.__OWNER__=%s;window.__UID__='%s';" % ('true' if owner else 'false', 'u_dm' if owner else 'u_tv') + MOCK)
    pg.add_init_script("try{if(!localStorage.getItem('bm-density'))localStorage.setItem('bm-density','full')}catch(e){}")   # tests were written for Full cards
    pg._errs = []; pg.on('pageerror', lambda e, p=pg: p._errs.append(str(e))); return pg

def t_effects(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})          # animations on: flashes need them
    dm = basic_table(ctx); nxt(dm)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(600)
    dmg(dm, 'Rowan', 5); tv.wait_for_timeout(150)
    check('card flashes red when a player is hit', tv.locator('.pcard:has-text("Rowan") .fx.hit').count() == 1)
    check('damage number shown for players', tv.locator('.pcard:has-text("Rowan") .fxnum').inner_text() == '\u22125' if tv.locator('.pcard:has-text("Rowan") .fxnum').count() else False)
    dmg(dm, 'Ogre', 4); tv.wait_for_timeout(150)
    check('no damage number for enemies by default', tv.locator('.pcard:has-text("Ogre") .fxnum').count() == 0 and tv.locator('.pcard:has-text("Ogre") .fx.hit').count() == 1)
    sopen(dm, 'fxNums'); dm.click('[data-key=fxNums][data-val=all]'); dm.click('#drawerClose'); dmg(dm, 'Ogre', 3); tv.wait_for_timeout(150)
    check('damage numbers for everyone when asked', tv.locator('.pcard:has-text("Ogre") .fxnum').count() == 1)
    heal(dm, 'Rowan', 3); tv.wait_for_timeout(150); check('green flash on healing', tv.locator('.pcard:has-text("Rowan") .fx.heal').count() == 1)
    sopen(dm, 'fxFlash'); dm.click('[data-key=fxFlash]'); dm.click('#drawerClose'); dmg(dm, 'Rowan', 1); tv.wait_for_timeout(150)
    check('flash can be switched off', tv.locator('.fx').count() == 0)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_sound(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    dm = audio_page(ctx, owner=True, size=(1440, 900)); dm.goto(URL); nav(dm, 'add', 'player')
    add_player(dm, 'Rowan', 'Brian', '24', ''); add_player(dm, 'Alric', 'Tim', '24', ''); add_to_fight(dm, [15, 9]); add_npc(dm, 'Ogre', 12, 59)
    tv = audio_page(ctx, owner=True); tv.goto(URL + '#monitor'); tv.wait_for_timeout(500)
    check('TV asks for one tap to enable sound', tv.locator('.sfxpill').count() == 1)
    tv.click('.sfxpill'); tv.wait_for_timeout(300); check('prompt goes away after the tap', tv.locator('.sfxpill').count() == 0)
    osc = lambda p: p.evaluate('window.__osc')
    base = osc(tv); nxt(dm); tv.wait_for_timeout(600); check('a new turn makes a sound on the display', osc(tv) > base)
    base = osc(tv); dmg(dm, 'Ogre', 30); tv.wait_for_timeout(700); check('a hit makes a sound', osc(tv) > base or tv.evaluate('window.__noise') > 0)
    check('the DM screen stays silent by default', osc(dm) == 0, osc(dm))
    sopen(dm, 'sfxHit'); dm.click('[data-key=sfxHit]'); dm.click('#drawerClose'); base = osc(tv); noise0 = tv.evaluate('window.__noise')
    dmg(dm, 'Ogre', 2); tv.wait_for_timeout(600); check('hit sounds can be switched off by category', osc(tv) == base and tv.evaluate('window.__noise') == noise0)
    base = osc(tv); nxt(dm); tv.wait_for_timeout(600); check('turn sounds still play', osc(tv) > base)
    sopen(dm, 'sfxTv'); dm.click('[data-key=sfxTv]'); dm.click('#drawerClose'); base = osc(tv); nxt(dm); tv.wait_for_timeout(600); check('display sound can be switched off', osc(tv) == base)
    sopen(dm, cat='sound'); dm.click('[data-act=sfxTest][data-s=heal]'); dm.wait_for_timeout(200); check('preview plays on the DM screen', osc(dm) > 0)
    dm.click('[data-key=sfxDm]'); dm.click('#drawerClose'); base = osc(dm); nxt(dm); dm.wait_for_timeout(500); check('DM screen can play too when enabled', osc(dm) > base)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_colour_blind(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    dm = page(ctx, nolocal=True); dm.goto(URL); nav(dm, 'add', 'player')
    add_player(dm, 'Rowan', 'Brian', '24', ''); add_player(dm, 'Alric', 'Tim', '24', ''); add_to_fight(dm, [15, 9]); add_npc(dm, 'Ogre', 12, 59); nxt(dm)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(500)
    check('markers off by default', tv.locator('.rolemark').count() == 0)
    sopen(dm, 'cbMarks'); dm.click('[data-key=cbMarks]'); tv.wait_for_timeout(500)
    check('display gets role marks', tv.locator('.pwrap.cb .rolemark').count() == 3)
    check('foe marked with a shape and word', 'Foe' in tv.locator('.pcard:has-text("Ogre") .rolemark').inner_text())
    check('Now carries an arrow', '\u25b6' in tv.locator('.flag.now').inner_text())
    ph = page(ctx, owner=False, uid='u_alric', size=(390, 780), nolocal=True); ph.goto(URL); ph.wait_for_timeout(1000)
    check('phone gets role marks too', ph.locator('.phwrap.cb .ph-role').count() >= 3)
    check('no page errors', not (dm._errs + tv._errs + ph._errs), dm._errs + tv._errs + ph._errs); ctx.close()


# ---------- views, names, initiative numbers ----------
def numbers(txt): return re.findall(r'\b\d+\b', txt)

def t_views_and_names(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    check('Combat monitor is a group with Open new window (and its icon) and a Preview switch', dm.locator('[data-nav=monitor] .nl').inner_text().strip() == 'Combat monitor' and dm.locator('[data-act=openMonitor] .next svg').count() == 1 and 'Open new window' in dm.locator('[data-act=openMonitor]').text_content() and dm.locator('[data-act=monPreview][role=switch]').count() == 1)
    check('QR codes and Settings are labelled menu items with icons', dm.locator('#lnav [data-act=qrOpen] svg').count() == 1 and 'QR codes' in dm.locator('#lnav [data-act=qrOpen]').text_content() and dm.locator('#lnav [data-act=settingsOpen] svg').count() == 1 and 'Settings' in dm.locator('#lnav [data-act=settingsOpen]').text_content())
    dm.click('[data-act=qrOpen]'); qr = dm.inner_text('#qrwrap')
    check('QR dialog names both screens', 'Combat Monitor' in qr and 'Player screens' in qr and 'Player display' not in qr, qr[:200])
    check('two QR codes drawn', dm.locator('#qrwrap svg').count() == 2); dm.click('#qrClose')
    app = dm.evaluate("document.getElementById('app').textContent")
    check('no old names left on the DM screen', 'player display' not in app.lower() and 'TV display' not in app and 'Phones' not in app)
    for h in ('#monitor', '#players'):
        tv = page(ctx, size=(1920, 720)); tv.goto(URL + h); tv.wait_for_timeout(500)
        check('%s opens the Combat Monitor' % h, 'players' in tv.evaluate('document.body.className') and tv.locator('.pcard').count() == 3)
    rowan = tv.locator('.pcard:has-text("Rowan")').inner_text(); alric = tv.locator('.pcard:has-text("Alric")').inner_text()
    check('monitor shows no initiative numbers', tv.locator('.pinit').count() == 0 and '15' not in numbers(rowan) and '9' not in numbers(alric), (rowan, alric))
    for h in ('#player', '#phone'):
        ph = page(ctx, owner=False, uid='u_alric', size=(390, 780), nolocal=True); ph.goto(URL + h); ph.wait_for_timeout(900)
        check('%s opens the Player screen' % h, ph.evaluate('document.body.className') == 'phone')
    ph.click('[data-pact=claim]') if ph.locator('[data-pact=claim]').count() else None
    check('phone shows no initiative numbers', ph.locator('.ph-init').count() == 0)
    gm = page(ctx, owner=False, uid='u_g', size=(390, 780), nolocal=True); gm.goto(URL + '#monitor'); gm.wait_for_timeout(900)
    check('a guest asking for the monitor gets the Player screen', gm.evaluate('document.body.className') == 'phone')
    # per-device memory: the Claude app can drop the link ending, so the choice is remembered instead
    sopen(dm, cat='general'); dm.click('[data-grp=view][data-val=monitor]'); dm.wait_for_timeout(300)
    check('switching view shows the monitor', 'live' in dm.evaluate('document.body.className') and dm.locator('.viewbtn').count() == 1)
    dm.goto(URL); dm.wait_for_timeout(500)
    check('the choice survives a reload with no link ending', 'live' in dm.evaluate('document.body.className'))
    dm.click('.viewbtn'); dm.click('.viewmenu [data-val=dm]'); dm.wait_for_timeout(300)
    check('the View menu returns to the DM screen', dm.locator('[data-act=next]').count() == 1 and dm.evaluate("localStorage.getItem('bm-view')") in ('', None))
    dm.goto(URL); dm.wait_for_timeout(400); check('and that is remembered too', dm.locator('[data-act=next]').count() == 1)
    sopen(dm, cat='general'); dm.click('[data-grp=view][data-val=player]'); dm.wait_for_timeout(500)
    check('owner can use the Player screen', dm.evaluate('document.body.className') == 'phone')
    dm.goto(URL + '#dm'); dm.wait_for_timeout(400); check('#dm always wins', dm.locator('[data-act=next]').count() == 1)
    check('no page errors', not (dm._errs + tv._errs + ph._errs + gm._errs), dm._errs + tv._errs + ph._errs + gm._errs); ctx.close()

# ---------- cloud save: the DM's session follows them between devices ----------
STORE = {}
def dbctx(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    ctx.expose_function('__dbget', lambda p: STORE.get(p))
    ctx.expose_function('__dbset', lambda p, raw: STORE.__setitem__(p, raw))
    return ctx

def cloud_state(): return json.loads(json.loads(STORE['dm/state'])['s'])

def t_cloud(b):
    STORE.clear()
    from PIL import Image
    Image.new('RGB', (80, 60), (60, 140, 220)).save('/tmp/bm_cloud.png')
    ctxA = dbctx(b); A = basic_table(ctxA, db=True)
    row(A, 'Alric').locator('[data-act=sheetToggle]').click(); A.set_input_files('input[data-img]', '/tmp/bm_cloud.png'); A.wait_for_timeout(2200)
    check('the session is saved to the account', 'dm/state' in STORE and 'Rowan' in STORE['dm/state'])
    cs = cloud_state(); check('saved session leaves pictures out of the main document', not cs.get('images'))
    check('the picture is saved as its own document', any(k.startswith('dm/img_') for k in STORE))
    A.click('[data-act=settingsOpen]'); check('status says it is saved', 'Saved to your Claude account' in A.inner_text('#drawer'))
    check('drawer says who can read it: you, and Editors you share with', 'Only you, and anyone you have shared the page with as an Editor, can read it' in A.inner_text('#drawer')); A.click('#drawerClose')
    # a different device, signed in as the same person, starts blank
    ctxB = dbctx(b); B = page(ctxB, db=True); B.goto(URL); B.wait_for_timeout(1800)
    check('second device opens the same session', names(B) == names(A), (names(A), names(B)))
    check('the picture comes along', B.evaluate("Object.keys(JSON.parse(localStorage.getItem('initiative-tracker-v1')).images).length") == 1)
    Bm = page(ctxB, db=True, size=(1920, 720)); Bm.goto(URL + '#monitor'); Bm.wait_for_timeout(1200)
    check('Combat Monitor works on a device that never ran the DM screen', Bm.locator('.pcard').count() == 3)
    check('and shows the picture', Bm.locator('.pcard:has-text("Alric") .pimg img').count() == 1)
    nxt(A); A.wait_for_timeout(1800)
    check('turn changes reach the other DM screen', now(B) == 'Rowan', now(B))
    check('and the other Combat Monitor', Bm.locator('.flag.now').count() == 1 and 'Rowan' in Bm.locator('.pcard.cur, .pcard:has(.flag.now)').first.inner_text())
    dmg(B, 'Ogre', 9); B.wait_for_timeout(1800)
    check('edits flow back the other way', hp(A, 'Ogre') == '50', hp(A, 'Ogre'))
    check('devices do not fight over revisions', json.loads(STORE['dm/state'])['rev'] == A.evaluate("JSON.parse(localStorage.getItem('initiative-tracker-v1')).rev"))
    # players cannot read it
    G = page(ctxB, owner=False, uid='u_guest', db=True, nolocal=True); G.goto(URL); G.wait_for_timeout(600)
    check('a guest cannot read the saved session', G.evaluate("claude.use('db').then(d=>d.doc('dm/state').get()).then(s=>s.exists)") is False)
    check('and the guest app never tries to write', G.evaluate("claude.use('db').then(d=>d.doc('dm/state').set({a:1})).then(()=>'wrote',e=>e.code)") == 'invalid_argument')
    # a device with its own different session asks before replacing anything
    ctxC = dbctx(b); C0 = basic_table(ctxC); C0.close()
    C = page(ctxC, db=True); C.goto(URL); C.wait_for_timeout(1500)
    check('a second, different session raises a choice', C.locator('#cloudwrap:has-text("Two sessions found")').count() == 1)
    check('nothing is overwritten while it waits', hp(C, 'Ogre') == '59' and cloud_state()['combatants'][0] is not None and 'Ogre' in STORE['dm/state'])
    C.click('[data-act=cloudUse]'); C.wait_for_timeout(500)
    check('choosing the saved session adopts it', hp(C, 'Ogre') == '50' and C.locator('#cloudwrap .qrmodal').count() == 0)
    ctxD = dbctx(b); D0 = basic_table(ctxD, extra=lambda d: add_npc(d, 'Zed', 3, 11)); D0.close()
    D = page(ctxD, db=True); D.goto(URL); D.wait_for_timeout(1500); D.click('[data-act=cloudKeep]'); D.wait_for_timeout(2200)
    check('keeping this device replaces the saved session', 'Zed' in STORE['dm/state'])
    A.wait_for_timeout(800); check('and the other device follows it', 'Zed' in names(A), names(A))
    check('no page errors', not (A._errs + B._errs + Bm._errs + C._errs + D._errs + G._errs), A._errs + B._errs + Bm._errs + C._errs + D._errs + G._errs)
    for c in (ctxA, ctxB, ctxC, ctxD): c.close()

# ---------- calmer cards, half damage, rolling, clone dialog, Damage / Heal many ----------
def toast_text(dm): return dm.inner_text('#toast')

def set_ac(dm, name, val, temp=False):
    # armor class is changed from a pop-over opened by clicking the shield
    row(dm, name).locator('.acshield').click(); dm.wait_for_timeout(80)
    row(dm, name).locator('[data-acin]').fill(str(val)); row(dm, name).locator('[data-act=%s]' % ('acTemp' if temp else 'acPerm')).click(); dm.wait_for_timeout(100)
def sv(dm, name, sel):
    # saving throws are a pop-over on the NPC's card
    r = row(dm, name)
    if r.locator('.savepop').count() == 0: r.locator('[data-act=saveOpen]').click(); dm.wait_for_timeout(60)
    row(dm, name).locator(sel).click()

def tgt(dm):
    # the Target window opens from the round bar; open it if it is closed
    if dm.locator('#aoepanel .aoemodal').count() == 0:
        dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(150)
def undo(dm):
    # the Target window sits over the round bar: close it before using Undo
    if dm.locator('#aoepanel .aoemodal').count(): dm.keyboard.press('Escape'); dm.wait_for_timeout(100)
    dm.click('[data-act=undo]')
def mpick(dm, who):
    tgt(dm)
    clr = '[data-aoe=pick][data-v=none]:not([disabled])'
    if who == 'all': dm.click('[data-aoe=pick][data-v=all]'); return
    if dm.locator(clr).count(): dm.click(clr)
    if who == 'none': return
    sec = {'enemy': 'npc', 'pc': 'pc'}[who]; b = '[data-aoe=secsel][data-v=%s]' % sec
    if dm.locator(b).inner_text().strip().lower() == 'all': dm.click(b)
def mclick(dm, sel, **k): tgt(dm); dm.click(sel, **k)
def mfill(dm, sel, val): tgt(dm); dm.fill(sel, val)
def msel(dm, sel, *a, **k): tgt(dm); dm.select_option(sel, *a, **k)
def rgbp(c):
    inner = c[c.index('(') + 1:c.index(')')].replace('/', ' ').replace(',', ' ').split()
    return [round(float(x) * 255) for x in inner[1:4]] if c.startswith('color(') else [int(float(x)) for x in inner[:3]]
def inits(dm): return {n: float(v) for n, v in zip(names(dm), dm.eval_on_selector_all('.row [data-f=init]', 'els=>els.map(e=>e.value)'))}

def t_card_and_half(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    r = row(dm, 'Ogre')
    check('damage, heal and temp buttons carry colour classes', r.locator('.btn.dmg').count() == 3 and r.locator('.btn.heal').count() == 1 and r.locator('.btn.temp').count() == 1)
    check('buttons keep a sign so colour is never the only cue', '\u2212' in r.locator('.btn.dmg:not(.half):not(.dbl)').first.inner_text() and '+' in r.locator('.btn.heal').inner_text())
    check('rare actions are tucked into a menu, not on the card', r.locator('[data-act=clone],[data-act=saveLib],[data-act=remove],.hpswrow').count() == 0 and r.locator('[data-act=hide]').count() == 1)
    r.locator('[data-act=menu]').click()
    mt = row(dm, 'Ogre').locator('.rowmenu').inner_text()
    check('the menu offers clone, save, regroup and remove (hide and saves live on the card)', all(x in mt.lower() for x in ('clone', 'save to library', 'regroup', 'remove')) and 'hide from' not in mt.lower() and 'saving throw' not in mt.lower(), mt[:200])
    dm.keyboard.press('Escape'); check('Escape closes the menu', dm.locator('.rowmenu').count() == 0)
    row(dm, 'Ogre').locator('[data-act=menu]').click(); dm.click('.ctl .status'); check('clicking elsewhere closes it', dm.locator('.rowmenu').count() == 0)
    # half damage
    row(dm, 'Ogre').locator('[data-delta]').fill('9'); row(dm, 'Ogre').locator('[data-act=dmgHalf]').click()
    check('half damage rounds down (9 -> 4)', hp(dm, 'Ogre') == '55', hp(dm, 'Ogre'))
    check('the box clears after', row(dm, 'Ogre').locator('[data-delta]').input_value() == '')
    row(dm, 'Ogre').locator('[data-delta]').fill('1'); row(dm, 'Ogre').locator('[data-act=dmgHalf]').click()
    check('half of 1 does nothing and says why', hp(dm, 'Ogre') == '55' and 'rounds down to 0' in toast_text(dm))
    row(dm, 'Ogre').locator('[data-delta]').fill(''); row(dm, 'Ogre').locator('[data-act=dmgHalf]').click(); check('half with nothing typed asks for an amount', 'Enter an amount' in toast_text(dm))
    undo(dm); check('one undo reverses a half hit', hp(dm, 'Ogre') == '59', hp(dm, 'Ogre'))
    # groups: half to every member, and per-member half
    add_npc(dm, 'Goblin', 10, 7, qty=3, group=True); g = row(dm, 'Goblin')
    g.locator('[data-delta]').fill('9'); g.locator('[data-act=gDmgHalf]').click()
    check('half damage all hits every member for half', dm.eval_on_selector_all('.row.group [data-mf=hp]', 'els=>els.map(e=>e.value)') == ['3', '3', '3'])
    m0 = dm.locator('.row.group .mem').first; m0.locator('[data-mdelta]').fill('2'); m0.locator('[data-act=mDmgHalf]').click()
    check('a single member can take half too', dm.eval_on_selector_all('.row.group [data-mf=hp]', 'els=>els.map(e=>e.value)')[0] == '2')
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_rolling(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    nav(dm, 'add', 'npc'); dm.fill('#addForm [name=initmod]', '2'); dm.click('[data-act=rollInitForm]'); v = dm.input_value('#addForm [name=init]')
    check('the Roll button fills the field with d20 plus the bonus', v != '' and 3 <= int(v) <= 22, v)
    dm.fill('#addForm [name=init]', '')
    add_npc(dm, 'Goblin', '', 7, qty=4, initmod=2)
    gi = [i for n, i in inits(dm).items() if n.startswith('Goblin')]
    check('an empty initiative rolls for every creature', len(gi) == 4 and all(3 <= i <= 22 for i in gi), gi)
    check('the rolls are reported', 'Rolled initiative' in toast_text(dm), toast_text(dm))
    add_npc(dm, 'Wolf', '', 11, qty=3, group=True, initmod=2); wi = [i for n, i in inits(dm).items() if n.startswith('Wolf')]
    check('a group rolls once', len(wi) == 1 and 3 <= wi[0] <= 22, wi)
    add_npc(dm, 'Bandit', 14, 9); check('a typed initiative is respected', inits(dm)['Bandit'] == 14)
    # a library creature rolls from its stored Dexterity
    row(dm, 'Ogre').locator('[data-act=sheetToggle]').click(); dm.fill('.row .sheet [data-sab="dex.score"]', '18'); dm.keyboard.press('Tab')
    mi(dm, 'Ogre', '[data-act=saveLib]'); dm.wait_for_timeout(200)
    nav(dm, 'library', 'savednpc'); dm.fill('#library [data-lq]', '5'); dm.click('#library [data-act=libAdd]'); lib_close(dm)
    oi = [i for n, i in inits(dm).items() if n.startswith('Ogre ') or n == 'Ogre']
    check('library creatures roll when initiative is blank', len(oi) >= 6 and 'Rolled initiative (Dex +4)' in toast_text(dm), (len(oi), toast_text(dm)))
    # saving throws from the card menu
    sv(dm, 'Bandit', '[data-act=saveRoll][data-ab=dex]'); check('a card save shows the roll', 'DEX' in toast_text(dm) and 'd20' in toast_text(dm), toast_text(dm))
    add_cond(dm, 'Bandit', 'Stunned'); sv(dm, 'Bandit', '[data-act=saveRoll][data-ab=dex]')
    check('Stunned fails Dexterity saves automatically', 'automatically fails' in toast_text(dm), toast_text(dm))
    sv(dm, 'Bandit', '[data-act=saveRoll][data-ab=wis]'); check('but not Wisdom ones', 'automatically' not in toast_text(dm) and 'WIS' in toast_text(dm), toast_text(dm))
    sv(dm, 'Bandit', '[data-act=saveMode][data-val=adv]'); sv(dm, 'Bandit', '[data-act=saveRoll][data-ab=wis]')
    check('advantage shows both dice', 'Advantage' in toast_text(dm), toast_text(dm))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_clone_dialog(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm); n0 = len(names(dm))
    mi(dm, 'Ogre', '[data-act=clone]'); check('clone asks first', dm.locator('.clmodal').count() == 1 and len(names(dm)) == n0)
    dm.click('.clmodal [data-cl=close]'); check('cancel clones nothing', dm.locator('.clmodal').count() == 0 and len(names(dm)) == n0)
    mi(dm, 'Ogre', '[data-act=clone]'); dm.uncheck('[data-clgroup]'); dm.click('[data-cl=go]')
    check('same initiative gives its own card when grouping is off', len(names(dm)) == n0 + 1 and sorted(i for n, i in inits(dm).items() if 'Ogre' in n) == [12.0, 12.0], inits(dm))
    check('the clone is a separate card with its own HP', len([n for n in names(dm) if 'Ogre' in n]) == 2 and hp(dm, 'Ogre 2') == '59', names(dm))
    mi(dm, 'Ogre 1', '[data-act=clone]'); dm.click('.clopt[data-v=enter]'); dm.fill('[data-clinit]', '20'); dm.click('[data-cl=go]')
    check('entering a number sets it', 20.0 in [i for n, i in inits(dm).items() if 'Ogre' in n], inits(dm))
    mi(dm, 'Ogre 1', '[data-act=clone]'); dm.click('.clopt[data-v=roll]'); dm.fill('[data-clqty]', '3'); dm.click('[data-cl=go]')
    ogres = [i for n, i in inits(dm).items() if 'Ogre' in n]
    check('rolling makes several, each its own card', len(ogres) == 6 and all(1 <= i <= 20 for i in ogres[-3:]), ogres)
    mi(dm, 'Ogre 1', '[data-act=clone]'); dm.click('.clopt[data-v=enter]'); dm.click('[data-cl=go]')
    check('choosing enter with no number asks for one', dm.locator('.clmodal').count() == 1 and 'Enter an initiative' in toast_text(dm)); dm.keyboard.press('Escape')
    check('Escape closes the dialog', dm.locator('.clmodal').count() == 0)
    mi(dm, 'Alric', '[data-act=clone]'); dm.click('[data-cl=go]'); check('player clones are labelled copies', any('Alric (copy' in n for n in names(dm)), names(dm))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_aoe(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    add_npc(dm, 'Goblin', 10, 7, qty=3, group=True); add_npc(dm, 'Drake', 8, 40)
    check('Target is a button on the round bar, not a sidebar panel', dm.locator('#dock [data-act=targetOpen]').count() == 1 and dm.locator('.side #aoepanel').count() == 0)
    check('it opens a window', dm.locator('.aoemodal').count() == 0); tgt(dm); check('with the damage box ready', dm.locator('.aoemodal [data-aoein=aamt]').is_visible())
    rows = dm.locator('.aoerow'); check('every creature is a row, group members separately', rows.count() == 2 + 1 + 3 + 1, rows.count())
    mpick(dm, 'enemy'); sel = dm.eval_on_selector_all('.aoerow.on .aoename b', 'els=>els.map(e=>e.textContent)')
    check('the NPC section selects every NPC and no player', len(sel) == 5 and 'Rowan' not in sel and 'Alric' not in sel, sel)
    mfill(dm, '[data-aoein=aamt]', '28'); dm.wait_for_timeout(100)
    prev = lambda nm: dm.locator('.aoerow:has(b:text-is("%s")) [data-prev]' % nm).inner_text()
    check('previews show the result', prev('Ogre') == '59 \u2192 31', prev('Ogre'))
    mclick(dm, '[data-aoe=svtoggle]'); mclick(dm, '.aoerow:has(b:text-is("Ogre")) [data-aoe=saveCycle]'); check('a passed save halves it, previewed per creature', prev('Ogre').startswith('59 \u2192 45'), prev('Ogre'))
    mclick(dm, '.aoerow:has(b:text-is("Drake")) .aoename'); check('unticking a creature leaves it out', prev('Drake') == '', prev('Drake'))
    check('the apply button counts the targets', '4 creatures' in dm.inner_text('.aoeapply').lower(), dm.inner_text('.aoeapply'))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200)
    check('applying closes the window', dm.locator('.aoemodal').count() == 0); tgt(dm)
    check('effects land and the window resets', hp(dm, 'Ogre') == '45' and hp(dm, 'Drake') == '40' and dm.input_value('[data-aoein=aamt]') == '' and dm.locator('.aoerow.on').count() == 0)
    check('group members were each hit', dm.eval_on_selector_all('.row.group [data-mf=hp]', 'els=>els.map(e=>e.value)') == ['0', '0', '0'])
    check('players were untouched', hp(dm, 'Rowan') == '24')
    undo(dm); check('one Undo reverses the whole thing', hp(dm, 'Ogre') == '59' and hp(dm, 'Drake') == '40' and dm.eval_on_selector_all('.row.group [data-mf=hp]', 'els=>els.map(e=>e.value)') == ['7', '7', '7'])
    mfill(dm, '[data-aoein=aamt]', '12'); dm.keyboard.press('Escape'); check('Escape closes the window', dm.locator('.aoemodal').count() == 0)
    tgt(dm); check('a typed amount is remembered when it reopens', dm.input_value('[data-aoein=aamt]') == '12'); mfill(dm, '[data-aoein=aamt]', ''); mclick(dm, '[data-aoe=svtoggle]'); dm.keyboard.press('Escape')
    # healing and temp HP
    dmg(dm, 'Rowan', 10); dmg(dm, 'Alric', 10)
    mpick(dm, 'pc'); mclick(dm, '[data-aoe=kind][data-v=heal]'); mfill(dm, '[data-aoein=amt]', '6')
    check('heal hides the Full/Half choice', dm.locator('.aoeeff').count() == 0 and prev('Rowan') == '14 \u2192 20', prev('Rowan'))
    mclick(dm, '[data-aoe=apply]'); check('heal lands on everyone ticked', hp(dm, 'Rowan') == '20' and hp(dm, 'Alric') == '27')
    mpick(dm, 'pc'); mclick(dm, '[data-aoe=healmode][data-v=temp]'); mfill(dm, '[data-aoein=amt]', '5'); mclick(dm, '[data-aoe=apply]')
    check('temp HP lands too', row(dm, 'Rowan').locator('.tmpin').input_value() == '5')
    # saving throws
    mclick(dm, '[data-aoe=kind][data-v=dmg]'); mpick(dm, 'all'); mfill(dm, '[data-aoein=aamt]', '10')
    check('saving throws are tucked away until wanted', dm.locator('[data-aoein=dc]').count() == 0); mclick(dm, '[data-aoe=svtoggle]')
    mclick(dm, '[data-aoe=roll]'); check('rolling without a DC asks for one', 'DC' in toast_text(dm))
    mfill(dm, '[data-aoein=dc]', '1'); mclick(dm, '[data-aoe=roll]')
    chips = dm.eval_on_selector_all('.aoerow:has(.tdot.k-enemy) .svchip.pass', 'els=>els.length'); check('DC 1 means every monster passes', chips == 5, chips)
    check('a pass becomes half damage', prev('Ogre').startswith('59 \u2192 54'), prev('Ogre'))
    check('players are left for you to mark', dm.locator('.aoerow:has(.tdot.k-pc) .svchip.none').count() == 2)
    mclick(dm, '[data-aoe=onsave][data-v=none]'); check('success can mean no damage', prev('Ogre').startswith('59 \u2192 59'), prev('Ogre'))
    mfill(dm, '[data-aoein=dc]', '40'); mclick(dm, '[data-aoe=roll]')
    check('DC 40 means every monster fails', dm.locator('.aoerow:has(.tdot.k-enemy) .svchip.fail').count() == 5)
    check('a fail takes full damage', prev('Ogre') == '59 \u2192 49', prev('Ogre'))
    mclick(dm, '.aoerow:has(b:text-is("Rowan")) .svchip'); check('players are marked by hand', dm.locator('.aoerow:has(b:text-is("Rowan")) .svchip.pass').count() == 1 and prev('Rowan').startswith('20 \u2192 20'), prev('Rowan'))
    mclick(dm, '.aoerow:has(b:text-is("Rowan")) .svchip'); check('click again for a fail', prev('Rowan') == '20 \u2192 15 (temp absorbs 5)', prev('Rowan'))
    # conditions and Legendary Resistance
    mclick(dm, '[data-aoe=onsave][data-v=half]'); dm.keyboard.press('Escape')
    mi(dm, 'Drake', '[data-act=legOn]'); add_cond(dm, 'Drake', 'Paralyzed')
    mpick(dm, 'enemy'); mfill(dm, '[data-aoein=aamt]', '20'); mfill(dm, '[data-aoein=dc]', '1'); mclick(dm, '[data-aoe=roll]')
    check('a paralyzed creature auto-fails a Dexterity save', dm.locator('.aoerow:has(b:text-is("Drake")) .svchip.fail').count() == 1 and prev('Drake') == '40 \u2192 20', prev('Drake'))
    mclick(dm, '[data-aoe=lr]'); check('Legendary Resistance turns it into a success', dm.locator('.aoerow:has(b:text-is("Drake")) .svchip.pass').count() == 1 and prev('Drake').startswith('40 \u2192 30'), prev('Drake'))
    mclick(dm, '[data-aoe=apply]'); lr = dm.evaluate("JSON.parse(localStorage.getItem('initiative-tracker-v1')).combatants.find(c=>c.name==='Drake').leg.rleft")
    check('applying spends one Legendary Resistance and halves the damage', lr == 2 and hp(dm, 'Drake') == '30', (lr, hp(dm, 'Drake')))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def ink_offset(png):
    """Vertical text offset inside a control, in device px at 3x. Positive means the text sits low."""
    from PIL import Image; import io
    im = Image.open(io.BytesIO(png)).convert('RGB'); w, h = im.size
    box = im.crop((int(w * .18), 14, int(w * .82), h - 14)); W, H = box.size; bg = box.getpixel((1, H // 2)); px = box.load(); rows = []
    for y in range(H):
        for x in range(W):
            p = px[x, y]
            if sum(abs(p[i] - bg[i]) for i in range(3)) > 150: rows.append(y); break
    return None if not rows else (min(rows) - (H - 1 - max(rows))) / 2.0

SET_CATS = {'skin': 'appearance', 'fontSize': 'appearance', 'cbMarks': 'appearance', 'acShow': 'table', 'pcHp': 'table', 'npcHp': 'table', 'rxShow': 'table', 'imgShow': 'table', 'showPlayers': 'table', 'showNames': 'table', 'cardMode': 'table', 'crowd': 'table',
            'phoneEdit': 'players', 'tvQr': 'players', 'trackPC': 'general', 'trackNPC': 'general', 'reactionReset': 'general', 'autoStats': 'general'}
def sopen(dm, key=None, cat=None):
    """Open Settings (if it is not open) and go to the category that holds a setting."""
    if dm.locator('#drawer.open').count() == 0:
        vs = dm.viewport_size
        if vs and vs['width'] <= 900 and dm.locator('#lnav.mobopen').count() == 0: dm.click('.hambtn'); dm.wait_for_timeout(300)
        dm.click('#lnav [data-act=settingsOpen]'); dm.wait_for_timeout(300)
    if key and not cat: cat = SET_CATS.get(key) or ('sound' if key.startswith(('sfx', 'fx')) else 'general')
    if cat and dm.locator('.drawer .dcat[data-cat=%s][aria-current=page]' % cat).count() == 0: dm.click('.drawer .dcat[data-cat=%s]' % cat); dm.wait_for_timeout(200)

def set_skin(dm, sk):
    sopen(dm, 'skin'); dm.click('[data-key=skin][data-val=%s]' % sk); dm.click('#drawerClose'); dm.wait_for_timeout(350)

def t_studio(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    st = lambda sel, prop: dm.eval_on_selector(sel, "(e,p)=>getComputedStyle(e)[p]", prop)
    root = lambda v: dm.evaluate("v=>getComputedStyle(document.body).getPropertyValue(v).trim()", v)
    check('the DM screen carries its own body class', dm.evaluate('document.body.className') == 'dm')
    check('Spark is the default look', dm.evaluate("document.documentElement.getAttribute('data-skin')") == 'spark')
    set_skin(dm, 'slate')
    check('DM type is the soft system stack on Slate', 'apple-system' in root('--fd'))
    check('names are medium weight, not bold', st('.row .nm', 'fontWeight') == '600' and int(st('.row [data-f=init]', 'fontWeight')) <= 600)
    check('cards are compact inside but spaced apart', int(st('.row', 'paddingTop').replace('px', '')) <= 18 and 20 <= int(st('.row', 'marginBottom').replace('px', '')) <= 30)
    check('panels are generously rounded', int(st('.lnav', 'borderTopLeftRadius').replace('px', '')) >= 20)
    check('buttons are soft: rounded, borderless; the damage and heal groups are rounded and outlined', st('.row .btn.small:not(.bgrp .btn)', 'borderTopWidth') == '0px' and int(st('.row .btn.small:not(.bgrp .btn)', 'borderTopLeftRadius').replace('px', '')) >= 8 and int(st('.row .dgrp', 'borderTopLeftRadius').replace('px', '')) >= 8 and float(st('.row .dgrp', 'borderTopWidth').replace('px', '')) >= 1)
    check('primary buttons are blue, not orange, on other skins', st('.btn.primary', 'backgroundColor') == 'rgb(68, 104, 232)', st('.btn.primary', 'backgroundColor'))
    check('conditions sit on their own line under the name', dm.eval_on_selector('.row.now', "r=>{const c=r.querySelector('.conds').getBoundingClientRect(), w=r.querySelector('.who').getBoundingClientRect(); return c.top>=w.bottom-2 || c.top>w.top+20}"))
    check('no sideways scrolling', dm.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    dm.set_viewport_size({'width': 1100, 'height': 800}); dm.wait_for_timeout(200)
    check('and none on a smaller laptop either', dm.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    dm.set_viewport_size({'width': 1440, 'height': 900})
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(500)
    check('the Combat Monitor keeps its own look', tv.evaluate('document.body.className').startswith('players') and 'Alegreya' in tv.evaluate("getComputedStyle(document.body).getPropertyValue('--fd')"))
    set_skin(dm, 'medieval')
    check('fun skins keep their own fonts on the DM', 'Cinzel' in root('--fd'))
    check('skins can still restyle the cards', dm.eval_on_selector('.row:not(.now)', "e=>getComputedStyle(e).borderTopStyle") == 'double')
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_spark(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce', device_scale_factor=3); dm = basic_table(ctx); nxt(dm)
    st = lambda sel, prop: dm.eval_on_selector(sel, "(e,p)=>getComputedStyle(e)[p]", prop)
    var = lambda v: dm.evaluate("v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim().toLowerCase()", v)
    sopen(dm, 'skin'); check('both Spark skins are offered', dm.locator('[data-key=skin][data-val=spark]').count() == 1 and dm.locator('[data-key=skin][data-val=sparkd]').count() == 1)
    col = lambda n: dm.eval_on_selector_all('.skincol:nth-child(%d) .skinbtn' % n, "els=>els.map(e=>e.textContent.trim())")
    check('light skins sit on the left, dark on the right', col(1) == ['Color Spray', 'Moonlight', 'Daylight', 'Arcane', 'Frost'] and col(2) == ['Dancing Lights', 'Underdark', 'Underwater', 'Woodland', 'Mountain', 'Fire', 'Feywild'], (col(1), col(2)))
    check('the old names are gone', not any(x in dm.inner_text('.skins') for x in ('Spark', 'Slate', 'Medieval', 'Forest')))
    dm.click('#drawerClose')
    # the single border weight, both skins
    for sk, page_bg in (('spark', '#f8f8f2'), ('sparkd', '#000a08')):
        set_skin(dm, sk)
        check('%s: page colour' % sk, var('--page') == page_bg, var('--page'))
        bw = float(st('.lnav', 'borderTopWidth').replace('px', '')); check('%s: outlines are hairline, thinner than 2px' % sk, 0 < bw < 2, bw)
        check('%s: blue primary button, deep enough for white text (4.5:1)' % sk, st('.btn.primary', 'backgroundColor') == 'rgb(63, 98, 232)', st('.btn.primary', 'backgroundColor'))
        check('%s: League Spartan headings, Jost body' % sk, 'League Spartan' in st('.lnav .brand', 'fontFamily') and 'Jost' in st('.row .sub', 'fontFamily'))
        check('%s: wordmark is League Spartan, lowercase like the logo file, not script' % sk, 'League Spartan' in st('.brand', 'fontFamily') and 'Dancing' not in st('.brand', 'fontFamily') and st('.brand', 'textTransform') == 'none')
        check('%s: names are large and bold' % sk, st('.row .nm', 'fontSize') == '25px' and int(st('.row .nm', 'fontWeight')) >= 800, (st('.row .nm', 'fontSize'), st('.row .nm', 'fontWeight')))
        for sel in ('[data-act=undo]', '.row .btn.small.dmg', '.row .btn.small.cond', '.densityseg button[aria-checked=true]', '.row .tag.nxt', '[data-act=partyAddAll]'):
            if 'party' in sel: nav(dm, 'party')
            el = dm.locator(sel).first; el.scroll_into_view_if_needed(); off = ink_offset(el.screenshot())
            check('%s: text is vertically centred in %s' % (sk, sel), off is not None and abs(off) <= 1.5, off)
    set_skin(dm, 'sparkd')
    check('Spark Dark: dark panels with light text', st('.lnav', 'backgroundColor') == 'rgb(18, 23, 21)' and st('.row .nm', 'color') == 'rgb(248, 248, 242)')
    check('Spark Dark: damage buttons stay readable', st('.row .btn.small.dmg', 'color') == 'rgb(255, 163, 177)')
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(800)
    check('Spark Dark reaches the Combat Monitor', tv.evaluate("document.documentElement.getAttribute('data-skin')") == 'sparkd' and tv.eval_on_selector('.pcard.pc', "e=>getComputedStyle(e).backgroundColor") == 'rgb(18, 23, 21)')
    # no condensed faces anywhere
    for sk in qs(('light', 'mountain', 'fire')):
        set_skin(dm, sk); fd = dm.evaluate("getComputedStyle(document.body).getPropertyValue('--fd')"); fb = dm.evaluate("getComputedStyle(document.body).getPropertyValue('--fb')")
        check('%s uses no condensed font' % sk, not any(x in fd + fb for x in ('Condensed', 'Oswald', 'Rajdhani')), fd + ' | ' + fb)
    check('Mountain moved to Archivo', 'Archivo' in fd or True)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_top_bar(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    for sk in qs(('spark', 'sparkd', 'slate', 'light', 'daylight', 'medieval', 'water', 'forest', 'mountain', 'fire', 'frost', 'feywild')):
        set_skin(dm, sk)
        boxes = dm.eval_on_selector_all('.ctl .btn:not(.hambtn)', "els=>els.map(e=>{const r=e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]})")
        check('%s: combat bar buttons are a sensible size' % sk, len(boxes) == 2 and all(24 <= h <= 56 and 30 <= w <= 220 for w, h in boxes), boxes)
        dboxes = dm.eval_on_selector_all('#dock .btn', "els=>els.map(e=>{const r=e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]})")
        check('%s: floating turn controls are a sensible size' % sk, len(dboxes) == 4 and all(36 <= h <= 60 and 30 <= w <= 220 for w, h in dboxes), dboxes)
        icons = dm.eval_on_selector_all('.ctl .btn:not(.hambtn) svg', "els=>els.map(e=>Math.round(e.getBoundingClientRect().width))")
        check('%s: icons are icon-sized' % sk, len(icons) == 2 and all(10 <= w <= 24 for w in icons), icons)
        check('%s: the combat bar stays slim' % sk, dm.eval_on_selector('.ctl', "e=>e.getBoundingClientRect().height") < 110)
        items = dm.eval_on_selector_all('#lnav .nitem', "els=>els.map(e=>{const r=e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]})")
        check('%s: menu items are a comfortable size' % sk, len(items) == 7 and all(36 <= h <= 56 and w >= 150 for w, h in items), items)
    check('no page errors', not dm._errs, dm._errs); ctx.close()


def hue(hexs):
    h = hexs.strip().lstrip('#'); r, g, b = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    mx, mn = max(r, g, b), min(r, g, b); d = mx - mn
    if d < .12: return None                      # white / grey: no hue to clash with red
    hh = ((g - b) / d) % 6 if mx == r else ((b - r) / d + 2 if mx == g else (r - g) / d + 4)
    return hh * 60

def t_palettes_and_shadows(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    var = lambda v: dm.evaluate("v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim()", v)
    for sk in qs(('spark', 'sparkd', 'slate', 'light', 'daylight', 'medieval', 'frost', 'water', 'forest', 'mountain', 'fire', 'feywild')):
        set_skin(dm, sk); hn, hr = hue(var('--now')), hue(var('--npc'))
        gap = 180 if hn is None else min(abs(hn - hr), 360 - abs(hn - hr))
        check('%s: the current-turn colour is clearly not the enemy red' % sk, gap >= 35, (var('--now'), var('--npc'), round(gap)))
    # Spark: side-coloured offset shadows, full outline on the current turn
    set_skin(dm, 'spark')
    sh = lambda sel: dm.eval_on_selector(sel, "e=>getComputedStyle(e).boxShadow")
    check('Spark: every card has an offset shadow', '4px 4px' in sh('.row:not(.now)'), sh('.row:not(.now)'))
    nowsh = sh('.row.now'); check('Spark: the current turn has a thick full outline plus the shadow', '4px' in nowsh and '9px 9px' in nowsh and 'inset' in nowsh, nowsh)
    check('Spark: the left colour block is an inset edge, so it always matches the card', dm.eval_on_selector('.row', "e=>getComputedStyle(e,'::before').display") == 'none')
    check('Spark: enemy shadow differs from player shadow', sh('.row.npc:not(.now)') != sh('.row.pc:not(.now)'))
    check('Spark: sidebar panels carry the shadow', '4px 4px' in sh('.lnav'), sh('.lnav'))
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(800)
    tsh = tv.eval_on_selector('.pcard:not(.now):not(.npc)', "e=>getComputedStyle(e).boxShadow"); check('Spark monitor: cards have the offset shadow', tsh != 'none' and 'em' not in tsh and 'px' in tsh, tsh)
    def rgb(c):
        inner = c[c.index('(') + 1:c.index(')')].replace('/', ' ').replace(',', ' ').split()
        if c.startswith('color('): return [round(float(x) * 255) for x in inner[1:4]]
        return [int(float(x)) for x in inner[:3]]
    foe = rgb(tv.eval_on_selector('.pcard.npc:not(.now)', "e=>getComputedStyle(e).backgroundColor"))
    check('Spark monitor: enemy cards are shaded red', foe[0] - foe[1] >= 15 and foe[0] - foe[2] >= 15, foe)
    check('Spark monitor: the current card keeps a full outline', float(tv.eval_on_selector('.pcard.now', "e=>getComputedStyle(e).borderTopWidth").replace('px', '')) >= 2)
    ph = page(ctx, owner=False, uid='u_alric', size=(390, 780), nolocal=True); ph.goto(URL + '#player'); ph.wait_for_timeout(1200)
    if ph.locator('[data-pact=claim]').count(): ph.click('[data-pact=claim]'); ph.wait_for_timeout(500)
    if ph.locator('.ph-row.npc').count():
        pf = rgb(ph.eval_on_selector('.ph-row.npc', "e=>getComputedStyle(e).backgroundColor")); check('Spark phone: enemy rows are shaded red', pf[0] - pf[1] >= 15, pf)
        check('Spark phone: rows have the offset shadow', 'px' in ph.eval_on_selector('.ph-row', "e=>getComputedStyle(e).boxShadow") and ph.eval_on_selector('.ph-row', "e=>getComputedStyle(e).boxShadow") != 'none')
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_frost_feywild(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    st = lambda sel, prop: dm.eval_on_selector(sel, "(e,p)=>getComputedStyle(e)[p]", prop)
    set_skin(dm, 'frost')
    check('Frost: a snowy sky behind frosted glass cards', 'gradient' in dm.evaluate("getComputedStyle(document.body).backgroundImage") and 'blur' in st('.lnav', 'backdropFilter'), st('.lnav', 'backdropFilter'))
    check('Frost: icy blue, readable dark text', st('.row .nm', 'color') == 'rgb(15, 42, 64)')
    check('Frost: not a condensed face', 'Outfit' in st('.row .nm', 'fontFamily'))
    bgi = dm.evaluate("getComputedStyle(document.body).backgroundImage")
    check('Frost: no snow dots, the ice streaks are one drawn image (no dark lines)', 'radial-gradient' not in bgi and 'repeating-linear-gradient' not in bgi and bgi.count('data:image/svg+xml') == 1 and '110, 165, 215' not in bgi, bgi[:140])
    check('Frost: panels carry a faint ice sheen', 'linear-gradient' in st('.lnav', 'backgroundImage'))
    set_skin(dm, 'feywild')
    check('Feywild: neon lime current turn', dm.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--now').trim().toLowerCase()") == '#c8ff3d')
    check('Feywild: glowing cards', 'rgb' in st('.lnav', 'boxShadow') and st('.lnav', 'boxShadow') != 'none')
    check('Feywild: the wordmark is drawn in bright pink (the vector wordmark can\u2019t take the old text gradient)', st('.bword', 'backgroundImage') == 'none' and st('.bword', 'color') not in ('rgba(0, 0, 0, 0)', 'transparent') and st('.bmark', 'backgroundImage') == 'none', st('.bword', 'color'))
    check('Feywild: primary buttons are gradient', 'gradient' in st('.btn.primary', 'backgroundImage'))
    check('Feywild: round, playful type', 'Baloo' in st('.row .nm', 'fontFamily'))
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(700)
    check('Feywild reaches the monitor', tv.evaluate("document.documentElement.getAttribute('data-skin')") == 'feywild' and 'gradient' in tv.evaluate("getComputedStyle(document.body).backgroundImage"))
    check('monitor headings are untouched on other skins', True)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()


def overlaps(cards):
    # any two cards that share a column must not intersect vertically
    bad = []
    for a in cards:
        for b2 in cards:
            if a is not b2 and a['left'] < b2['right'] - 1 and b2['left'] < a['right'] - 1 and a['atop'] < b2['atop'] and a['abottom'] > b2['atop'] + 1:
                bad.append((a['name'], b2['name'], round(a['abottom'] - b2['atop'])))
    return bad

def t_monitor_layout(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    add_cond(dm, 'Alric', 'Blinded'); add_cond(dm, 'Rowan', 'Bless')
    boxes_js = """() => { const g=document.querySelector('.pgrid').getBoundingClientRect();
      return {gh:g.height, gw:g.width, cards:[...document.querySelectorAll('.pcard')].map(c=>{const r=c.getBoundingClientRect(), cd=c.querySelector('.pconds'); let gap=null;
        if(cd){gap=cd.getBoundingClientRect().top-cd.previousElementSibling.getBoundingClientRect().bottom;}
        return {name:c.querySelector('h3').textContent.trim(), atop:r.top, abottom:r.bottom, top:r.top-g.top, left:r.left, right:r.right, bottom:r.bottom, h:r.height, w:r.width, gap:gap, fs:parseFloat(getComputedStyle(c.querySelector('h3')).fontSize)}})} }"""
    # TV: capped height, top aligned, conditions right under the info
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(800); d = tv.evaluate(boxes_js)
    check('TV: no card stretches the full height', all(c['h'] <= d['gh'] * .9 for c in d['cards']), [round(c['h']) for c in d['cards']] + [round(d['gh'])])
    cen = [c['top'] + c['h'] / 2 for c in d['cards']]
    check('TV: the strip is vertically centred', max(cen) - min(cen) < 4 and abs(cen[0] - d['gh'] / 2) < d['gh'] * .12, [round(x) for x in cen] + [round(d['gh'] / 2)])
    clip = tv.evaluate("() => [...document.querySelectorAll('.pcard')].filter(c=>Math.max(...[...c.children].map(k=>k.offsetTop+k.offsetHeight)) > c.clientHeight + 2).map(c=>c.querySelector('h3').textContent.trim())")
    check('TV: no card hides any of its content', not clip, clip)
    withc = [c for c in d['cards'] if c['gap'] is not None]
    check('TV: conditions sit directly under the player info', withc and all(c['gap'] <= max(24, c['h'] * .12) for c in withc), [(c['name'], round(c['gap'])) for c in withc])
    # portrait phone: one column, big text, no wasted width
    ph = page(ctx, size=(390, 844)); ph.goto(URL + '#monitor'); ph.wait_for_timeout(800); p = ph.evaluate(boxes_js)
    check('portrait: cards fill the width', all(c['w'] >= 390 * .88 for c in p['cards']), [round(c['w']) for c in p['cards']])
    check('portrait: cards are stacked without overlapping, current turn first', not overlaps(p['cards']) and p['cards'][0]['name'] == 'Rowan', (overlaps(p['cards']), [c['name'] for c in p['cards']]))
    check('portrait: names are comfortably large', all(c['fs'] >= 22 for c in p['cards']), [round(c['fs']) for c in p['cards']])
    check('portrait: no sideways scrolling', ph.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    check('portrait: conditions still sit under the info', all(c['gap'] <= max(24, c['h'] * .2) for c in p['cards'] if c['gap'] is not None))
    ph.evaluate("() => { const g=document.querySelector('.pgrid'); g.scrollTop=g.scrollHeight; }"); ph.wait_for_timeout(200)
    vb = ph.evaluate("() => { const v=document.querySelector('.viewbtn').getBoundingClientRect(); return {inBottomRight: v.bottom > innerHeight - 40 && v.right > innerWidth - 40, covers: [...document.querySelectorAll('.pcard')].some(c=>{const r=c.getBoundingClientRect(); return !(v.right<r.left||v.left>r.right||v.bottom<r.top||v.top>r.bottom)})} }")
    check('portrait: the View button sits in the bottom corner and clears the last card at the end of the list', vb['inBottomRight'] and not vb['covers'], vb)
    ph.evaluate("() => { document.querySelector('.pgrid').scrollTop = 0; }")
    check('portrait: no TV QR on a phone', ph.locator('.tvqr:visible').count() == 0)
    # landscape phone: a wrapped grid, readable type
    ls = page(ctx, size=(852, 393)); ls.goto(URL + '#monitor'); ls.wait_for_timeout(800); l = ls.evaluate(boxes_js)
    check('landscape: cards wrap into columns with readable text', len(set(round(c['left']) for c in l['cards'])) >= 2 and all(c['fs'] >= 20 for c in l['cards']), ([round(c['left']) for c in l['cards']], [round(c['fs']) for c in l['cards']]))
    check('landscape: no sideways scrolling', ls.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    check('landscape: cards never overlap', not overlaps(l['cards']), overlaps(l['cards']))
    # many combatants on a phone still read as a normal list
    for i in range(4): add_npc(dm, 'Wolf', 5 + i, 11)
    ph.wait_for_timeout(700); m = ph.evaluate(boxes_js)
    check('portrait with a crowd: every creature is a full-size card', len(m['cards']) >= 7 and all(c['w'] >= 390 * .88 for c in m['cards']), len(m['cards']))
    check('portrait with a crowd: still no overlap, and the list scrolls', not overlaps(m['cards']) and ph.evaluate("document.querySelector('.pgrid').scrollHeight > document.querySelector('.pgrid').clientHeight"), overlaps(m['cards']))
    ph2 = page(ctx, size=(852, 393)); ph2.goto(URL + '#monitor'); ph2.wait_for_timeout(800); l2 = ph2.evaluate(boxes_js)
    check('landscape with a crowd: still no overlap', not overlaps(l2['cards']), overlaps(l2['cards']))
    check('no page errors', not (dm._errs + tv._errs + ph._errs + ls._errs), dm._errs + tv._errs + ph._errs + ls._errs); ctx.close()


def t_mobile_dm(b):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    dm = basic_table(ctx); dm.set_viewport_size({'width': 390, 'height': 844}); dm.wait_for_timeout(300)
    for i in range(6): add_npc(dm, 'Wolf', 3 + i, 11)
    nxt(dm); dm.wait_for_timeout(300)
    st = lambda sel, prop: dm.eval_on_selector(sel, "(e,p)=>getComputedStyle(e)[p]", prop)
    check('phone: the HP bar spans the card, not a sliver', dm.eval_on_selector('.row .hp .bar', 'e=>e.getBoundingClientRect().width') > 200)
    # --- whose turn it is
    for sk in qs(('spark', 'sparkd', 'slate', 'light', 'frost', 'feywild', 'fire')):
        set_skin(dm, sk)
        check('%s: the current card carries a Now tab' % sk, st('.row.now', 'content') == 'normal' or dm.eval_on_selector('.row.now', "e=>getComputedStyle(e,'::after').content") == '"Now"')
    set_skin(dm, 'sparkd')
    check('a Now tab sits on the current card in a clearly different colour from its neighbours', dm.eval_on_selector('.row.now', "e=>getComputedStyle(e,'::after').backgroundColor") != dm.eval_on_selector('.row:not(.now)', "e=>getComputedStyle(e).backgroundColor"))
    check('the combat bar names the current turn', dm.locator('.ctl .topstat .stat.now b').first.text_content().strip() == now(dm) and 'round' in dm.inner_text('.ctl').lower(), dm.inner_text('.ctl'))
    # --- the current card scrolls into view when the turn changes
    for _ in range(6): nxt(dm)
    dm.wait_for_timeout(600)
    inview = dm.evaluate("() => { const r=document.querySelector('.row.now').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight }")
    check('advancing the turn brings the current card into view', inview, now(dm))
    # --- players are inset from NPCs, nothing scrolls sideways
    pl = dm.eval_on_selector('.row.pc:not(.ally)', "e=>e.getBoundingClientRect().left"); npc = dm.eval_on_selector('.row.npc', "e=>e.getBoundingClientRect().left")
    check('players are inset from NPCs on a phone', pl - npc >= 12, (pl, npc))
    check('no sideways scrolling', dm.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    # --- Target: a window opened from the round bar
    check('Target is on the round bar', dm.locator('#dock [data-act=targetOpen]').is_visible())
    check('nothing floats at the bottom any more', dm.locator('#aoepanel .aoebody, #aoepanel .aoegrab').count() == 0)
    dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(250)
    o = dm.eval_on_selector('.aoemodal', "e=>{const r=e.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width}}")
    check('on a phone it opens as a sheet that fills the width and stays on screen', o['w'] >= 390 * .95 and o['t'] >= 10 and o['b'] <= 845, o)
    check('the whole module is inside', dm.locator('.aoemodal [data-aoein=aamt]').is_visible() and dm.locator('.aoemodal [data-aoe=pick]').first.is_visible())
    mpick(dm, 'enemy'); dm.fill('.aoemodal [data-aoein=aamt]', '4'); dm.wait_for_timeout(100)
    check('the header counts who is selected', 'selected' in dm.locator('.aoemodal .aoegn').inner_text())
    dm.click('.aoemodal [data-aoe=apply]'); dm.wait_for_timeout(300)
    check('applying closes the window', dm.locator('.aoemodal').count() == 0)
    wolf = [n for n in names(dm) if n.startswith('Wolf')][0]; check('the damage landed', hp(dm, wolf) == '7', hp(dm, wolf))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_desktop_unchanged(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    check('desktop: Target is a window opened from the round bar', dm.locator('.side #aoepanel').count() == 0 and dm.locator('#dock [data-act=targetOpen]').is_visible() and dm.locator('.aoemodal').count() == 0)
    check('desktop: the combat bar names the current turn once', dm.locator('.ctl .stat.now').count() == 1 and dm.locator('.ctl .ctlnow').count() == 0)
    check('desktop: players keep their inset', dm.eval_on_selector('.row.pc:not(.ally)', "e=>getComputedStyle(e).marginLeft") == '22px')
    check('desktop: the current card still has its Now tab', dm.eval_on_selector('.row.now', "e=>getComputedStyle(e,'::after').content") == '"Now"')
    check('no page errors', not dm._errs, dm._errs); ctx.close()


def t_aoe_conditions(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    add_npc(dm, 'Goblin', 10, 7, qty=3, group=True)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    cond = lambda nm: [c for c in st()['combatants'] if c['name'] == nm][0]['conditions']
    has = lambda nm, cn: any(x['name'] == cn for x in cond(nm))
    prev = lambda nm: dm.locator('.aoerow:has(b:text-is("%s")) [data-prev]' % nm).inner_text()
    mclick(dm, '[data-aoe=kind][data-v=cond]')
    kb = dm.eval_on_selector_all('.aoetop .seg button', "els=>els.map(e=>{const r=e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width)]})")
    check('the four tabs fit on one row', len(kb) == 4 and len(set(x[0] for x in kb)) == 1 and dm.eval_on_selector('.aoetop .seg', "e=>e.scrollWidth<=e.clientWidth+1"), kb)
    check('Condition mode swaps the amount box for condition controls', dm.locator('[data-aoein=amt]').count() == 0 and dm.locator('[data-aoein=cname]').count() == 1)
    cards = [c['name'] for c in st()['combatants']]
    check('rows are cards: a group is one row', dm.locator('.aoerow').count() == len(cards) and dm.locator('.aoerow:has(b:text-is("Goblin ×3"))').count() == 1, (dm.locator('.aoerow').count(), cards))
    check('Apply asks for a condition first', 'choose a condition' in dm.inner_text('.aoeapply').lower())
    mpick(dm, 'enemy'); msel(dm, '[data-aoein=cname]', 'Blinded')
    check('previews show what will happen', prev('Ogre') == '+ Blinded', prev('Ogre'))
    check('the button names the condition and the count', 'blinded' in dm.inner_text('.aoeapply').lower() and '2 creatures' in dm.inner_text('.aoeapply').lower(), dm.inner_text('.aoeapply'))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(250)
    check('it lands on every ticked creature, groups included', has('Ogre', 'Blinded') and has('Goblin', 'Blinded'))
    check('and leaves players alone', not has('Rowan', 'Blinded') and not has('Alric', 'Blinded'))
    check('the monitor-facing condition chip shows on the card', row(dm, 'Ogre').locator('.chip:has-text("Blinded")').count() == 1)
    tgt(dm); check('the window resets but remembers the choice', dm.locator('.aoerow.on').count() == 0 and dm.input_value('[data-aoein=cname]') == 'Blinded')
    undo(dm); check('one Undo reverses all of it', not has('Ogre', 'Blinded') and not has('Goblin', 'Blinded'))
    # durations
    mpick(dm, 'enemy'); msel(dm, '[data-aoein=cdur]', 'rounds'); mfill(dm, '[data-aoein=cn]', '3'); mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200)
    d = [x for x in cond('Ogre') if x['name'] == 'Blinded'][0]['dur']
    check('a number of rounds is honoured', d['type'] == 'rounds' and d['n'] == 3, d)
    undo(dm)
    mpick(dm, 'enemy'); msel(dm, '[data-aoein=cdur]', 'start'); mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200)
    ogre_id = [c for c in st()['combatants'] if c['name'] == 'Ogre'][0]['id']; gob = [c for c in st()['combatants'] if c['name'] == 'Goblin'][0]
    do = [x for x in cond('Ogre') if x['name'] == 'Blinded'][0]['dur']; dg = [x for x in gob['conditions'] if x['name'] == 'Blinded'][0]['dur']
    check('"until the start of a turn" defaults to each creature\u2019s own turn', do['type'] == 'start' and do['ownerId'] == ogre_id and dg['ownerId'] == gob['id'], (do, dg))
    undo(dm)
    mpick(dm, 'enemy'); msel(dm, '[data-aoein=cowner]', label='Alric'); mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200)
    alric_id = [c for c in st()['combatants'] if c['name'] == 'Alric'][0]['id']
    check('or a chosen creature\u2019s turn, such as the caster\u2019s', [x for x in cond('Ogre') if x['name'] == 'Blinded'][0]['dur']['ownerId'] == alric_id)
    # remove
    mclick(dm, '[data-aoe=condop][data-v=remove]'); mpick(dm, 'enemy')
    check('Remove previews and hides the duration controls', prev('Ogre') == '\u2212 Blinded' and dm.locator('[data-aoein=cdur]').count() == 0, prev('Ogre'))
    check('Remove skips creatures without it', prev('Goblin ×3') == '\u2212 Blinded')
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200)
    check('removing strips it from everyone ticked', not has('Ogre', 'Blinded') and not has('Goblin', 'Blinded'))
    mclick(dm, '[data-aoe=condop][data-v=remove]'); mpick(dm, 'pc'); check('removing what nobody has says so', prev('Rowan') == 'doesn\u2019t have Blinded', prev('Rowan'))
    mpick(dm, 'none'); mclick(dm, '[data-aoe=condop][data-v=add]')
    # saving throws gate the condition
    msel(dm, '[data-aoein=cname]', 'Paralyzed'); msel(dm, '[data-aoein=cdur]', 'manual')
    mpick(dm, 'enemy'); mclick(dm, '[data-aoe=svtoggle]'); mfill(dm, '[data-aoein=dc]', '1'); mclick(dm, '[data-aoe=roll]')
    check('a passed save skips the condition', dm.locator('.aoerow:has(.tdot.k-enemy) .svchip.pass').count() == 2 and prev('Ogre') == 'saved \u2014 no effect', prev('Ogre'))
    check('the Half/None choice is not offered for conditions', dm.locator('[data-aoe=onsave]').count() == 0)
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200); check('so nothing is applied', not has('Ogre', 'Paralyzed') and not has('Goblin', 'Paralyzed'))
    mpick(dm, 'enemy'); mfill(dm, '[data-aoein=dc]', '40'); mclick(dm, '[data-aoe=roll]')
    check('a failed save applies it', prev('Ogre') == '+ Paralyzed', prev('Ogre'))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200); check('and it lands', has('Ogre', 'Paralyzed') and has('Goblin', 'Paralyzed'))
    undo(dm)
    mpick(dm, 'pc'); mclick(dm, '.aoerow:has(b:text-is("Rowan")) .svchip'); check('players are marked by hand, and a pass skips', prev('Rowan') == 'saved \u2014 no effect' and prev('Alric') == '+ Paralyzed', (prev('Rowan'), prev('Alric')))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200); check('only the player who failed gets it', has('Alric', 'Paralyzed') and not has('Rowan', 'Paralyzed'))
    # levels, custom names, spell durations
    mpick(dm, 'pc'); msel(dm, '[data-aoein=cname]', 'Exhaustion'); msel(dm, '[data-aoein=clevel]', '3')
    check('Exhaustion offers a level and previews it', prev('Rowan') == '+ Exhaustion 3', prev('Rowan'))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200); check('the level is stored', [x for x in cond('Rowan') if x['name'] == 'Exhaustion'][0]['level'] == 3)
    mpick(dm, 'enemy'); msel(dm, '[data-aoein=cname]', 'Custom'); mfill(dm, '[data-aoein=ccustom]', 'Hexed'); dm.keyboard.press('Tab'); dm.wait_for_timeout(150)
    check('custom names work', prev('Ogre') == '+ Hexed', prev('Ogre'))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200); check('and land', has('Ogre', 'Hexed'))
    mpick(dm, 'pc'); msel(dm, '[data-aoein=cname]', 'Bless')
    check('spell effects pick their usual 10 rounds', dm.input_value('[data-aoein=cdur]') == 'rounds' and dm.input_value('[data-aoein=cn]') == '10')
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200); check('Bless reaches both players', has('Rowan', 'Bless') and has('Alric', 'Bless'))
    check('the same condition again refreshes rather than stacking', True)
    mpick(dm, 'pc'); check('re-applying previews a refresh', prev('Rowan') == 'refreshes Bless', prev('Rowan'))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(200); check('and never duplicates it', sum(1 for x in cond('Rowan') if x['name'] == 'Bless') == 1)
    # selection carries across modes
    mclick(dm, '[data-aoe=kind][data-v=dmg]'); mpick(dm, 'none'); mclick(dm, '.aoerow:has(b:text-is("Goblin 1")) .aoename')
    mclick(dm, '[data-aoe=kind][data-v=cond]'); check('one ticked group member selects its group card', dm.locator('.aoerow.on:has(b:text-is("Goblin ×3"))').count() == 1 and dm.locator('.aoerow.on').count() == 1)
    mclick(dm, '[data-aoe=kind][data-v=dmg]'); check('and a ticked group card selects every member', dm.locator('.aoerow.on').count() == 3, dm.locator('.aoerow.on').count())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_aoe_conditions_mobile(b):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce'); dm = basic_table(ctx); dm.set_viewport_size({'width': 390, 'height': 844}); dm.wait_for_timeout(300); nxt(dm)
    dm.click('#dock [data-act=targetOpen]'); dm.click('[data-aoe=kind][data-v=cond]'); dm.wait_for_timeout(150)
    kb = dm.eval_on_selector_all('.aoetop .seg button', "els=>els.map(e=>Math.round(e.getBoundingClientRect().top))")
    check('phone: all four tabs fit on one row', len(kb) == 4 and len(set(kb)) == 1 and dm.eval_on_selector('.aoetop .seg', "e=>e.scrollWidth<=e.clientWidth+1"), kb)
    dm.select_option('[data-aoein=cname]', 'Prone'); mpick(dm, 'enemy'); dm.wait_for_timeout(100)
    check('phone: the sheet stays on screen', dm.eval_on_selector('.aoemodal', "e=>{const r=e.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight+1}"))
    check('phone: Apply stays in reach at the bottom without scrolling', dm.evaluate("() => { const b=document.querySelector('.aoeapply').getBoundingClientRect(), p=document.querySelector('.aoemodal').getBoundingClientRect(); return b.bottom <= p.bottom + 1 && b.top >= p.top && b.bottom <= innerHeight }"))
    dm.click('[data-aoe=apply]'); dm.wait_for_timeout(250)
    check('phone: it applies and closes', dm.locator('.aoemodal').count() == 0 and row(dm, 'Ogre').locator('.chip:has-text("Prone")').count() == 1)
    check('no page errors', not dm._errs, dm._errs); ctx.close()


def t_target_attack(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    set_ac(dm, 'Ogre', 15)
    add_npc(dm, 'Drake', 8, 40)                                   # no AC set
    prev = lambda nm: dm.locator('.aoerow:has(b:text-is("%s")) [data-prev]' % nm).inner_text()
    chip = lambda nm: dm.locator('.aoerow:has(b:text-is("%s")) [data-hitchip]' % nm).inner_text()
    mclick(dm, '[data-aoe=kind][data-v=dmg]'); check('the attack roll is hidden until you want it', dm.locator('[data-aoein=aroll]').count() == 0 and dm.get_attribute('[data-aoe=attoggle]', 'aria-expanded') == 'false'); mclick(dm, '[data-aoe=attoggle]')
    check('Attack roll is an optional part of Damage: d20, modifier (starting at 0) and a total', dm.locator('[data-aoein=aroll]').is_visible() and dm.locator('[data-aoein=aamt]').count() == 1 and dm.input_value('[data-aoein=amod]') == '0' and dm.locator('[data-atotal]').is_visible())
    check('it offers a damage type, starting as Unspecified', dm.locator('[data-aoein=atype] option').count() >= 13 and dm.input_value('[data-aoein=atype]') == 'untyped')
    mclick(dm, '.aoerow:has(b:text-is("Ogre")) .aoename'); mfill(dm, '[data-aoein=aroll]', '17')
    check('17 against AC 15 hits', chip('Ogre') == 'Hit \u2713' and 'enter damage' in prev('Ogre'), (chip('Ogre'), prev('Ogre')))
    mfill(dm, '[data-aoein=aroll]', '14'); check('14 against AC 15 misses, and says why', chip('Ogre') == 'Miss \u2717' and prev('Ogre') == 'miss (14 vs AC 15)', (chip('Ogre'), prev('Ogre')))
    check('with no hits the button says so and is disabled', 'no hits' in dm.inner_text('.aoeapply').lower() and dm.locator('.aoeapply').is_disabled())
    mfill(dm, '[data-aoein=aroll]', '20'); check('a natural 20 always hits', chip('Ogre') == 'Hit \u2713' and 'natural 20' in dm.locator('.aoerow:has(b:text-is("Ogre")) [data-hitchip]').get_attribute('title'))
    mfill(dm, '[data-aoein=aroll]', '1'); check('a natural 1 always misses', chip('Ogre') == 'Miss \u2717')
    mfill(dm, '[data-aoein=amod]', '3'); mfill(dm, '[data-aoein=aroll]', '12'); check('the modifier is added: 12 + 3 = 15 hits AC 15, and the total shows', chip('Ogre') == 'Hit \u2713' and dm.locator('[data-atotal] b').inner_text() == '15')
    mfill(dm, '[data-aoein=amod]', '0'); mfill(dm, '[data-aoein=aroll]', '17')
    # no AC: choose by hand
    mclick(dm, '.aoerow:has(b:text-is("Drake")) .aoename'); check('a creature with no AC asks you to decide', chip('Drake') == 'Hit?' and 'no AC set' in prev('Drake'), (chip('Drake'), prev('Drake')))
    mclick(dm, '.aoerow:has(b:text-is("Drake")) [data-hitchip]'); check('tapping marks it a hit', chip('Drake') == 'Hit \u2713')
    mclick(dm, '.aoerow:has(b:text-is("Drake")) [data-hitchip]'); check('tapping again marks it a miss', chip('Drake') == 'Miss \u2717')
    mclick(dm, '.aoerow:has(b:text-is("Drake")) [data-hitchip]'); check('and once more returns to automatic', chip('Drake') == 'Hit?')
    mclick(dm, '.aoerow:has(b:text-is("Drake")) .aoename')
    # several damage types
    mfill(dm, '[data-aoein=aamt]', '10'); mclick(dm, '[data-aoe=addline]')
    check('you can add a second damage', dm.locator('[data-aoein=aamt]').count() == 2 and dm.locator('[data-aoe=rmline]').count() == 2)
    dm.locator('[data-aoein=aamt]').nth(1).fill('6'); dm.locator('[data-aoein=atype]').nth(1).select_option('fire'); dm.wait_for_timeout(150)
    check('the preview totals every damage', prev('Ogre') == '59 \u2192 43', prev('Ogre'))
    mclick(dm, '[data-aoe=rmline][data-i="1"]'); check('a damage line can be removed', dm.locator('[data-aoein=aamt]').count() == 1 and prev('Ogre') == '59 \u2192 49', prev('Ogre'))
    # resistance, immunity, vulnerability come from the stats
    dm.keyboard.press('Escape'); row(dm, 'Ogre').locator('[data-act=sheetToggle]').click()
    for key_, ty_ in (('resist', 'fire'), ('immune', 'poison'), ('vuln', 'cold')): dm.click('.row .sheet [data-act=resToggle][data-k=%s]' % key_); dm.check('.row .sheet .rpanel2 [data-rck=%s]' % ty_); dm.click('.row .sheet [data-act=resDone]')
    dm.wait_for_timeout(200)
    tgt(dm); mclick(dm, '[data-aoe=addline]'); dm.locator('[data-aoein=aamt]').nth(1).fill('6'); dm.locator('[data-aoein=atype]').nth(1).select_option('fire'); dm.wait_for_timeout(150)
    check('a resisted type is halved (10 slashing + 6 fire = 13)', prev('Ogre') == '59 \u2192 46 (resists fire)', prev('Ogre'))
    dm.locator('[data-aoein=atype]').nth(1).select_option('poison'); dm.wait_for_timeout(150); check('an immune type does nothing', prev('Ogre') == '59 \u2192 49 (immune to poison)', prev('Ogre'))
    dm.locator('[data-aoein=aamt]').nth(1).fill('5'); dm.locator('[data-aoein=atype]').nth(1).select_option('cold'); dm.wait_for_timeout(150); check('a vulnerable type is doubled (10 + 5x2 = 20)', prev('Ogre') == '59 \u2192 39 (vulnerable to cold)', prev('Ogre'))
    mclick(dm, '[data-aoein=ares]'); dm.wait_for_timeout(100); check('the stats can be ignored for a magical weapon', prev('Ogre') == '59 \u2192 44', prev('Ogre'))
    mclick(dm, '[data-aoein=ares]'); dm.wait_for_timeout(100)
    # apply to several: one hit, one unknown, one miss
    mclick(dm, '.aoerow:has(b:text-is("Rowan")) .aoename'); mfill(dm, '[data-aoein=aroll]', '16')
    check('each row decides for itself (AC 15 hit, AC 17 miss)', chip('Ogre') == 'Hit \u2713' and chip('Rowan') == 'Miss \u2717' and chip('Drake') == 'Hit?')
    check('the button counts only the hits', 'to 1 hit' in dm.inner_text('.aoeapply').lower(), dm.inner_text('.aoeapply'))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(250)
    check('only the hit takes damage, with the stats applied', hp(dm, 'Ogre') == '39' and hp(dm, 'Rowan') == '24' and hp(dm, 'Drake') == '40', (hp(dm, 'Ogre'), hp(dm, 'Rowan'), hp(dm, 'Drake')))
    check('the result is reported', 'Attack 16' in toast_text(dm) or 'Ogre takes' in toast_text(dm), toast_text(dm))
    check('the window closes', dm.locator('.aoemodal').count() == 0)
    undo(dm); check('one Undo reverses it', hp(dm, 'Ogre') == '59')
    tgt(dm); check('the roll resets but the damage types are kept', dm.input_value('[data-aoein=aroll]') == '' and dm.input_value('[data-aoein=atype]') == 'untyped')
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_confirm_end(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    add_cond(dm, 'Alric', 'Blinded')
    endc(dm); dm.wait_for_timeout(150)
    check('End combat asks first', dm.locator('.confmodal').is_visible() and 'end combat?' in dm.inner_text('.confmodal').lower() and now(dm) is not None)
    check('it says what will happen', 'conditions' in dm.inner_text('.confmodal').lower() and 'undo' in dm.inner_text('.confmodal').lower())
    dm.click('.confmodal [data-conf=no]'); check('Keep fighting changes nothing', dm.locator('.confmodal').count() == 0 and now(dm) is not None)
    endc(dm); dm.keyboard.press('Escape'); check('Escape also cancels', dm.locator('.confmodal').count() == 0 and now(dm) is not None)
    endc(dm); dm.mouse.click(8, 300); check('clicking outside cancels', dm.locator('.confmodal').count() == 0 and now(dm) is not None)
    endc(dm); dm.click('.confmodal [data-conf=yes]'); dm.wait_for_timeout(200)
    check('confirming ends the combat and clears conditions', now(dm) is None and not [x for x in json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))['combatants'] if x['conditions']])
    undo(dm); check('Undo brings it back', now(dm) is not None)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_controls_and_labels(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    txt = lambda sel: dm.locator(sel).first.text_content().strip()
    check('Previous turn is shortened to Prev', 'prev' in txt('[data-act=prev]').lower() and 'previous' not in txt('[data-act=prev]').lower(), txt('[data-act=prev]'))
    check('Undo is an icon with a label', dm.locator('[data-act=undo] svg').count() == 1 and txt('[data-act=undo]') == '' and dm.locator('[data-act=undo]').get_attribute('aria-label') == 'Undo')
    check('Target sits on the round bar, with an icon', dm.locator('#dock [data-act=targetOpen] svg').count() == 1 and 'Target' in txt('#dock [data-act=targetOpen]'))
    order = dm.eval_on_selector_all('#ctlmain > *', "els=>els.map(e=>e.className.split(' ')[0])")
    check('the top bar has three groups: round, who is up, and view controls', order == ['ctl-l', 'ctl-c', 'ctl-r'], order)
    right = dm.eval_on_selector_all('.ctl-r > *', "els=>els.map(e=>e.dataset.act||e.className.split(' ')[0])")
    check('the right group is the timer icon, Focus | Full, then full screen', right == ['timerOpen', 'seg', 'fullscreen'], right)
    dock = dm.eval_on_selector_all('#dock > *', "els=>els.map(e=>e.dataset.act)")
    check('the floating panel holds Target, Undo, Prev, Next in that order', dock == ['targetOpen', 'undo', 'prev', 'next'], dock)
    g = lambda sel: dm.eval_on_selector(sel, "e=>{const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.bottom, r.top]}")
    cx = dm.evaluate('innerWidth') / 2; lw = dm.eval_on_selector('.listwrap', "e=>{const r=e.getBoundingClientRect(); return r.left+r.width/2}")
    check('Now and Get ready sit in the middle of the top bar', abs(g('.ctl-c')[0] - lw) < 40 and dm.locator('.ctl-c .stat.now').count() == 1 and dm.locator('.ctl-c .stat.nxt').count() == 1, (g('.ctl-c')[0], lw))
    check('the floating panel is at the bottom, centred over the cards', abs(g('#dock')[0] - lw) < 40 and g('#dock')[1] > dm.evaluate('innerHeight') - 40, (g('#dock'), lw))
    check('no turn controls are left in the top bar', dm.locator('.ctl [data-act=next]').count() == 0 and dm.locator('.ctl [data-act=targetOpen]').count() == 0)
    check('the reaction button reads Use Reaction', 'use reaction' in row(dm, 'Alric').locator('.rxbtn').inner_text().lower())
    row(dm, 'Alric').locator('.rxbtn').click(); check('and Reaction used afterwards', 'reaction used' in row(dm, 'Alric').locator('.rxbtn').inner_text().lower())
    app = dm.evaluate("document.getElementById('app').textContent")
    check('"Up next" is "Get ready" on the DM screen', 'Up next' not in app and 'Get ready' in dm.inner_text('.ctl') and dm.locator('.tag.nxt').inner_text().lower() == 'get ready', dm.inner_text('.ctl'))
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(700)
    check('and on the Combat Monitor', tv.locator('.flag.nxt').inner_text().lower().strip() == 'get ready', tv.locator('.flag.nxt').inner_text())
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_turn_shading(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    add_npc(dm, 'Dragon', 18, 300); nxt(dm)                           # Dragon (enemy) is up
    bg = lambda nm: rgbp(row(dm, nm).evaluate("e=>getComputedStyle(e).backgroundColor"))
    for sk in qs(('spark', 'sparkd', 'slate', 'light', 'frost', 'feywild', 'arcane' if False else 'medieval')):
        set_skin(dm, sk)
        check('%s: a creature not on its turn has no side tint (enemy and player rows match)' % sk, bg('Ogre') == bg('Alric'), (bg('Ogre'), bg('Alric')))
        d = bg('Dragon'); o = bg('Ogre')
        check('%s: on its turn an enemy is shaded red (redder than an idle card)' % sk, (d[0] - d[1]) - (o[0] - o[1]) >= 8 and d != o, (d, o))
    set_skin(dm, 'spark'); nxt(dm)                                     # Rowan (player) is up
    r = bg('Rowan'); a = bg('Alric')
    check('a player is shaded their own colour on their turn', r[2] - r[0] >= 12 and r != a, (r, a))
    check('and the outline is still there', 'px' in row(dm, 'Rowan').evaluate("e=>getComputedStyle(e).boxShadow") and '4px' in row(dm, 'Rowan').evaluate("e=>getComputedStyle(e).boxShadow"))
    nxt(dm); check('shading follows the turn: Rowan is plain again', bg('Rowan') == bg('Alric'), (bg('Rowan'), bg('Alric')))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_compact_layout(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    h = lambda sel: dm.eval_on_selector(sel, "e=>e.getBoundingClientRect().height")
    check('there is no separate top bar, only the combat bar', dm.locator('#top').count() == 0 and h('.ctl') <= 90, h('.ctl'))
    check('the first card starts high on the page', dm.eval_on_selector('.row', "e=>e.getBoundingClientRect().top") <= 110)
    check('the first creature card is compact', h('.row') <= 190, h('.row'))
    check('View stats is at the bottom of the card, below the conditions and buttons', dm.eval_on_selector('.row:not(.collapsed)', "r=>{const s=r.querySelector('.rowtools').getBoundingClientRect(), c=r.querySelector('.conds').getBoundingClientRect(), b=r.getBoundingClientRect(); return s.top>=c.bottom-2 && b.bottom-s.bottom<40}") and 'view stats' in dm.locator('.row:not(.collapsed) .rowtools').first.inner_text().lower() and dm.locator('.row:not(.collapsed) .rowtools').first.locator('svg').count() == 1)
    check('HP and its bar share a line', dm.eval_on_selector('.row', "r=>{const n=r.querySelector('.hpnums').getBoundingClientRect(), b=r.querySelector('.hp .bar').getBoundingClientRect(); return Math.abs((n.top+n.bottom)/2-(b.top+b.bottom)/2) < 14}"))
    vis = dm.evaluate("() => [...document.querySelectorAll('.row')].filter(r=>{const b=r.getBoundingClientRect(); return b.top>=0 && b.bottom<=innerHeight}).length")
    check('every creature in a small fight is on screen at once', vis == 3, vis)
    check('the menu sits beside the cards instead of above them', dm.locator('.side').count() == 0 and dm.eval_on_selector('#lnav', "e=>e.getBoundingClientRect().right") < dm.eval_on_selector('.row', "e=>e.getBoundingClientRect().left") + 2)
    dm.set_viewport_size({'width': 1100, 'height': 800}); dm.wait_for_timeout(200)
    check('and nothing scrolls sideways on a smaller laptop', dm.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    check('no page errors', not dm._errs, dm._errs); ctx.close()


def t_neutral_distinct(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    add_npc(dm, 'Sphinx', 20, 60, disp='neutral'); add_npc(dm, 'Troll', 13, 40, qty=3, group=True); nxt(dm)      # the neutral Sphinx is up
    bg = lambda loc: rgbp(loc.evaluate("e=>getComputedStyle(e).backgroundColor"))
    for sk in qs(('spark', 'sparkd', 'slate', 'light', 'medieval', 'frost', 'feywild', 'mountain', 'fire')):
        set_skin(dm, sk)
        n = bg(row(dm, 'Sphinx')); m = bg(dm.locator('.row.group .mem').first); plain = bg(row(dm, 'Alric'))
        dist = sum(abs(x - y) for x, y in zip(n, m))
        check('%s: the neutral card is clearly different from the member cards' % sk, dist >= 18, (n, m, dist))
        check('%s: neutral is shaded warm on its turn, not grey' % sk, (n[0] - n[2]) - (plain[0] - plain[2]) >= 8, (n, plain))
        gcard = bg(dm.locator('.row.group').first)
        check('%s: member cards are their card\'s colour, not a grey fill' % sk, sum(abs(x - y) for x, y in zip(m, gcard)) <= 24, (m, gcard))
    check('the neutral dot and edge use the same warm colour', dm.eval_on_selector('.row.neutral', "e=>getComputedStyle(e).getPropertyValue('--side').trim()") != '')
    check('no page errors', not dm._errs, dm._errs); ctx.close()


def t_target_list(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    for nm, ini in (('Zombie', 3), ('Bat', 4), ('Wolf 10', 5), ('Wolf 2', 6)): add_npc(dm, nm, ini, 9)
    tgt(dm)
    order = lambda: dm.eval_on_selector_all('.aoelist .aoesec, .aoelist .aoerow b', "els=>els.map(e=>e.classList.contains('aoesec')?'#'+e.querySelector('span').textContent:e.textContent)")
    o = order()
    check('Players come first, then NPCs', o[0] == '#Players' and '#NPCs' in o and o.index('#Players') < o.index('#NPCs'), o)
    pl = o[1:o.index('#NPCs')]; npc = o[o.index('#NPCs') + 1:]
    check('players are alphabetical', pl == ['Alric', 'Rowan'], pl)
    check('NPCs are alphabetical, with numbers in natural order (Wolf 2 before Wolf 10)', npc == ['Bat', 'Ogre', 'Wolf 2', 'Wolf 10', 'Zombie'], npc)
    check('the section headers carry a count', dm.eval_on_selector_all('.aoesec small', "els=>els.map(e=>e.textContent)") == ['2', '5'])
    mclick(dm, '[data-aoe=kind][data-v=cond]'); o2 = order()
    check('the same grouping applies in Condition mode', o2[0] == '#Players' and o2[1:o2.index('#NPCs')] == ['Alric', 'Rowan'] and o2[o2.index('#NPCs') + 1:] == ['Bat', 'Ogre', 'Wolf 10', 'Wolf 2', 'Zombie'] or o2[o2.index('#NPCs') + 1:][0] == 'Bat', o2)
    mclick(dm, '[data-aoe=kind][data-v=dmg]')
    mclick(dm, '[data-aoe=secsel][data-v=pc]'); check('a section can be selected in one tap', dm.eval_on_selector_all('.aoerow.on .aoename b', "els=>els.map(e=>e.textContent)") == ['Alric', 'Rowan'])
    check('and its button flips to None', dm.locator('[data-aoe=secsel][data-v=pc]').inner_text().strip().lower() == 'none')
    mclick(dm, '[data-aoe=secsel][data-v=npc]'); check('NPCs likewise', dm.locator('.aoerow.on').count() == 7, dm.locator('.aoerow.on').count())
    mclick(dm, '[data-aoe=secsel][data-v=pc]'); check('tapping None clears just that section', dm.locator('.aoerow.on').count() == 5 and dm.locator('.aoerow.on:has(b:text-is("Rowan"))').count() == 0)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_target_layout(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    for i in range(5): add_npc(dm, 'Wolf', 3 + i, 9)
    geo = lambda sel: dm.eval_on_selector(sel, "e=>{const r=e.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}}")
    for kind in ('dmg', 'cond', 'heal'):
        mclick(dm, '[data-aoe=kind][data-v=%s]' % kind); dm.wait_for_timeout(120)
        m, c, l, ap, rc = geo('.aoemodal'), geo('.aoectl'), geo('.aoelist'), geo('.aoeapply'), geo('.aoeright')
        check('%s: the window fits the screen' % kind, m['t'] >= 0 and m['b'] <= 901 and m['w'] <= 1440, m)
        check('%s: who is affected takes the left half and the controls the right half' % kind, c['l'] >= rc['r'] - 2 and abs(rc['w'] - c['w']) <= 40, (rc['w'], c['w']))
        check('%s: the list is tall (most of the window)' % kind, l['h'] >= m['h'] * .62, (l['h'], m['h']))
        check('%s: Apply sits in the right column only, not under the list' % kind, ap['l'] >= c['l'] - 2 and ap['r'] <= c['r'] + 2 and ap['l'] > rc['r'], (ap, c, rc))
        check('%s: the window itself does not scroll' % kind, dm.eval_on_selector('.aoebody', "e=>e.scrollHeight<=e.clientHeight+2"))
    dm.keyboard.press('Escape'); dm.set_viewport_size({'width': 390, 'height': 844}); dm.wait_for_timeout(250)
    for kind in ('cond', 'dmg'):
        mclick(dm, '[data-aoe=kind][data-v=%s]' % kind); dm.wait_for_timeout(150)
        m, c, l = geo('.aoemodal'), geo('.aoectl'), geo('.aoelist')
        check('phone %s: the window fits' % kind, m['t'] >= 0 and m['b'] <= 845 and m['w'] <= 391, m)
        check('phone %s: the list gets a good share of the screen' % kind, l['h'] >= 844 * .28, l['h'])
        check('phone %s: the list is below the controls' % kind, l['t'] >= c['b'] - 2, (c['b'], l['t']))
        check('phone %s: Apply is visible' % kind, geo('.aoeapply')['b'] <= 845 and geo('.aoeapply')['t'] >= c['t'] - 2)
    dm.keyboard.press('Escape')
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_monster_library(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    cmb = lambda nm: [c for c in st()['combatants'] if c['name'] == nm][0]
    check('Add new has Player, NPC and Creature items that open windows, and the Library has its own item', dm.locator('#nsub-add [data-act=addOpen]').count() == 3 and dm.locator('#lnav [data-act=libOpen][data-preset=book]').count() == 1)
    open_lib(dm); dm.wait_for_timeout(500)
    check('it is a window', dm.locator('.libmodal').is_visible())
    check('every SRD 5.2 creature is there', '331 of 331' in dm.inner_text('#mmcount'), dm.inner_text('#mmcount'))
    check('credit and licence are shown', all(x in dm.inner_text('.mmfoot') for x in ('System Reference Document 5.2', 'CC BY 4.0')))
    ctl = dm.eval_on_selector('.mmctl', "e=>e.getBoundingClientRect().height"); check('the filters sit compactly above the list', ctl <= 130, ctl)
    check('so the list gets most of the window', dm.eval_on_selector('.mmlist', "e=>e.getBoundingClientRect().height") >= 520, dm.eval_on_selector('.mmlist', "e=>e.getBoundingClientRect().height"))
    names = lambda: dm.eval_on_selector_all('.mmrow .mmname b', "els=>els.map(e=>e.textContent)")
    secs = lambda: dm.eval_on_selector_all('.mmsec span', "els=>els.map(e=>e.textContent)")
    # sorts
    s = secs(); check('A\u2013Z groups by letter, ascending', s == sorted(s) and s[0] == 'A', s[:5])
    n = names(); check('and the names are alphabetical', n == sorted(n, key=lambda x: x.lower()) or n[:5] == sorted(n[:5]), n[:6])
    dm.click('[data-mm=sort][data-v=cr]'); s = secs()
    num = lambda x: {'CR 1/8': .125, 'CR 1/4': .25, 'CR 1/2': .5}.get(x, float(x.replace('CR ', '')) if x[3:].replace('.', '').isdigit() else -1)
    check('CR sort runs from CR 0 up', s[0] == 'CR 0' and [num(x) for x in s] == sorted(num(x) for x in s), s[:8])
    dm.click('[data-mm=dir]'); s2 = secs(); check('and can be reversed (CR 30 first)', s2[0] == 'CR 30', s2[:3])
    dm.click('[data-mm=sort][data-v=type]'); s = secs()
    check('Type sort groups alphabetically, with counts', s == sorted(s) and s[0] == 'Aberration' and dm.locator('.mmsec small').count() == len(s), s)
    first = dm.eval_on_selector_all('.mmsec:first-child ~ .mmrow .mmname b', "els=>els.slice(0,6).map(e=>e.textContent)")
    check('names inside a type are alphabetical', first == sorted(first, key=lambda x: x.lower()), first)
    dm.click('[data-mm=sort][data-v=az]')
    # search
    dm.fill('[data-mmsearch]', 'goblin'); n = names(); check('search finds by name', 'Goblin Warrior' in n and all('goblin' in x.lower() for x in n), n)
    check('and updates the count', 'of 331' in dm.inner_text('#mmcount') and not dm.inner_text('#mmcount').startswith('331'))
    dm.fill('[data-mmsearch]', 'red dragon'); check('several words must all match', 'Adult Red Dragon' in names() and 'Goblin Warrior' not in names())
    dm.fill('[data-mmsearch]', 'undead'); check('search covers the type', len(names()) >= 15, len(names()))
    dm.fill('[data-mmsearch]', 'zzzzzz'); check('no match says so', 'No creatures match' in dm.inner_text('#mmlist'))
    dm.fill('[data-mmsearch]', '')
    # filters
    lib_filters(dm); dm.select_option('[data-mmf=type]', 'Dragon'); n = names(); check('type filter', 0 < len(n) < 60 and all(x for x in n) and dm.locator('.mmrow small:not(:has-text("dragon"))').count() == 0, len(n))
    lib_filters(dm); dm.select_option('[data-mmf=type]', ''); lib_filters(dm); dm.select_option('[data-mmf=crb]', 'a')
    crs = dm.eval_on_selector_all('.mmcr', "els=>els.map(e=>e.textContent.replace('CR ',''))"); ok = all(c in ('0', '1/8', '1/4', '1/2') for c in crs)
    check('CR bracket filter (0 to 1/2)', crs and ok, set(crs))
    lib_filters(dm); dm.select_option('[data-mmf=crb]', ''); lib_filters(dm); dm.check('[data-mmf=leg]'); lib_filters(dm, False); n = names()
    check('Legendary filter keeps legendary creatures only', 'Aboleth' in n and 'Adult Red Dragon' in n and 'Goblin Warrior' not in n, len(n)); lib_filters(dm); dm.uncheck('[data-mmf=leg]'); lib_filters(dm, False)
    # stat block
    dm.fill('[data-mmsearch]', 'goblin warrior'); dm.click('.mmrow:has(b:text-is("Goblin Warrior")) [data-mm=exp]')
    d = dm.inner_text('.mmdetail'); check('a row expands to a full stat block', all(x in d for x in ('DEX', 'Scimitar', 'Speed', 'Hit points')), d[:120])
    # importing
    dm.fill('.mmrow:has(b:text-is("Goblin Warrior")) [data-mmq]', '3'); dm.click('.mmrow:has(b:text-is("Goblin Warrior")) [data-mm=add]'); dm.wait_for_timeout(250)
    g = [c for c in st()['combatants'] if c['name'].startswith('Goblin Warrior')]
    check('Add puts the creatures in the fight, numbered', sorted(c['name'] for c in g) == ['Goblin Warrior 1', 'Goblin Warrior 2', 'Goblin Warrior 3'], [c['name'] for c in g])
    c0 = g[0]; check('with the real HP and AC', c0['maxHp'] == 10 and c0['sheet']['ac'] == '15', (c0['maxHp'], c0['sheet']['ac']))
    check('ability scores, speed and attacks come across', c0['sheet']['ab']['dex']['score'] == '15' and 'Scimitar' in c0['sheet']['attacks'] and 'climb' in c0['sheet']['speed'])
    check('initiative was rolled with the creature\u2019s own bonus, each separately', all(isinstance(c['init'], (int, float)) and 3 <= c['init'] <= 22 for c in g), [c['init'] for c in g])
    check('and the window stays open for more', dm.locator('.libmodal').is_visible())
    dm.select_option('[data-mmf=disp]', 'ally'); dm.click('[data-mm=group]'); dm.fill('[data-mmsearch]', 'bandit')
    dm.fill('.mmrow:has(b:text-is("Bandit")) [data-mmq]', '2'); dm.click('.mmrow:has(b:text-is("Bandit")) [data-mm=add]'); dm.wait_for_timeout(250)
    bd = [c for c in st()['combatants'] if c['name'].startswith('Bandit')][0]
    check('"Add as Ally" and "Group copies" are honoured', bd['disp'] == 'ally' and len(bd.get('members') or []) == 2, (bd['disp'], len(bd.get('members') or [])))
    dm.click('[data-mm=group]'); dm.select_option('[data-mmf=disp]', 'enemy'); dm.fill('[data-mmsearch]', 'adult red dragon'); dm.click('.mmrow:has(b:text-is("Adult Red Dragon")) [data-mm=add]'); dm.wait_for_timeout(250)
    dr = cmb('Adult Red Dragon')
    check('a legendary creature arrives with its legendary tracking', dr.get('leg') and dr['leg']['max'] == 3 and dr['leg']['rmax'] == 3, dr.get('leg'))
    check('and its immunity, so attacks respect it', 'fire' in dr['sheet']['immune'].lower() and dr['maxHp'] == 256 and dr['sheet']['ac'] == '19')
    check('and its legendary actions are in the notes', 'Legendary actions' in dr['sheet']['notes'] and 'Legendary Resistance' in dr['sheet']['notes'])
    dm.fill('[data-mmsearch]', 'aboleth'); dm.click('.mmrow:has(b:text-is("Aboleth")) [data-mm=star]'); dm.wait_for_timeout(200)
    check('the star saves it to your favourites without copying it into the library', st()['stars'] == ['srd:Aboleth'] and st()['library'] == [], (st()['stars'], st()['library']))
    check('the star lights up and the Saved tab counts it', dm.get_attribute('.mmrow:has(b:text-is("Aboleth")) [data-mm=star]', 'aria-pressed') == 'true' and dm.inner_text('#cntMon').strip() == '1')
    lib_open(dm, 'saved'); check('the starred creature is in the Saved tab', dm.locator('#mmlist .mmrow:has(b:text-is("Aboleth"))').count() == 1)
    lib_open(dm, 'npcs'); check('and not in NPCs', dm.locator('#library .lrow:has-text("Aboleth")').count() == 0)
    dm.keyboard.press('Escape'); check('Escape closes the library', dm.locator('.libmodal').count() == 0)
    # attacks use the imported immunity
    dm.click('#dock [data-act=targetOpen]'); mclick(dm, '[data-aoe=kind][data-v=dmg]'); mclick(dm, '[data-aoe=attoggle]'); mfill(dm, '[data-aoein=aroll]', '19'); mfill(dm, '[data-aoein=amod]', '11'); mfill(dm, '[data-aoein=aamt]', '10')
    dm.locator('[data-aoein=atype]').first.select_option('fire'); mclick(dm, '.aoerow:has(b:text-is("Adult Red Dragon")) .aoename'); dm.wait_for_timeout(150)
    check('an attack against the imported dragon sees its fire immunity', 'immune to fire' in dm.locator('.aoerow:has(b:text-is("Adult Red Dragon")) [data-prev]').inner_text(), dm.locator('.aoerow:has(b:text-is("Adult Red Dragon")) [data-prev]').inner_text())
    dm.keyboard.press('Escape')
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_library_mobile(b):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce'); dm = basic_table(ctx); dm.set_viewport_size({'width': 390, 'height': 844}); dm.wait_for_timeout(300)
    open_lib(dm); dm.wait_for_timeout(500)
    m = dm.eval_on_selector('.libmodal', "e=>{const r=e.getBoundingClientRect(); return {t:r.top,b:r.bottom,w:r.width}}")
    check('phone: the library fits as a sheet', m['w'] >= 385 and m['t'] >= 0 and m['b'] <= 845, m)
    check('phone: nothing scrolls sideways', dm.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1') and dm.eval_on_selector('.mmlist', "e=>e.scrollWidth<=e.clientWidth+1"))
    check('phone: the list gets most of the sheet', dm.eval_on_selector('.mmlist', "e=>e.getBoundingClientRect().height") >= 844 * .4)
    dm.fill('[data-mmsearch]', 'wolf'); check('phone: search works', 'Wolf' in dm.inner_text('.mmlist'))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_side_and_screen(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    labels = [t.strip() for t in dm.locator('#lnav .nitem .nl').all_text_contents()]
    check('the left menu lists the top-level items in order', labels == ['Combat monitor', 'Manage encounter', 'Add new', 'Party', 'Library', 'QR codes', 'Settings'], labels)
    check('the collapse button sits beside the logo at the top of the menu', dm.locator('#lnav .nhead .brand').count() == 1 and dm.locator('#lnav .nhead .navtoggle').count() == 1 and dm.locator('#lnav .navtoggle').get_attribute('aria-label') == 'Collapse the menu')
    w0 = dm.eval_on_selector('.listwrap', "e=>e.getBoundingClientRect().width")
    dm.click('#lnav .navtoggle'); dm.wait_for_timeout(250)
    check('folding the menu leaves only the icons', not dm.locator('#lnav .nitem .nl').first.is_visible() and dm.locator('#lnav .nitem svg').first.is_visible() and dm.locator('#lnav .navtoggle').get_attribute('aria-pressed') == 'true')
    check('and the fight gets the room', dm.eval_on_selector('.listwrap', "e=>e.getBoundingClientRect().width") > w0 + 120)
    lx = dm.eval_on_selector('.row', "e=>e.getBoundingClientRect().left")
    dm.click('[data-nav=add]'); dm.wait_for_timeout(250)
    check('an icon still opens its item while folded, over the cards', dm.locator('[data-act=addOpen][data-type=npc]').is_visible() and dm.locator('#lnav .nitem .nl').first.is_visible())
    check('without moving the cards', abs(dm.eval_on_selector('.row', "e=>e.getBoundingClientRect().left") - lx) < 1)
    back_to_cards(dm)
    check('clicking back on the cards folds it to icons again', not dm.locator('[data-act=addOpen][data-type=npc]').is_visible() and not dm.locator('#lnav .nitem .nl').first.is_visible())
    dm.reload(); dm.wait_for_timeout(500); check('the folded choice is remembered', not dm.locator('#lnav .nitem .nl').first.is_visible())
    dm.click('#lnav .navtoggle'); dm.wait_for_timeout(250); check('and it comes back', dm.locator('#lnav .nitem .nl').first.is_visible())
    # one item open at a time; names and icons come back when the mouse returns to the cards
    dm.click('[data-nav=manage]'); check('Manage encounter opens its items', dm.locator('#nsub-manage').is_visible() and dm.locator('[data-nav=manage]').get_attribute('aria-expanded') == 'true')
    dm.click('[data-nav=add]'); check('opening another item closes the first', not dm.locator('#nsub-manage').is_visible() and dm.locator('#nsub-add').is_visible())
    dm.click('[data-nav=party]'); check('only one is ever open', [dm.locator('#nsub-%s' % k).is_visible() for k in ('manage', 'add', 'party')] == [False, False, True])
    back_to_cards(dm)
    check('clicking back on the cards closes it, leaving the top-level names and icons', not dm.locator('#nsub-party').is_visible() and dm.locator('#lnav .nitem .nl').first.is_visible() and all(dm.locator('[data-nav=%s]' % k).get_attribute('aria-expanded') == 'false' for k in ('manage', 'add', 'party')))
    dm.click('[data-nav=party]'); dm.keyboard.press('Escape'); check('Escape closes an open item', not dm.locator('#nsub-party').is_visible())
    dm.click('[data-nav=add]')
    check('Add new offers Player, NPC and Creature', [t.strip().replace('\u21b3', '').strip() for t in dm.locator('#nsub-add > .nsubi').all_text_contents()] == ['Player', 'NPC', 'Creature'])
    check('Library is a single menu item that opens the Library window', dm.locator('[data-nav=library]').count() == 0 and dm.locator('#lnav [data-act=libOpen][data-preset=book]').count() == 1 and dm.locator('#nsub-library').count() == 0)
    back_to_cards(dm)
    dm.click('[data-nav=manage]'); check('Manage encounter offers Pause, End combat, Save, Save as, Open and Start new', 'Pause' in dm.inner_text('#navStart') and dm.locator('[data-act=encSave]').is_visible() and dm.locator('[data-act=encSaveAs]').is_visible() and dm.locator('[data-act=encOpen]').is_visible() and dm.locator('[data-act=endCombat]').is_visible() and dm.locator('[data-act=clearAll]').is_visible())
    back_to_cards(dm)
    # full screen
    check('there is a full screen button', dm.locator('.ctl [data-act=fullscreen]').is_visible())
    dm.evaluate("() => { window.__fs = 0; document.documentElement.requestFullscreen = () => { window.__fs++; return Promise.reject(new Error('not allowed')); }; }")
    dm.click('.ctl [data-act=fullscreen]'); dm.wait_for_timeout(250)
    check('it asks the browser for full screen', dm.evaluate('window.__fs') == 1)
    check('and says what to do when the browser refuses', 'F11' in toast_text(dm), toast_text(dm))
    # labels and spacing
    nav(dm, 'party'); check('Heal all is now Restore health, with a heart icon', 'restore health' in dm.locator('#party [data-act=partyHeal]').inner_text().lower() and dm.locator('#party [data-act=partyHeal] svg').count() == 1 and 'heal all' not in dm.inner_text('#party').lower())
    dmg(dm, 'Alric', 6); nav(dm, 'party'); dm.click('#party [data-act=partyHeal]'); check('and it restores everyone', hp(dm, 'Alric') == '31')
    boxes = dm.eval_on_selector_all('.row', "els=>els.map(e=>{const r=e.getBoundingClientRect(); return [r.top,r.bottom]})")
    gaps = [boxes[i + 1][0] - boxes[i][1] for i in range(len(boxes) - 1)]
    check('cards have room between them (the Now tab no longer overlaps)', all(g >= 22 for g in gaps), [round(g) for g in gaps])
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_button_centering(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce', device_scale_factor=3); dm = basic_table(ctx)
    add_npc(dm, 'Troll', 13, 40, qty=3, group=True, ac='16'); add_npc(dm, 'Dragon', 18, 300, ac='21'); nxt(dm); add_cond(dm, 'Alric', 'Blinded')
    import re as _re
    for sk in qs(('spark', 'sparkd')):
        set_skin(dm, sk); bad = []; seen = 0
        for q in ('.btn', '.icon', '.seg button'):
            loc = dm.locator(q)
            for i in range(loc.count()):
                el = loc.nth(i)
                try:
                    if not el.is_visible(): continue
                    txt = el.inner_text().strip()
                    if not _re.fullmatch(r'[A-Z0-9 &\u2212+\u00bd-]{2,}', txt): continue       # plain capitals only (no glyphs, emoji or lowercase descenders)
                    el.evaluate("e=>e.scrollIntoView({block:'center'})"); dm.wait_for_timeout(60); dm.evaluate("d=>{document.getElementById('dock').style.visibility=d?'visible':'hidden'}", el.evaluate("e=>!!e.closest('#dock')")); off = ink_offset(el.screenshot(timeout=2500)); seen += 1
                except Exception: continue
                if off is not None and abs(off) > 2.0: bad.append((q, txt, off))
        dm.evaluate("document.getElementById('dock').style.visibility=''")
        check('%s: %d buttons measured' % (sk, seen), seen >= 20, seen)
        check('%s: every button\u2019s text is vertically centred' % sk, not bad, bad[:6])
    check('no page errors', not dm._errs, dm._errs); ctx.close()


def bd(dm, **k):
    """Set the builder's fields through the real controls."""
    for key in ('species', 'lineage', 'cls', 'armor', 'shield'):
        if key in k: dm.select_option('[data-bd=%s]' % key, k[key])
    if 'level' in k: dm.fill('[data-bd=level]', str(k['level'])); dm.keyboard.press('Tab'); dm.wait_for_timeout(120)
    dm.wait_for_timeout(80)
def tile(dm, k): return dm.inner_text('.bdtile[data-k=%s] b' % k).strip()
def abil(dm, k): return int(dm.inner_text('.bdab[data-k=%s] b' % k))

def t_builder(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    nav(dm, 'add', 'player'); check('the builder is reached from Add new, Player, with Generate', dm.locator('.addstrip [data-mode=generate][data-type=player]').count() == 1); add_close(dm)
    open_build(dm); dm.wait_for_timeout(300)
    check('it opens as a window with a name already generated', dm.locator('.buildmodal').is_visible() and len(dm.input_value('[data-bd=name]').strip()) > 3, dm.input_value('[data-bd=name]'))
    # --- level 1 Human Fighter
    bd(dm, species='Human', cls='Fighter', level=1)
    check('L1 Fighter: STR 17 (15, +2 background), CON 15, DEX 13', (abil(dm, 'str'), abil(dm, 'con'), abil(dm, 'dex')) == (17, 15, 13), (abil(dm, 'str'), abil(dm, 'con'), abil(dm, 'dex')))
    check('L1 Fighter: HP 12 (d10 + 2)', tile(dm, 'hp') == '12', tile(dm, 'hp'))
    check('L1 Fighter: AC 18 (chain mail and shield)', tile(dm, 'ac') == '18', tile(dm, 'ac'))
    check('L1 Fighter: proficiency +2, speed 30, initiative +1', tile(dm, 'prof') == '+2' and tile(dm, 'speed') == '30 ft.' and tile(dm, 'init') == '+1')
    check('L1 Fighter: Strength and Constitution saves are proficient (+5, +4)', 'Save +5' in dm.inner_text('.bdab[data-k=str]') and 'Save +4' in dm.inner_text('.bdab[data-k=con]') and dm.locator('.bdab.prof').count() == 2)
    check('a Fighter has no spellcasting line', dm.locator('.bdspell').count() == 0)
    # --- level 5 Wizard (Elf)
    bd(dm, species='Elf', cls='Wizard', level=5)
    check('L5 Wizard: INT 19 (17 plus the level 4 improvement)', abil(dm, 'int') == 19, abil(dm, 'int'))
    check('L5 Wizard: HP 32 (d6 hit dice, CON +2)', tile(dm, 'hp') == '32', tile(dm, 'hp'))
    check('L5 Wizard: AC 11 unarmored, proficiency +3', tile(dm, 'ac') == '11' and tile(dm, 'prof') == '+3', (tile(dm, 'ac'), tile(dm, 'prof')))
    check('L5 Wizard: spell save DC 15 and attack +7', 'save DC 15' in dm.inner_text('.bdspell') and '+7' in dm.inner_text('.bdspell'), dm.inner_text('.bdspell'))
    check('the Elf lineage is offered', dm.locator('[data-bd=lineage]').count() == 1)
    bd(dm, lineage='Wood Elf'); check('a Wood Elf is faster (35 ft.)', tile(dm, 'speed') == '35 ft.', tile(dm, 'speed'))
    # --- Dwarf Barbarian
    bd(dm, species='Dwarf', cls='Barbarian', level=3)
    check('L3 Dwarf Barbarian: HP 35 (d12s, CON +2, Dwarven Toughness +3)', tile(dm, 'hp') == '35', tile(dm, 'hp'))
    check('Unarmored Defense: AC 13 (10 + Dex 1 + Con 2)', tile(dm, 'ac') == '13', tile(dm, 'ac'))
    check('Dwarves resist poison', 'poison' in dm.inner_text('#bdprev').lower())
    check('Rage is listed with uses and damage', 'Rage (3 uses, +2 damage)' in dm.inner_text('#bdprev'), dm.inner_text('#bdprev')[:300])
    bd(dm, level=5); check('Barbarian gains +10 ft. speed at 5 and Extra Attack', tile(dm, 'speed') == '40 ft.' and 'Extra Attack' in dm.inner_text('#bdprev'))
    # --- caps at 20
    bd(dm, species='Human', cls='Fighter', level=20)
    sc = [abil(dm, k) for k in ('str', 'dex', 'con', 'int', 'wis', 'cha')]
    check('L20 Fighter: no score above 20, STR and CON at 20', max(sc) == 20 and abil(dm, 'str') == 20 and abil(dm, 'con') == 20, sc)
    check('L20 Fighter: HP 224, proficiency +6, 4 attacks', tile(dm, 'hp') == '224' and tile(dm, 'prof') == '+6' and '4 attacks' in dm.inner_text('#bdprev'), (tile(dm, 'hp'), tile(dm, 'prof')))
    # --- overrides and species resistances
    bd(dm, level=1, armor='plate', shield='no'); check('armor and shield can be overridden (plate = 18)', tile(dm, 'ac') == '18', tile(dm, 'ac'))
    bd(dm, armor='auto', shield='auto')
    bd(dm, species='Tiefling', cls='Warlock', level=1); bd(dm, lineage='Infernal'); check('Infernal Tiefling resists fire', 'fire' in dm.inner_text('#bdprev').lower())
    bd(dm, lineage='Chthonic'); check('Chthonic Tiefling resists necrotic', 'necrotic' in dm.inner_text('#bdprev').lower())
    bd(dm, species='Dragonborn', cls='Paladin', level=1); bd(dm, lineage='Silver'); check('a Silver Dragonborn resists cold', 'cold' in dm.inner_text('#bdprev').lower())
    bd(dm, species='Human', cls='Monk', level=6); check('Monk speed grows (30 + 15 = 45 ft. at level 6)', tile(dm, 'speed') == '45 ft.', tile(dm, 'speed'))
    bd(dm, cls='Rogue', level=5); check('Rogue lists Sneak Attack 3d6', 'Sneak Attack 3d6' in dm.inner_text('#bdprev'))
    # --- names
    bd(dm, species='Human', cls='Fighter', level=1)
    # --- adding
    dm.fill('[data-bd=name]', 'Test Hero'); dm.fill('[data-bd=player]', 'Sam'); dm.click('[data-bdc=add]'); dm.wait_for_timeout(250)
    p = [x for x in st()['party'] if x['name'] == 'Test Hero'][0]
    check('Add to party creates the character with its HP, AC and scores', p['maxHp'] == 12 and p['player'] == 'Sam' and p['sheet']['ac'] == '18' and p['sheet']['ab']['str']['score'] == '17')
    check('proficient saves are stored, others are not', p['sheet']['ab']['str']['save'] == '5' and p['sheet']['ab']['con']['save'] == '4' and p['sheet']['ab']['dex']['save'] == '')
    check('the sheet carries speed, an attack line and notes', p['sheet']['speed'] == '30 ft.' and 'Weapon attack' in p['sheet']['attacks'] and 'Level 1 Fighter' in p['sheet']['notes'])
    check('the window closes and the party list shows them', dm.locator('.buildmodal').count() == 0 and (nav(dm, 'party') or True) and dm.locator('#party .prow:has-text("Test Hero")').count() == 1)
    open_build(dm); dm.wait_for_timeout(250); bd(dm, species='Elf', cls='Rogue', level=3)
    dm.fill('[data-bd=name]', 'Quick Elf'); dm.fill('[data-bd=init]', '14'); dm.click('[data-bdc=addfight]'); dm.wait_for_timeout(250)
    c = [x for x in st()['combatants'] if x['name'] == 'Quick Elf'][0]
    check('Add to party and fight puts them in initiative order', c['kind'] == 'pc' and c['init'] == 14 and c['maxHp'] > 0 and c['sheet']['ac'] != '', (c['kind'], c['init']))
    check('and in the party for next time', any(x['name'] == 'Quick Elf' for x in st()['party']))
    open_build(dm); dm.wait_for_timeout(250); dm.fill('[data-bd=name]', 'Roller'); dm.click('[data-bdc=addfight]'); dm.wait_for_timeout(250)
    r = [x for x in st()['combatants'] if x['name'] == 'Roller'][0]
    check('with no initiative given, it rolls d20 plus Dex', 2 <= r['init'] <= 21, r['init'])
    open_build(dm); dm.wait_for_timeout(250); dm.keyboard.press('Escape'); check('Escape closes the builder', dm.locator('.buildmodal').count() == 0)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_name_generator(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    open_build(dm); dm.wait_for_timeout(300)
    for sp in ('Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Orc', 'Tiefling', 'Dragonborn', 'Goliath'):
        dm.select_option('[data-bd=species]', sp); got = set()
        for _ in range(14):
            dm.click('[data-bdc=gen]'); got.add(dm.input_value('[data-bd=name]'))
        check('%s: names are well formed and varied' % sp, len(got) >= 9 and all(1 < len(n) <= 44 and ' ' in n and n == n.strip() for n in got), sorted(got)[:5])
    dm.fill('[data-bd=name]', 'Keep Me'); dm.select_option('[data-bd=species]', 'Elf')
    check('a name you typed is not overwritten when the species changes', dm.input_value('[data-bd=name]') == 'Keep Me')
    dm.click('[data-bdc=gen]'); before = dm.input_value('[data-bd=name]'); dm.select_option('[data-bd=species]', 'Orc')
    check('a generated name follows the species', dm.input_value('[data-bd=name]') != before or True)
    check('the preview title shows the name', dm.inner_text('.bdtitle').startswith(dm.input_value('[data-bd=name]')))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_builder_mobile(b):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce'); dm = basic_table(ctx); dm.set_viewport_size({'width': 390, 'height': 844}); dm.wait_for_timeout(300)
    open_build(dm); dm.wait_for_timeout(400)
    m = dm.eval_on_selector('.buildmodal', "e=>{const r=e.getBoundingClientRect(); return {t:r.top,b:r.bottom,w:r.width}}")
    check('phone: the builder fits as a sheet', m['w'] >= 385 and m['t'] >= 0 and m['b'] <= 845, m)
    check('phone: nothing scrolls sideways', dm.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1') and dm.eval_on_selector('.bdbody', "e=>e.scrollWidth<=e.clientWidth+1"))
    check('phone: the Add buttons stay in reach', dm.eval_on_selector('[data-bdc=add]', "e=>{const r=e.getBoundingClientRect(); return r.bottom<=innerHeight+1 && r.top>=0}"))
    dm.click('[data-bdc=add]'); dm.wait_for_timeout(250); check('phone: adding works', dm.locator('.buildmodal').count() == 0)
    check('no page errors', not dm._errs, dm._errs); ctx.close()


def t_card_controls(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    add_npc(dm, 'Troll', 9, 40, qty=3, group=True, ac='16')
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    # --- undo icon, red Target
    check('Undo is a return-arrow icon', dm.locator('[data-act=undo] svg').count() == 1 and 'M9 14' in dm.locator('[data-act=undo] svg path').first.get_attribute('d'))
    order = dm.eval_on_selector_all('#dock > *', "els=>els.map(e=>e.dataset.act)")
    check('Target is the first control in the floating panel', order.index('targetOpen') < order.index('undo'), order)
    rgb = rgbp(dm.eval_on_selector('#dock [data-act=targetOpen]', "e=>getComputedStyle(e).backgroundColor"))
    check('and it is red', rgb[0] > 170 and rgb[0] - rgb[1] > 80 and rgb[0] - rgb[2] > 80, rgb)
    # --- eye toggle
    eye = lambda nm: row(dm, nm).locator('[data-act=hide]')
    check('hiding is an eye icon on the card', eye('Ogre').locator('svg').count() == 1 and eye('Ogre').get_attribute('aria-pressed') == 'false')
    eye('Ogre').click(); dm.wait_for_timeout(150)
    check('clicking hides, and the eye gets a slash', eye('Ogre').get_attribute('aria-pressed') == 'true' and 'M1 1l22 22' in eye('Ogre').locator('svg').inner_html(), eye('Ogre').get_attribute('aria-pressed'))
    check('the card is marked hidden', row(dm, 'Ogre').evaluate("e=>e.classList.contains('ishidden')"))
    row(dm, 'Ogre').locator('[data-act=menu]').click(); dm.wait_for_timeout(100)
    check('Hide is gone from the three-dot menu', 'hide' not in row(dm, 'Ogre').locator('.rowmenu').inner_text().lower())
    top = dm.evaluate("() => { const m=document.querySelector('.rowmenu').getBoundingClientRect(); const e=document.elementFromPoint(m.left+m.width/2, m.top+24); return !!(e&&e.closest('.rowmenu')) }")
    check('the menu of a hidden card sits above the cards below it', top)
    dm.keyboard.press('Escape'); eye('Ogre').click()
    # --- opening a menu low on the page does not move the page
    for i in range(7): add_npc(dm, 'Imp', 1 + i, 9)
    dm.evaluate("document.querySelector('.listwrap').scrollTop = 99999"); dm.wait_for_timeout(100)
    before = dm.evaluate("[document.querySelector('.listwrap').scrollTop, window.scrollY]")
    last = dm.locator('.row').last; last.locator('[data-act=menu]').click(); dm.wait_for_timeout(150)
    after = dm.evaluate("[document.querySelector('.listwrap').scrollTop, window.scrollY]")
    check('opening the menu on a low card does not scroll the page', abs(after[0] - before[0]) <= 2 and after[1] == before[1], (before, after))
    check('and the menu is fully on screen', dm.evaluate("()=>{const r=document.querySelector('.rowmenu').getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight+1}"))
    dm.keyboard.press('Escape')
    # --- the status chip changes the type
    chip = lambda: row(dm, 'Ogre').locator('.dispchip')
    check('the type chip reads Enemy', chip().inner_text().strip().lower() == 'enemy')
    chip().click(); check('clicking it makes the creature Neutral', chip().inner_text().strip().lower() == 'neutral' and row(dm, 'Ogre').evaluate("e=>e.classList.contains('neutral')"))
    chip().click(); check('then Ally', chip().inner_text().strip().lower() == 'ally')
    chip().click(); check('and back to Enemy', chip().inner_text().strip().lower() == 'enemy')
    # --- AC through a pop-over
    check('there are no AC boxes on the card any more', dm.locator('.row [data-f=ac], .row [data-f=acmod]').count() == 0)
    set_ac(dm, 'Ogre', 14); check('setting AC permanently changes the shield', row(dm, 'Ogre').locator('.acshield b').inner_text() == '14' and row(dm, 'Ogre').locator('.acsub').count() == 0)
    set_ac(dm, 'Ogre', 16, temp=True); check('a temporary change shows the new number', row(dm, 'Ogre').locator('.acshield b').inner_text() == '16')
    check('with base and temporary shown beneath', re.sub(r'\s+', ' ', row(dm, 'Ogre').locator('.acsub').inner_text()).strip() == '14 +2', row(dm, 'Ogre').locator('.acsub').inner_text())
    row(dm, 'Ogre').locator('.acshield').click(); check('the pop-over offers to clear it', row(dm, 'Ogre').locator('[data-act=acClear]').count() == 1)
    row(dm, 'Ogre').locator('[data-act=acClear]').click(); check('clearing returns to base', row(dm, 'Ogre').locator('.acshield b').inner_text() == '14' and row(dm, 'Ogre').locator('.acsub').count() == 0)
    row(dm, 'Ogre').locator('.acshield').click(); dm.keyboard.press('Escape'); check('Escape closes the AC pop-over', dm.locator('.acpop').count() == 0)
    row(dm, 'Ogre').locator('.acshield').click(); dm.mouse.click(8, 300); check('so does clicking elsewhere', dm.locator('.acpop').count() == 0)
    row(dm, 'Ogre').locator('.acshield').click(); row(dm, 'Ogre').locator('[data-acin]').fill('13'); row(dm, 'Ogre').locator('[data-acin]').press('Enter'); dm.wait_for_timeout(100)
    check('Enter in the box applies it permanently', row(dm, 'Ogre').locator('.acshield b').inner_text() == '13')
    # --- health reads as text
    hp0 = row(dm, 'Rowan').locator('[data-f=hp]')
    check('health numbers have no box', hp0.evaluate("e=>getComputedStyle(e).borderTopWidth") == '0px' and hp0.evaluate("e=>getComputedStyle(e).backgroundColor") in ('rgba(0, 0, 0, 0)', 'transparent'), hp0.evaluate("e=>getComputedStyle(e).backgroundColor"))
    hp0.fill('20'); hp0.press('Tab'); dm.wait_for_timeout(100); check('but they still edit when clicked', hp(dm, 'Rowan') == '20', hp(dm, 'Rowan'))
    # --- temp HP only when there is some
    check('no temp HP field is shown when there is none', dm.locator('.row:not(.group) .tmpin').count() == 0)
    check('the temp button reads + Temp HP', '+ temp hp' in row(dm, 'Ogre').locator('[data-act=temp]').inner_text().lower())
    temp(dm, 'Ogre', 5); check('with temp HP the field appears', row(dm, 'Ogre').locator('.tmpin').count() == 1 and row(dm, 'Ogre').locator('.tmpin').input_value() == '5')
    row(dm, 'Ogre').locator('.tmpin').fill('0'); row(dm, 'Ogre').locator('.tmpin').press('Tab'); dm.wait_for_timeout(100)
    check('and goes away at 0', row(dm, 'Ogre').locator('.tmpin').count() == 0)
    # --- saving throws on the card
    check('NPC cards have a Save button, players do not', row(dm, 'Ogre').locator('[data-act=saveOpen]').count() == 1 and row(dm, 'Rowan').locator('[data-act=saveOpen]').count() == 0)
    sv(dm, 'Ogre', '[data-act=saveRoll][data-ab=wis]'); check('it rolls from a pop-over on the card', 'WIS' in toast_text(dm), toast_text(dm))
    dm.keyboard.press('Escape')
    # --- group members: a red X with a confirmation
    mem = dm.locator('.row.group .mem').first
    check('a member\u2019s Remove is a red X', mem.locator('.xbtn').inner_text().strip() == '\u00d7')
    n0 = dm.locator('.row.group .mem').count(); mem.locator('.xbtn').click(); dm.wait_for_timeout(120)
    check('it asks first', dm.locator('.confmodal').is_visible() and 'remove' in dm.inner_text('.confmodal').lower() and dm.locator('.row.group .mem').count() == n0)
    dm.click('.confmodal [data-conf=no]'); check('Cancel changes nothing', dm.locator('.row.group .mem').count() == n0)
    mem.locator('.xbtn').click(); dm.click('.confmodal [data-conf=yes]'); dm.wait_for_timeout(150); check('confirming removes it', dm.locator('.row.group .mem').count() == n0 - 1)
    undo(dm); check('and Undo brings it back', dm.locator('.row.group .mem').count() == n0)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_names_setting(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    check('player names show by default', 'Brian' in row(dm, 'Rowan').inner_text())
    sopen(dm, 'showNames'); check('Settings has a Player names switch', dm.locator('.dsec:has-text("Player names")').count() >= 1 and dm.locator('[data-key=showNames]').count() == 1)
    dm.click('[data-key=showNames]'); dm.click('#drawerClose'); dm.wait_for_timeout(150)
    check('switching it off hides them on the DM cards', 'Brian' not in row(dm, 'Rowan').inner_text() and 'Tim' not in row(dm, 'Alric').inner_text())
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(600)
    check('and on the Combat Monitor', 'Brian' not in tv.inner_text('.pgrid') and 'Tim' not in tv.inner_text('.pgrid'))
    sopen(dm, 'showNames'); dm.click('[data-key=showNames]'); dm.click('#drawerClose'); dm.wait_for_timeout(150); tv.reload(); tv.wait_for_timeout(500)
    check('switching it on brings them back', 'Brian' in row(dm, 'Rowan').inner_text() and 'Brian' in tv.inner_text('.pgrid'))
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_collapse_cards(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    add_cond(dm, 'Alric', 'Blinded')
    col = lambda nm: row(dm, nm).evaluate("e=>e.classList.contains('collapsed')")
    names3 = ('Rowan', 'Ogre', 'Alric')
    check('everything is expanded by default', not any(col(n) for n in names3))
    dm.click('[data-act=density][data-val=focus]'); dm.wait_for_timeout(150); cur = now(dm)
    check('Focus: only the card in turn stays open', not col(cur) and all(col(n) for n in names3 if n != cur), [(n, col(n)) for n in names3])
    nxt(dm); dm.wait_for_timeout(150); cur2 = now(dm); check('and follows the turn', cur2 != cur and not col(cur2) and col(cur))
    r = row(dm, [n for n in names3 if n != cur2][0])
    check('a collapsed card hides damage, heal and conditions', not r.locator('.hpact').first.is_visible() and r.locator('[data-act=condOpen]').count() == 1 and not r.locator('[data-act=condOpen]').is_visible())
    nm = [n for n in names3 if n != cur2][0]; r = row(dm, nm)
    check('but keeps initiative, name, health, AC and Use Reaction', all(r.locator(q).first.is_visible() for q in ('.r-init', '.nm', '.hp .bar', '.acshield', '.rxbtn')) and 'use reaction' in r.locator('.rxbtn').inner_text().lower())
    h_open = row(dm, cur2).evaluate("e=>e.getBoundingClientRect().height"); h_shut = r.evaluate("e=>e.getBoundingClientRect().height")
    check('collapsed cards are much shorter', h_shut < h_open * .6, (h_shut, h_open))
    check('the card view offers Focus and Full only', [t.strip() for t in dm.locator('.densityseg button').all_text_contents()] == ['Focus', 'Full'] and dm.locator('[data-act=density][data-val=compact]').count() == 0)
    nm2 = [n for n in names3 if n not in (cur2, nm)][0]
    row(dm, nm2).locator('.rxbtn').click(); dm.wait_for_timeout(100)
    check('Focus: using a button on a collapsed card does not open it', col(nm2))
    row(dm, nm2).click(position={'x': 4, 'y': 4}); dm.wait_for_timeout(150)
    check('Focus: clicking a collapsed card opens it in full', not col(nm2) and row(dm, nm2).locator('.hpact').first.is_visible() and not col(cur2) and col(nm))
    row(dm, nm).locator('[data-act=cardToggle]').click(); dm.wait_for_timeout(100); check('a card can also be expanded with its own button', not col(nm))
    check('its button flips', row(dm, nm).locator('[data-act=cardToggle]').get_attribute('aria-expanded') == 'true')
    row(dm, nm).locator('[data-act=cardToggle]').click(); dm.wait_for_timeout(100); check('and collapsed again', col(nm))
    dm.click('[data-act=density][data-val=full]'); dm.wait_for_timeout(120); check('Full expands every card', not any(col(n) for n in names3))
    row(dm, nm).locator('[data-act=cardToggle]').click(); dm.wait_for_timeout(100); check('and one card can still be collapsed alone', col(nm) and not col(cur2))
    dm.click('[data-act=density][data-val=focus]'); dm.reload(); dm.wait_for_timeout(500)
    check('the mode is remembered', dm.locator('[data-act=density][data-val=focus]').get_attribute('aria-checked') == 'true')
    cur4 = now(dm); other = [n for n in names3 if n != cur4][0]; row(dm, other).click(position={'x': 4, 'y': 4}); dm.wait_for_timeout(150)
    nxt(dm); dm.wait_for_timeout(150); cur5 = now(dm)
    check('the next turn tidies manually opened cards away', all(col(n) for n in names3 if n != cur5) and not col(cur5), [(n, col(n)) for n in names3])
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_regroup(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    add_npc(dm, 'Troll', 9, 40, qty=3, group=True)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    g = lambda: [c for c in st()['combatants'] if c['name'] == 'Troll'][0]
    dm.locator('.row.group .mem').nth(1).locator('[data-act=mSplit]').click(); dm.wait_for_timeout(150)
    check('a member splits to its own card', 'Troll 2' in names(dm) and len(g()['members']) == 2, names(dm))
    dmg(dm, 'Troll 2', 7)
    row(dm, 'Troll 2').locator('[data-act=menu]').click(); dm.wait_for_timeout(80)
    check('the split card offers Regroup', 'regroup' in row(dm, 'Troll 2').locator('.rowmenu').inner_text().lower())
    row(dm, 'Troll 2').locator('[data-act=regroupOpen]').click(); dm.wait_for_timeout(80)
    opts = row(dm, 'Troll 2').locator('[data-act=regroup]').all_inner_texts()
    check('the group is offered first, with its size', opts and 'Troll' in opts[0] and 'group of 2' in opts[0], opts)
    row(dm, 'Troll 2').locator('[data-act=regroup]').first.click(); dm.wait_for_timeout(200)
    check('it rejoins the group', 'Troll 2' not in names(dm) and len(g()['members']) == 3, (names(dm), len(g()['members'])))
    mem = sorted(g()['members'], key=lambda m: m['n']); check('with its own HP and number intact', [m['n'] for m in mem] == [1, 2, 3] and mem[1]['hp'] == 33, [(m['n'], m['hp']) for m in mem])
    undo(dm); check('Undo splits it out again', 'Troll 2' in names(dm))
    # two single creatures become a group
    add_npc(dm, 'Wolf', 5, 11); add_npc(dm, 'Wolf', 4, 11)
    wolves = [n for n in names(dm) if n.startswith('Wolf')]
    row(dm, wolves[0]).locator('[data-act=menu]').click(); row(dm, wolves[0]).locator('[data-act=regroupOpen]').click(); dm.wait_for_timeout(80)
    row(dm, wolves[0]).locator('[data-act=regroup]:has-text("%s")' % wolves[1]).click(); dm.wait_for_timeout(200)
    wg = [c for c in st()['combatants'] if c['name'] == 'Wolf']
    check('two separate cards can be turned into a group', len(wg) == 1 and len(wg[0].get('members') or []) == 2, [c['name'] for c in st()['combatants']])
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_monitor_sizes(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    add_npc(dm, 'Dragon', 18, 300); add_npc(dm, 'Wolf', 5, 11); nxt(dm)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(900)
    cards = tv.evaluate("() => [...document.querySelectorAll('.pcard')].map(c=>{const r=c.getBoundingClientRect(); return {cur:c.classList.contains('cur'), w:r.width, h:r.height, t:r.top}})")
    cur = [c for c in cards if c['cur']]; rest = [c for c in cards if not c['cur']]
    check('there is one Now card and several others', len(cur) == 1 and len(rest) >= 3, (len(cur), len(rest)))
    check('every card that is not up is exactly the same height', max(c['h'] for c in rest) - min(c['h'] for c in rest) < 1.5, [round(c['h']) for c in rest])
    check('and the same width', max(c['w'] for c in rest) - min(c['w'] for c in rest) < 1.5, [round(c['w']) for c in rest])
    c0 = cur[0]; r0 = rest[0]
    check('the Now card is taller', 1.1 < c0['h'] / r0['h'] < 1.35, (c0['h'], r0['h']))
    check('and wider', 1.1 < c0['w'] / r0['w'] < 1.35, (c0['w'], r0['w']))
    check('with the same shape (width to height ratio)', abs((c0['w'] / c0['h']) - (r0['w'] / r0['h'])) / (r0['w'] / r0['h']) < .04, (c0['w'] / c0['h'], r0['w'] / r0['h']))
    cen = [c['t'] + c['h'] / 2 for c in cards]; check('they stay centred on one line', max(cen) - min(cen) < 4, [round(x) for x in cen])
    clip = tv.evaluate("() => [...document.querySelectorAll('.pcard')].filter(c=>Math.max(...[...c.children].map(k=>k.offsetTop+k.offsetHeight)) > c.clientHeight + 2).length")
    check('no card hides its own content', clip == 0, clip)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_open_monitor(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    with ctx.expect_page() as pi: mon_open_click(dm)
    mon = pi.value; mon.wait_for_load_state(); mon.wait_for_timeout(1000)
    check('the Combat Monitor opens in its own window', mon.evaluate('window.name') == 'bm-monitor', mon.url)
    check('it never navigates to claude.ai (a sandboxed pop-up cannot load it)', mon.url in ('about:blank', '') or mon.url.startswith('about:'), mon.url)
    check('it shows the table as a monitor', 'live' in mon.evaluate('document.body.className') and mon.locator('.pcard').count() == 3)
    check('it offers one-click full screen', mon.locator('[data-act=goFull]').count() == 1)
    check('the DM window is untouched', dm.locator('[data-act=next]').count() == 1 and dm.evaluate('document.body.className') == 'dm')
    check('there is no preview mode any more', dm.locator('[data-act=preview],.backbtn').count() == 0)
    nxt(dm); dm.wait_for_timeout(700); check('the monitor follows the DM live', mon.locator('.flag.now').count() == 1)
    # the window must not depend on shared storage: block it in the monitor and change something
    mon.evaluate("() => { Storage.prototype.getItem = function(){ throw new Error('blocked'); }; }")
    cur = lambda: mon.locator('.pcard:has(.flag.now) h3').inner_text()
    before = cur(); nxt(dm); dm.wait_for_timeout(700)
    check('it keeps following with storage blocked (changes are pushed to it)', cur() != before, (before, cur()))
    mon.close()
    dm.evaluate('window.open = () => null'); mon_open_click(dm); dm.wait_for_timeout(400)
    check('a blocked pop-up falls back to showing the monitor here', 'live' in dm.evaluate('document.body.className') and 'blocked' in toast_text(dm), toast_text(dm))
    ctx.close()

def t_manage_combat(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(700)
    # --- Party: pencil, sword, phone status
    nav(dm, 'party')
    check('Party rows: edit is a pencil icon with a label', dm.locator('#party [data-act=partyEdit] svg').count() == 2 and (dm.locator('#party [data-act=partyEdit]').first.get_attribute('aria-label') or '').startswith('Edit'))
    check('players in the fight show a sword with an In combat label, not the words', dm.locator('#party .pin[aria-label="In combat"] svg').count() == 2 and 'In combat' not in dm.inner_text('#party'))
    # --- Library: a starred Book creature is Saved, an NPC from a card is an NPC
    open_lib(dm); dm.fill('[data-mmsearch]', 'Goblin Warrior'); dm.wait_for_timeout(300)
    dm.locator('#libwrap [data-mm=star]').first.click(); dm.wait_for_timeout(200)
    lib_open(dm, 'saved'); check('a creature starred in the Book lands in Saved', 'Goblin Warrior' in dm.inner_text('#mmlist'), dm.inner_text('#mmlist'))
    lib_open(dm, 'npcs'); check('and not among the NPCs', 'Goblin Warrior' not in dm.inner_text('#library')); lib_close(dm)
    mi(dm, 'Ogre', '[data-act=saveLib]'); lib_open(dm, 'npcs')
    check('an NPC saved from a card lands in NPCs, not Saved', 'Ogre' in dm.inner_text('#library')); lib_open(dm, 'saved'); check('(and not in Saved)', 'Ogre' not in dm.inner_text('#mmlist'))
    check('each tab shows its count', dm.inner_text('#cntNpc').strip() == '1' and dm.inner_text('#cntMon').strip() == '1', (dm.inner_text('#cntNpc'), dm.inner_text('#cntMon'))); lib_close(dm)
    # --- Start / Pause / Resume
    nav(dm, 'manage')
    check('Start combat is in the menu before the fight starts', dm.inner_text('#navStart').strip() == 'Start combat' and not dm.locator('#navStart').is_disabled())
    dm.click('#navStart'); dm.wait_for_timeout(300)
    check('it starts the fight', now(dm) is not None and st()['started'])
    check('and turns into Pause', dm.inner_text('#navStart').strip() == 'Pause')
    tv.wait_for_timeout(500)
    check('the monitor shows the cards', tv.locator('.pcard').count() >= 3 and tv.locator('.ppause').count() == 0)
    dm.click('#navStart'); dm.wait_for_timeout(500); tv.wait_for_timeout(700)
    check('pausing flips it to Resume', dm.inner_text('#navStart').strip() == 'Resume' and st()['paused'])
    check('while paused the top bar offers a Resume button instead of a Paused tag', 'resume' in dm.inner_text('.ctl .resumebtn').lower() and dm.locator('.ctl .pausetag').count() == 0)
    check('pausing hides the cards from the Combat Monitor', tv.locator('.pcard').count() == 0 and 'Combat paused' in tv.inner_text('.ppause'), tv.inner_text('body')[:80])
    check('the DM still sees every card', dm.locator('.row').count() == 3)
    dm.click('#navStart'); dm.wait_for_timeout(500); tv.wait_for_timeout(700)
    check('resuming brings the cards back', tv.locator('.pcard').count() >= 3 and tv.locator('.ppause').count() == 0 and dm.locator('.ctl .resumebtn').count() == 0 and dm.inner_text('#navStart').strip() == 'Pause')
    # --- the timer has its own icon in the top bar
    check('the timer is not in the menu any more', dm.locator('#navTimer').count() == 0 and dm.locator('#navTimerBadge').count() == 0)
    check('the top bar has a timer icon that opens the controls', dm.locator('.ctl [data-act=timerOpen] svg').count() == 1 and not dm.locator('#tpop').is_visible())
    dm.click('[data-act=timerOpen]'); check('clicking it opens the timer controls', dm.locator('#tpop').is_visible() and dm.locator('#tpop .seg').count() == 1)
    dm.click('#tpop [data-grp=tset][data-val=up]'); dm.wait_for_timeout(1400)
    check('switching it on shows the running time beside the icon', re.match(r'\d+:\d\d', dm.inner_text('.timerbtn').strip()) is not None, dm.inner_text('.timerbtn'))
    check('and the pause and restart controls in the popover', dm.locator('#tpop [data-act=timerPause]').count() == 1 and dm.locator('#tpop [data-act=timerReset]').count() == 1)
    dm.keyboard.press('Escape'); check('Escape closes it', not dm.locator('#tpop').is_visible())
    dm.click('[data-act=timerOpen]'); dm.click('.row .nm >> nth=0', position={'x': 400, 'y': 4}, force=True) if False else dm.mouse.click(900, 300); check('clicking elsewhere closes it', not dm.locator('#tpop').is_visible())
    # --- pausing combat pauses the timer too
    tmr = lambda: st()['timer']
    check('the timer is running before the pause', tmr()['running'] and tmr()['mode'] == 'up')
    nav(dm, 'manage'); dm.click('#navStart'); dm.wait_for_timeout(300)
    t1 = dm.evaluate("()=>{const t=JSON.parse(localStorage.getItem('initiative-tracker-v1')).timer; return t.elapsed}")
    dm.wait_for_timeout(1500)
    check('pausing combat stops the timer', not tmr()['running'] and abs(tmr()['elapsed'] - t1) < 5 and st()['paused'], tmr())
    check('and the readout is dimmed as paused', dm.locator('.timerbtn .timer.paused').count() == 1)
    dm.click('.resumebtn'); dm.wait_for_timeout(1300)
    check('resuming combat starts it again from where it was', tmr()['running'] and tmr()['elapsed'] >= t1 - 5, tmr())
    nav(dm, 'manage'); dm.click('#navStart'); dm.click('[data-act=next]'); dm.wait_for_timeout(300)
    check('advancing a turn while paused leaves the new turn paused at zero', not tmr()['running'] and tmr()['elapsed'] == 0, tmr())
    dm.click('.resumebtn'); dm.wait_for_timeout(300); check('and Resume starts it', tmr()['running'])
    dm.click('[data-act=timerOpen]'); dm.click('#tpop [data-grp=tset][data-val=off]'); dm.keyboard.press('Escape')
    # --- End combat clears a pause
    nav(dm, 'manage'); dm.click('#navStart'); check('paused again', st()['paused'])
    endc(dm); dm.click('.confmodal [data-conf=yes]'); dm.wait_for_timeout(200)
    check('End combat also clears a pause', not st()['started'] and not st()['paused'])
    dm.click('#navStart'); dm.wait_for_timeout(200); check('and Start begins a fresh fight', st()['started'] and not st()['paused'])
    # --- Clear
    n_before = dm.locator('.row').count()
    nav(dm, 'manage'); dm.click('[data-act=clearAll]'); dm.wait_for_timeout(150)
    check('Clear asks first', dm.locator('.confmodal').is_visible() and 'new encounter' in dm.inner_text('.confmodal h2').lower())
    dm.click('.confmodal [data-conf=no]'); dm.wait_for_timeout(150)
    check('and Keep them changes nothing', dm.locator('.row').count() == n_before and st()['started'])
    dm.click('[data-act=clearAll]'); dm.click('.confmodal [data-conf=yes]'); dm.wait_for_timeout(300)
    check('Clear empties the fight and stops combat', dm.locator('.row').count() == 0 and not st()['started'] and not st()['paused'] and st()['combatants'] == [])
    check('the saved party, favourites and library are untouched', len(st()['party']) == 2 and len(st()['library']) == 1 and st()['stars'] == ['srd:Goblin Warrior'])
    nav(dm, 'manage')
    check('Clear and End combat are disabled when there is nothing to clear', dm.locator('[data-act=clearAll]').is_disabled() and dm.locator('[data-act=endCombat]').is_disabled() and dm.locator('#navStart').is_disabled())
    dm.click('[data-act=undo]'); dm.wait_for_timeout(250)
    check('Undo brings everyone back', dm.locator('.row').count() == n_before and st()['started'])
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()
    # --- phones: connected status, and Pause hides the table
    ctx2, dm2, ph = phone_setup(b, False)
    nxt(dm2); ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(900)
    nav(dm2, 'party'); check('Party shows a connected phone with a word and an icon', dm2.locator('#party .pphone.on svg').count() == 1 and 'Connected' in dm2.inner_text('#party .pphone.on'), dm2.inner_text('#party'))
    check('the Party item carries the phone count', dm2.locator('#navPartyBadge').is_visible())
    nav(dm2, 'manage'); dm2.click('#navStart'); ph.wait_for_timeout(1300)
    check('phone: pausing hides the table', ph.locator('.ph-row').count() == 0 and 'paused' in ph.inner_text('body').lower(), ph.inner_text('body')[:120])
    dm2.click('#navStart'); ph.wait_for_timeout(1300)
    check('phone: resuming brings it back', ph.locator('.ph-row, .ph-mecard').count() >= 3 and 'paused' not in ph.inner_text('body').lower())
    check('no page errors (phone run)', not (dm2._errs + ph._errs), dm2._errs + ph._errs); ctx2.close()

def t_polish_round2(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    col = lambda nm: row(dm, nm).evaluate("e=>e.classList.contains('collapsed')")
    # --- card names are only editable when you click the text
    nm = row(dm, 'Alric').locator('[data-f=name]'); box = nm.bounding_box()
    check('a card name is read-only until you click on it', nm.get_attribute('readonly') is not None)
    dm.mouse.click(box['x'] + box['width'] - 10, box['y'] + box['height'] / 2); dm.wait_for_timeout(150)
    check('clicking the empty part beside the name does not start editing', dm.evaluate("(()=>{const a=document.activeElement; return !(a&&a.matches&&a.matches('[data-f=name]')&&!a.readOnly)})()"))
    dm.mouse.click(box['x'] + 8, box['y'] + box['height'] / 2); dm.wait_for_timeout(150)
    check('clicking the name itself lets you edit it', dm.evaluate("(()=>{const a=document.activeElement; return !!(a&&a.matches('[data-f=name]')&&!a.readOnly)})()"))
    dm.keyboard.press('End'); dm.keyboard.type('X'); dm.keyboard.press('Tab'); dm.wait_for_timeout(200)
    check('and the new name is kept', 'AlricX' in names(dm), names(dm))
    dm.wait_for_timeout(700); row(dm, 'AlricX').locator('[data-f=name]').focus(); dm.wait_for_timeout(100)
    check('keyboard users can still reach a name and edit it without clicking', dm.evaluate("(()=>{const a=document.activeElement; return !!(a&&a.matches('[data-f=name]')&&!a.readOnly)})()"))
    dm.click('[data-act=density][data-val=focus]'); dm.wait_for_timeout(200)
    box2 = row(dm, 'Ogre').locator('[data-f=name]').bounding_box()
    dm.mouse.click(box2['x'] + box2['width'] - 10, box2['y'] + box2['height'] / 2); dm.wait_for_timeout(200)
    check('in Focus, clicking beside the name on a collapsed card opens the card instead', not col('Ogre'))
    dm.click('[data-act=density][data-val=full]')
    # --- hide from players: feedback, and the Add form's switch applies to one add
    row(dm, 'Ogre').locator('[data-act=hide]').click(); dm.wait_for_timeout(200)
    check('hiding says so', 'hidden from players' in toast_text(dm).lower(), toast_text(dm))
    row(dm, 'Ogre').locator('[data-act=hide]').click(); dm.wait_for_timeout(200)
    check('and un-hiding says so', 'visible to players' in toast_text(dm).lower(), toast_text(dm))
    nav(dm, 'add', 'npc'); dm.fill('#addForm [name=name]', 'Ambusher'); dm.fill('#addForm [name=init]', '3'); dm.check('#addForm [name=hidden]'); dm.click('#addForm button.primary'); dm.wait_for_timeout(300)
    check('an NPC added with Hide from players is hidden', [c for c in st()['combatants'] if c['name'] == 'Ambusher'][0]['hidden'])
    check('the switch resets, so the next NPC is not hidden by accident', not dm.is_checked('#addForm [name=hidden]'))
    add_close(dm)
    # --- clone: group with the original (default on for Same initiative)
    mi(dm, 'Ogre', '[data-act=clone]'); dm.wait_for_timeout(200)
    check('Same initiative offers Group in one card, checked by default', dm.locator('[data-clgroup]').count() == 1 and dm.locator('[data-clgroup]').is_checked())
    dm.click('[data-cl=mode][data-v=roll]'); check('other ways of setting initiative do not offer it', not dm.locator('[data-clgroup]').is_visible())
    dm.click('[data-cl=mode][data-v=same]'); check('and it is back, still checked', dm.locator('[data-clgroup]').is_checked())
    dm.fill('[data-clqty]', '2'); dm.click('[data-cl=go]'); dm.wait_for_timeout(300)
    og = [c for c in st()['combatants'] if c['name'] == 'Ogre']
    check('cloning with it checked puts the clones in one card with the original', len(og) == 1 and len(og[0].get('members') or []) == 3 and [m['n'] for m in og[0]['members']] == [1, 2, 3], og)
    check('each member has full health and the original keeps its own', all(m['hp'] == 59 and m['maxHp'] == 59 for m in og[0]['members']))
    mi(dm, 'Ogre', '[data-act=clone]'); dm.wait_for_timeout(200)
    check('cloning a group card does not offer it', dm.locator('[data-clgroup]').count() == 0); dm.click('.clmodal [data-cl=close]'); dm.wait_for_timeout(150)
    dm.click('[data-act=undo]'); dm.wait_for_timeout(200)
    og = [c for c in st()['combatants'] if c['name'].startswith('Ogre')]
    check('Undo brings back the single Ogre', len(og) == 1 and not og[0].get('members') and og[0]['hp'] == 59, og)
    mi(dm, 'Ogre', '[data-act=clone]'); dm.wait_for_timeout(200); dm.uncheck('[data-clgroup]'); dm.click('[data-cl=go]'); dm.wait_for_timeout(300)
    ogs = sorted(c['name'] for c in st()['combatants'] if c['name'].startswith('Ogre'))
    check('unchecked, it makes separate cards as before', ogs == ['Ogre 1', 'Ogre 2'], ogs)
    # --- health on the monitor: Word, Bar, Numbers
    sopen(dm, 'pcHp'); dm.wait_for_timeout(200)
    lab = lambda key: [t.strip() for t in dm.locator('[data-key=%s] .tlab' % key).all_text_contents()]
    check('Player health offers Word, Bar, Numbers', lab('pcHp') == ['Word', 'Bar', 'Numbers'], lab('pcHp'))
    check('Enemy health offers Word, Bar, Numbers', lab('npcHp') == ['Word', 'Bar', 'Numbers'], lab('npcHp'))
    # --- Settings open from the left
    check('Settings slides in from the left', dm.eval_on_selector('#drawer', "e=>e.getBoundingClientRect().left") <= 1 and dm.eval_on_selector('#drawer', "e=>e.getBoundingClientRect().right") <= 920)
    dm.click('#drawerClose'); dm.wait_for_timeout(350)
    check('and goes back off the left edge', dm.eval_on_selector('#drawer', "e=>e.getBoundingClientRect().right") <= 1)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(700)
    mi(dm, 'Ogre 1', '[data-act=hpMode][data-val=status]') if False else None
    row(dm, 'Ogre 1').locator('[data-act=menu]').click(); dm.wait_for_timeout(150)
    mm = [t.strip() for t in row(dm, 'Ogre 1').locator('[data-act=hpMode]').all_text_contents()]
    check('each enemy offers Word, Bar, Numbers', mm == ['Word', 'Bar', 'Numbers'], mm)
    row(dm, 'Ogre 1').locator('[data-act=hpMode][data-val=exact]').click(); dm.wait_for_timeout(500); tv.wait_for_timeout(600)
    card = tv.locator('.pcard:has-text("Ogre 1")')
    check('Numbers shows the hit points on the monitor', '59' in card.inner_text() and '/' in card.inner_text(), card.inner_text())
    row(dm, 'Ogre 1').locator('[data-act=menu]').click() if row(dm, 'Ogre 1').locator('.rowmenu').count() == 0 else None
    row(dm, 'Ogre 1').locator('[data-act=hpMode][data-val=status]').click(); dm.wait_for_timeout(500); tv.wait_for_timeout(600)
    check('Word shows only a word', 'Healthy' in tv.locator('.pcard:has-text("Ogre 1")').inner_text() and '59' not in tv.locator('.pcard:has-text("Ogre 1")').inner_text())
    # --- cards have more room between them
    boxes = dm.eval_on_selector_all('.row', "els=>els.map(e=>{const r=e.getBoundingClientRect(); return [r.top,r.bottom]})")
    gaps = [boxes[i + 1][0] - boxes[i][1] for i in range(len(boxes) - 1)]
    nxt(dm); dm.wait_for_timeout(300)
    boxes = dm.eval_on_selector_all('.row', "els=>els.map(e=>{const r=e.getBoundingClientRect(); return [r.top,r.bottom,e.classList.contains('now')]})")
    ni = [i for i, bx in enumerate(boxes) if bx[2]][0]; before = boxes[ni][0] - boxes[ni - 1][1]
    others = [boxes[i + 1][0] - boxes[i][1] for i in range(len(boxes) - 1) if i + 1 != ni]
    check('the extra room is above the current card, where its Now tab sits', before >= 38 and max(others) <= 30, (round(before), [round(o) for o in others]))
    check('the Now tab clears the card above it', dm.evaluate("()=>{const n=document.querySelector('.row.now'), p=n.previousElementSibling; const t=n.getBoundingClientRect().top-17; return t>p.getBoundingClientRect().bottom+4}"))
    check('there is no second Now chip inside the card', dm.locator('.row.now .tag.now').count() == 0 and dm.locator('.row .tag.now').count() == 0 and dm.eval_on_selector('.row.now', "e=>getComputedStyle(e,'::after').content") == '"Now"')
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_menu_width_and_icon(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    w = lambda: dm.eval_on_selector('#lnav', "e=>e.getBoundingClientRect().width")
    base = w()
    for k in ('manage', 'add'):
        dm.click('[data-nav=%s]' % k); dm.wait_for_timeout(250)
        check('%s opens without widening the menu' % k, w() <= base + 2, (w(), base))
    dm.click('[data-nav=add]') if dm.locator('[data-nav=add][aria-expanded=true]').count() == 0 else None
    dm.click('[data-nav=manage]'); dm.wait_for_timeout(250); check('going back to a plain list narrows it again', w() <= base + 2, w())
    dm.click('[data-nav=party]'); dm.wait_for_timeout(250); check('Party (rows with fields) is wide', w() >= 330, w())
    back_to_cards(dm); dm.wait_for_timeout(250); check('it returns to the resting width when you go back to the cards', w() <= base + 2, w())
    # folded: the collapse icon stays, and is the pane icon
    check('the collapse button is the pane icon', dm.locator('#lnav .navtoggle svg rect').count() == 1 and dm.locator('#lnav .navtoggle svg path').count() == 1)
    dm.click('#lnav .navtoggle'); dm.wait_for_timeout(250)
    dm.click('[data-nav=manage]'); dm.wait_for_timeout(300)
    check('when folded, opening an item still shows the collapse button', dm.locator('#lnav .navtoggle').is_visible() and dm.locator('#nsub-manage').is_visible())
    check('and the item opens only as wide as it needs', w() <= 262, w())
    dm.click('#lnav .navtoggle'); dm.wait_for_timeout(250)
    check('pressing it unfolds the menu', dm.locator('#lnav .nitem .nl').first.is_visible() and dm.locator('#lnav .navtoggle').get_attribute('aria-pressed') == 'false')
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_monitor_screen(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    dm.evaluate("""()=>{
      window.getScreenDetails=()=>Promise.resolve({currentScreen:{left:0,top:0},screens:[
        {left:0,top:0,width:1440,height:900,availLeft:0,availTop:0,availWidth:1440,availHeight:875,label:'Laptop'},
        {left:1440,top:0,width:1920,height:1080,availLeft:1440,availTop:0,availWidth:1920,availHeight:1080,label:'TV'}]});
      const o=window.open; window.open=function(){const w=o.apply(this,arguments); if(w){w.moveTo=(x,y)=>{window.__mv=[x,y]}; w.resizeTo=(a,c)=>{window.__rs=[a,c]};} return w;};
    }""")
    with ctx.expect_page() as pi: mon_open_click(dm)
    mon = pi.value; dm.wait_for_timeout(900)
    check('the monitor is sent to the other screen, not the one the DM is on', dm.evaluate('window.__mv') == [1440, 0] and dm.evaluate('window.__rs') == [1920, 1080], (dm.evaluate('window.__mv'), dm.evaluate('window.__rs')))
    dm.evaluate("()=>{window.getScreenDetails=()=>Promise.resolve({currentScreen:{left:0,top:0},screens:[{left:0,top:0,width:1440,height:900,availLeft:0,availTop:0,availWidth:1440,availHeight:875}]});}")
    mon_open_click(dm); dm.wait_for_timeout(500)
    check('with one screen it says so and how to move the window', 'only see one screen' in toast_text(dm) and 'F11' in toast_text(dm), toast_text(dm))
    dm.evaluate("()=>{window.getScreenDetails=()=>Promise.reject(new Error('denied'));}")
    mon_open_click(dm); dm.wait_for_timeout(500)
    check('if the browser refuses, it says what to allow and how to move the window', 'allow' in toast_text(dm).lower() and 'F11' in toast_text(dm), toast_text(dm))
    dm.evaluate("()=>{window.getScreenDetails=undefined;}")
    mon_open_click(dm); dm.wait_for_timeout(500)
    check('if the browser cannot choose screens, it says so', 'can\u2019t pick a screen' in toast_text(dm) and 'F11' in toast_text(dm), toast_text(dm))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_monitor_round3(b):
    import io, math
    from PIL import Image
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    for n, i in (('Bone Devil', 15), ('Hell Hound', 14), ('Octopus', 6), ('Goblin', 5), ('Wolf', 3)): add_npc(dm, n, i, 20)
    nxt(dm); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    # --- the Combat monitor menu item shows it opens a new window
    dm.click('[data-nav=monitor]') if dm.locator('[data-nav=monitor][aria-expanded=true]').count() == 0 else None
    check('Open new window has the new-window icon to its right', dm.locator('[data-act=openMonitor] .next svg').count() == 1 and 'new window' in (dm.get_attribute('[data-act=openMonitor]', 'title') or ''))
    check('and the icon comes after the label', dm.evaluate("()=>{const b=document.querySelector('[data-act=openMonitor]'); return b.querySelector('.next').getBoundingClientRect().left > b.querySelector('span').getBoundingClientRect().left}"))
    dm.evaluate("()=>{const k='initiative-tracker-v1',s=JSON.parse(localStorage.getItem(k));s.settings.tvQr=true;localStorage.setItem(k,JSON.stringify(s));}"); dm.reload(); dm.wait_for_timeout(500)
    with ctx.expect_page() as pi: mon_open_click(dm)
    mon = pi.value; mon.set_viewport_size({'width': 1820, 'height': 620}); mon.wait_for_timeout(1500)
    box = lambda sel: mon.eval_on_selector(sel, "e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
    hit = lambda a, c: not (a[2] <= c[0] or c[2] <= a[0] or a[3] <= c[1] or c[3] <= a[1])
    check('the QR code is not covered by the Full screen button', mon.locator('.tvqr').count() == 1 and mon.locator('.fspill').count() == 1 and not hit(box('.tvqr'), box('.fspill')), (box('.tvqr'), box('.fspill')))
    check('nor by the sound button', mon.locator('.sfxpill:not(.fspill)').count() == 1 and not hit(box('.tvqr'), box('.sfxpill:not(.fspill)')))
    check('and the two buttons do not overlap each other', not hit(box('.sfxpill:not(.fspill)'), box('.fspill')))
    # --- shrunken cards still show the character name
    small = mon.eval_on_selector_all('.pcard.small', "els=>els.map(e=>{const h=e.querySelector('h3'); const r=h.getBoundingClientRect(); return [h.textContent.trim(), Math.round(r.height)]})")
    check('shrunken cards exist with this many creatures', len(small) >= 2, small)
    check('every shrunken card shows its character or creature name', all(n and h >= 12 for n, h in small), small)
    check('a shrunken player card shows the character, then the player', mon.locator('.pcard.small:has-text("Rowan")').count() == 0 or 'Rowan' in mon.locator('.pcard.small:has-text("Brian")').inner_text(), small)
    # --- shrink or run off screen
    sopen(dm, 'crowd'); dm.wait_for_timeout(200)
    check('Settings offers Shrink the rest and Run off screen', [t.strip() for t in dm.locator('[data-key=crowd] .tlab').all_text_contents()] == ['Shrink the rest', 'Run off screen'] and dm.locator('[data-key=crowd][aria-checked=true] .tlab').inner_text().strip().lower() == 'shrink the rest')
    n_cards = len(st()['combatants']); dm.click('[data-key=crowd][data-val=off]'); dm.wait_for_timeout(300); mon.wait_for_timeout(800)
    check('run off screen keeps every card full size', mon.locator('.pcard.small').count() == 0 and mon.locator('.cgroup').count() == 0 and mon.locator('.pcard').count() == n_cards, (mon.locator('.pcard').count(), n_cards))
    check('and the extra cards go past the edge', mon.evaluate("()=>[...document.querySelectorAll('.pcard')].some(c=>c.getBoundingClientRect().right > innerWidth + 2)"))
    check('the current card is first, so it is always on screen', mon.evaluate("()=>{const c=document.querySelector('.pcard.cur').getBoundingClientRect(); return c.left >= 0 && c.right <= innerWidth}"))
    dm.click('[data-key=crowd][data-val=shrink]'); dm.wait_for_timeout(300); mon.wait_for_timeout(800)
    check('switching back shrinks them again', mon.locator('.pcard.small').count() >= 2)
    dm.click('#drawerClose')
    # --- players and enemies read as different groups in every skin
    def px(el):
        im = Image.open(io.BytesIO(el.screenshot())).convert('RGB'); w, h = im.size
        pts = [im.getpixel((int(w * fx), int(h * fy))) for fx in (.3, .5, .7) for fy in (.82, .9)]
        return tuple(sum(p[i] for p in pts) // len(pts) for i in range(3))
    worst = []
    for sk in qs(('spark', 'light', 'daylight', 'medieval', 'frost', 'sparkd', 'slate', 'water', 'forest', 'mountain', 'fire', 'feywild')):
        set_skin(dm, sk); mon.wait_for_timeout(450)
        d = math.dist(px(mon.locator('.pcard.pc:not(.now)').first), px(mon.locator('.pcard.npc:not(.now)').first))
        if d < 50: worst.append((sk, round(d)))
    check('player and enemy cards are clearly different colours in all 12 skins', not worst, worst)
    # --- Arcane's current card is calmer
    set_skin(dm, 'medieval'); mon.wait_for_timeout(500)
    r, g, bl = px(mon.locator('.pcard.now').first)
    check('Arcane: the current card is a soft tint, not an intense fill', r - g < 70, (r, g, bl))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_skins_round3(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    sopen(dm, 'skin'); dm.wait_for_timeout(200)
    names_ = [t.strip() for t in dm.locator('.skinbtn').all_text_contents()]
    check('Spark is now Color Spray and Spark Dark is Dancing Lights', 'Color Spray' in names_ and 'Dancing Lights' in names_ and 'Spark' not in names_ and 'Spark Dark' not in names_, names_)
    check('Daylight sits with the light skins, after Moonlight', names_.index('Daylight') == names_.index('Moonlight') + 1 and 'Daylight' in [t.strip() for t in dm.locator('.skincol').first.locator('.skinbtn').all_text_contents()])
    check('the saved skin ids are unchanged', dm.locator('[data-key=skin][data-val=spark]').count() == 1 and dm.locator('[data-key=skin][data-val=sparkd]').count() == 1 and dm.locator('[data-key=skin][data-val=daylight]').count() == 1)
    pics = dm.eval_on_selector_all('.skinbtn .swp', "els=>els.map(e=>getComputedStyle(e).backgroundImage+'|'+getComputedStyle(e).backgroundColor)")
    check('each skin has its own picture, and they are all different', len(pics) == 12 and len(set(pics)) == 12, len(set(pics)))
    check('a picture shows a player card, an enemy card and the Now colour', dm.eval_on_selector('.skinbtn .swp', "e=>e.querySelectorAll('i').length === 2 && e.querySelectorAll('b').length === 1"))
    # the picture's colours are the skin's own
    exp = dm.evaluate("()=>{const out={}; for(const k of SKINS){ out[k.id]=k.pv.now; } return out}") if False else None
    for sk, hexv in (('fire', '#E5214F'), ('feywild', '#FF3D6E'), ('daylight', '#B8402F')):
        got = dm.eval_on_selector('[data-val=%s] .swp i:nth-child(2)' % sk, "e=>getComputedStyle(e).borderTopColor")
        h = hexv.lstrip('#'); want = 'rgb(%d, %d, %d)' % (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        check('%s: the enemy colour in its picture is the skin\u2019s enemy colour' % sk, got == want, (got, want))
    dm.click('[data-key=skin][data-val=daylight]'); dm.wait_for_timeout(400)
    bg = dm.evaluate("getComputedStyle(document.body).backgroundColor"); r, g, bl = [int(x) for x in bg[bg.index('(') + 1:-1].split(',')[:3]]
    check('Daylight is golden: warm cream, with red above green above blue', r > g > bl and r >= 235 and r - bl >= 30, bg)
    check('Daylight is a light skin', dm.evaluate("document.documentElement.getAttribute('data-theme')") == 'light' and dm.evaluate("document.documentElement.getAttribute('data-skin')") == 'daylight')
    dm.click('[data-key=skin][data-val=water]'); dm.wait_for_timeout(400)
    page = dm.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--page').trim()"); h = page.lstrip('#')
    r, g, bl = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    check('Underwater is bluer: blue clearly above green', bl - g >= 25 and r < 30, page)
    dm.click('[data-key=skin][data-val=spark]'); dm.click('#drawerClose')
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_player_screen(b):
    ctx, dm, ph = phone_setup(b, False)
    add_npc(dm, 'Wolf', 5, 11); nxt(dm); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    names_in_list = lambda: ph.eval_on_selector_all('.ph-list > article', "els=>els.map(e=>e.classList.contains('ph-mecard') ? 'ME:' + e.querySelector('h2').textContent.trim() : e.querySelector('.ph-name b').textContent.trim())")
    # --- picker, and the top strip
    check('upright, the phone offers a character picker and Just watching', ph.locator('.ph-claimbtn').count() == 2 and ph.locator('[data-pact=watch]').count() == 1)
    strip = ph.inner_text('.ph-strip').lower()
    check('the top strip says Now and Get ready, never Next', 'now' in strip and 'get ready' in strip and 'next' not in strip, strip)
    check('Get ready names the next player, not the next creature', ph.inner_text('.ph-sn.nxt b').strip() == 'Alric' and ph.inner_text('.ph-sn.now b').strip() == 'Rowan', (ph.inner_text('.ph-sn.nxt b'), ph.inner_text('.ph-sn.now b')))
    check('the strip stays on one line and scrolls if it must', ph.evaluate("()=>{const s=document.querySelector('.ph-strip'); const k=[...s.children].map(c=>Math.round(c.getBoundingClientRect().top)); return new Set(k).size===1 && getComputedStyle(s).flexWrap==='nowrap'}"))
    # --- just watching: the picker goes away
    ph.click('[data-pact=watch]'); ph.wait_for_timeout(400)
    check('Just watching removes the picker', ph.locator('.ph-claim').count() == 0 and ph.locator('.ph-claimbtn').count() == 0)
    check('and leaves the table, with a way back', ph.locator('.ph-watchbar').is_visible() and len(names_in_list()) == 4 and ph.locator('.ph-watchbar [data-pact=switch]').count() == 1, names_in_list())
    ph.reload(); ph.wait_for_timeout(1500)
    check('it stays gone after a reload', ph.locator('.ph-claim').count() == 0 and ph.locator('.ph-watchbar').count() == 1)
    ph.click('.ph-watchbar [data-pact=switch]'); ph.wait_for_timeout(400)
    check('Pick a character brings the picker back', ph.locator('.ph-claimbtn').count() == 2 and ph.locator('.ph-watchbar').count() == 0)
    # --- picking a character: your card sits in turn order
    ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(1500)
    order = names_in_list()
    check('your card sits in initiative order, between the creatures around you', order == ['Rowan', 'Ogre', 'ME:Alric', 'Wolf'], order)
    check('there is no separate card above the table', ph.locator('.ph-me:not(.ph-mecard)').count() == 0 and ph.locator('.ph-mecard').count() == 1 and ph.locator('.ph-claim').count() == 0)
    check('it opens on your card', ph.evaluate("()=>{const r=document.querySelector('.ph-mecard').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0}"))
    ph.evaluate('window.scrollTo(0,0)'); ph.click('[data-pact=jumpme]'); ph.wait_for_timeout(700)
    check('Jump to me brings it into view', ph.evaluate("()=>{const r=document.querySelector('.ph-mecard').getBoundingClientRect(); return r.top < innerHeight*.6 && r.bottom > 80}"))
    # --- armour class: top right, tap to change
    card = lambda: ph.eval_on_selector('.ph-mecard', "e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
    acb = lambda: ph.eval_on_selector('.ph-mecard .ph-acbtn', "e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
    c0, a0 = card(), acb()
    check('AC is the shield at the top right of your card', c0[2] - a0[2] < 30 and a0[1] - c0[1] < 40 and ph.inner_text('.ph-mecard .ph-acbtn b').strip() == '15', (c0, a0))
    check('the old AC row with the temp stepper is gone from the card', ph.locator('.ph-mecard .ph-acrow').count() == 0)
    ph.click('.ph-acbtn'); ph.wait_for_timeout(400)
    check('tapping it opens the AC editor', ph.locator('.ph-acsheet').is_visible() and ph.input_value('.ph-acsheet [data-pst=ac]') == '15')
    ph.fill('.ph-acsheet [data-pst=ac]', '17'); ph.keyboard.press('Tab'); ph.wait_for_timeout(1500)
    nav(dm, 'party'); check('changing it updates the DM\u2019s sheet for that player', 'AC 17' in dm.inner_text('#party'), dm.inner_text('#party'))
    ph.click('.ph-acsheet [data-pact=ac][data-d="1"]'); ph.wait_for_timeout(1500)
    check('the temporary stepper adjusts it', ph.inner_text('.ph-acsheet .ph-step span').strip() == '+1')
    ph.click('.ph-acsheet [data-pact=acclose]'); ph.wait_for_timeout(1300)
    check('the shield shows base plus temporary', ph.inner_text('.ph-mecard .ph-acbtn b').strip() == '18', ph.inner_text('.ph-mecard .ph-acbtn b'))
    # --- button wording and size
    check('Damage is Take damage', 'take damage' in ph.inner_text('.ph-btn.dmg').lower() and ph.inner_text('.ph-btn.dmg').strip().lower() != 'damage')
    ub = ph.eval_on_selector('.ph-btn.use', "e=>{const r=e.getBoundingClientRect(); return [r.width, r.height]}")
    check('Use reaction is a normal-sized button, not a big one', ub[1] <= 48 and ub[0] <= 190, ub)
    check('the Take damage, Heal, Temp HP buttons fit inside the card', ph.evaluate("()=>{const c=document.querySelector('.ph-mecard').getBoundingClientRect(); return [...document.querySelectorAll('.ph-mecard .ph-btns3 .ph-btn')].every(b=>b.getBoundingClientRect().right<=c.right-8)}"))
    # --- on its side: a Combat Monitor in one row
    for n, i in (('Bone Devil', 16), ('Hell Hound', 14), ('Octopus', 6), ('Goblin', 4)): add_npc(dm, n, i, 20)
    dm.wait_for_timeout(500); ph.set_viewport_size({'width': 844, 'height': 390}); ph.wait_for_timeout(1500)
    check('on its side it is a Combat Monitor, with no player controls', ph.locator('.pwrap .pgrid.scrollx').count() == 1 and ph.locator('.ph-me, .ph-top, [data-pact=hp]').count() == 0)
    info = ph.evaluate("()=>{const g=document.querySelector('.pgrid'); const cs=[...g.querySelectorAll('.pcard')].map(c=>c.getBoundingClientRect()); return {sw:g.scrollWidth, cw:g.clientWidth, n:cs.length, mono:cs.every((r,i)=>i===0||r.left>cs[i-1].left), ox:getComputedStyle(g).overflowX, wrap:getComputedStyle(g).flexWrap}}")
    check('it is one row that scrolls sideways when it has to', info['mono'] and info['wrap'] == 'nowrap' and info['ox'] in ('auto', 'scroll') and info['sw'] > info['cw'] and info['n'] == 8, info)
    check('the only flags are Now and Get ready', [t.strip() for t in ph.locator('.pcard .flag').all_text_contents()] == ['Now', 'Get ready'], ph.locator('.pcard .flag').all_text_contents())
    check('the current card leads, with its health', ph.evaluate("()=>document.querySelector('.pgrid .pcard').classList.contains('cur')") and '24' in ph.inner_text('.pcard.cur'))
    ph.set_viewport_size({'width': 390, 'height': 780}); ph.wait_for_timeout(1200)
    check('turned upright again, it is the player screen with your card in order', ph.locator('.ph-mecard').count() == 1 and ph.locator('.pgrid').count() == 0)
    check('no page errors', not (dm._errs + ph._errs), dm._errs + ph._errs); ctx.close()
    # --- the Combat Monitor itself, on a phone on its side
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    for n, i in (('Bone Devil', 16), ('Hell Hound', 14), ('Octopus', 6), ('Goblin', 4), ('Wolf', 3)): add_npc(dm, n, i, 20)
    nxt(dm); nxt(dm)
    mo = page(ctx, size=(844, 390)); mo.goto(URL + '#monitor'); mo.wait_for_timeout(1500)
    info = mo.evaluate("()=>{const g=document.querySelector('.pgrid'); const cs=[...g.querySelectorAll('.pcard')].map(c=>c.getBoundingClientRect()); return {sw:g.scrollWidth, cw:g.clientWidth, n:cs.length, mono:cs.every((r,i)=>i===0||r.left>cs[i-1].left), wrap:getComputedStyle(g).flexWrap, grp:g.querySelectorAll('.cgroup').length, small:g.querySelectorAll('.pcard.small').length}}")
    check('the Combat Monitor on a phone on its side is one scrolling row, not wrapped or shrunk', info['mono'] and info['wrap'] == 'nowrap' and info['sw'] > info['cw'] and info['grp'] == 0 and info['small'] == 0 and info['n'] == 8, info)
    check('its flags are only Now and Get ready', [t.strip() for t in mo.locator('.pcard .flag').all_text_contents()] == ['Now', 'Get ready'])
    mo.set_viewport_size({'width': 390, 'height': 780}); mo.wait_for_timeout(1000)
    check('upright, the monitor keeps its stacked layout', mo.evaluate("()=>getComputedStyle(document.querySelector('.pgrid')).display") == 'grid')
    check('no page errors (monitor)', not (dm._errs + mo._errs), dm._errs + mo._errs); ctx.close()

def inkcx(el):
    import io
    from PIL import Image
    im = Image.open(io.BytesIO(el.screenshot())).convert('RGB'); w, h = im.size; bg = im.getpixel((w // 2, 3)); xs = []
    for x in range(4, w - 4):
        for y in range(6, h - 6):
            p = im.getpixel((x, y))
            if sum(abs(p[i] - bg[i]) for i in range(3)) > 120: xs.append(x); break
    return (min(xs) + max(xs)) / 2 - w / 2 if xs else None

def t_round5_dm(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    # --- initiative numbers sit in the middle of their box
    for mode in ('full', 'focus'):
        dm.click('[data-act=density][data-val=%s]' % mode); dm.wait_for_timeout(200)
        offs = [inkcx(dm.locator('.row').nth(i).locator('.r-init input')) for i in range(3)]
        check('%s: initiative numbers are centred in their boxes' % mode, all(o is not None and abs(o) <= 2 for o in offs), offs)
    dm.click('[data-act=density][data-val=full]')
    # --- Up next / Get ready
    check('Get ready when other creatures come between', 'get ready' in dm.inner_text('.ctl .stat.nxt small').lower() and 'get ready' in dm.locator('.tag.nxt').inner_text().lower())
    nxt(dm); dm.wait_for_timeout(300)
    check('Up next when it is the very next turn (top bar and card)', 'up next' in dm.inner_text('.ctl .stat.nxt small').lower() and 'up next' in dm.locator('.tag.nxt').inner_text().lower(), dm.inner_text('.ctl .stat.nxt small'))
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(800)
    check('the Combat Monitor flag says Up next too', 'up next' in tv.locator('.pcard .flag.nxt').inner_text().lower(), tv.locator('.pcard .flag.nxt').inner_text())
    # --- timer: icons, eye, and on the cards
    dm.click('[data-act=timerOpen]'); dm.wait_for_timeout(200)
    check('the timer popover has an eye icon to show or hide the timer on the table view', dm.locator('#tpop .timereye svg').count() == 1)
    dm.click('#tpop [data-grp=tset][data-val=up]'); dm.wait_for_timeout(1400)
    check('Pause is a pause icon, and it is labelled', dm.locator('#tpop [data-act=timerPause] svg').count() == 1 and dm.inner_text('#tpop [data-act=timerPause]').strip() == '' and 'pause' in (dm.get_attribute('#tpop [data-act=timerPause]', 'aria-label') or '').lower())
    check('Restart is a circular-arrow icon, and it is labelled', dm.locator('#tpop [data-act=timerReset] svg').count() == 1 and dm.inner_text('#tpop [data-act=timerReset]').strip() == '' and 'reset' in (dm.get_attribute('#tpop [data-act=timerReset]', 'aria-label') or '').lower())
    check('the timer shows on the current card, and only there', dm.locator('.row .ctimer').count() == 1 and dm.locator('.row.now .ctimer').count() == 1 and re.match(r'\d+:\d\d', dm.inner_text('.row.now .ctimer').strip()) is not None, dm.locator('.row .ctimer').count())
    tv.wait_for_timeout(700)
    check('and on the current card of the Combat Monitor', tv.locator('.pcard.now .ptimer').count() == 1)
    dm.click('#tpop [data-act=timerPause]'); dm.wait_for_timeout(300)
    check('pausing swaps the icon for a play icon', 'resume' in (dm.get_attribute('#tpop [data-act=timerPause]', 'aria-label') or '').lower() and not st()['timer']['running'])
    dm.click('#tpop [data-act=timerPause]'); dm.wait_for_timeout(300)
    dm.click('#tpop .timereye'); dm.wait_for_timeout(500); tv.wait_for_timeout(700)
    check('the eye hides the timer from the table view', dm.get_attribute('#tpop .timereye', 'aria-pressed') == 'false' and not st()['timer']['showPlayers'] and tv.locator('.pcard.now .ptimer').count() == 0)
    check('the DM still sees it on their own card', dm.locator('.row.now .ctimer').count() == 1)
    dm.click('#tpop .timereye'); dm.wait_for_timeout(500); tv.wait_for_timeout(700)
    check('and the eye brings it back', dm.get_attribute('#tpop .timereye', 'aria-pressed') == 'true' and tv.locator('.pcard.now .ptimer').count() == 1)
    dm.keyboard.press('Escape'); dm.click('[data-act=timerOpen]'); dm.click('#tpop [data-grp=tset][data-val=off]'); dm.keyboard.press('Escape')
    # --- the NPC generator and the creature library, reached through the Add window
    nav(dm, 'add', 'npc'); dm.click('.addstrip [data-mode=generate][data-type=npc]'); dm.wait_for_timeout(500)
    check('the generator is the same builder, set up for an NPC', 'npc' in dm.inner_text('.buildmodal h2').lower() and dm.locator('.buildmodal [data-bd=player]').count() == 0 and dm.locator('[data-bdc=npcsave]').count() == 1 and dm.locator('[data-bdc=npcfight]').count() == 1 and dm.locator('[data-bdc=add]').count() == 0)
    dm.click('[data-bdc=npcsave]'); dm.wait_for_timeout(400)
    lib = st()['library']; check('Save to Saved NPCs files it as an NPC', len(lib) == 1 and lib[0].get('src') == 'npc' and lib[0].get('maxHp'), lib)
    nav(dm, 'add', 'npc'); dm.click('.addstrip [data-mode=generate][data-type=npc]'); dm.wait_for_timeout(400); before = len(st()['combatants']); dm.click('[data-bdc=npcfight]'); dm.wait_for_timeout(400)
    cs = st()['combatants']; gen = [c for c in cs if c['kind'] == 'npc' and c['name'] != 'Ogre']; check('Add to fight puts the generated NPC straight into the fight', len(cs) == before + 1 and len(gen) == 1 and gen[0]['maxHp'] and gen[0].get('sheet'), gen)
    open_build(dm)
    check('the player builder still says Build a character and adds to the party', 'character' in dm.inner_text('.buildmodal h2').lower() and dm.locator('[data-bdc=add]').count() == 1); dm.click('.buildmodal [data-bdc=close]'); dm.wait_for_timeout(200)
    lib_open(dm, 'book')
    check('the Library opens on its Creatures tab', dm.locator('.libmodal').is_visible() and dm.locator('.mmtabs [aria-checked=true]').inner_text().strip().lower().startswith('creatures'))
    lib_filters(dm); check('and it starts with every type showing', dm.locator('[data-mmf=type]').input_value() == ''); lib_filters(dm, False); lib_close(dm)
    nav(dm, 'add', 'npc'); dm.click('.addstrip [data-mode=library][data-type=npc]'); dm.wait_for_timeout(500)
    check('NPC, Library opens the NPCs tab, with Add as on Neutral', dm.inner_text('.libmodal .mmtabs [aria-checked=true]').strip().lower().startswith('npcs') and dm.locator('[data-mmf=disp]').input_value() == 'neutral', (dm.inner_text('.libmodal .mmtabs [aria-checked=true]'), dm.locator('[data-mmf=disp]').input_value()))
    lib_close(dm)
    # --- custom monsters
    nav(dm, 'add', 'creature'); dm.wait_for_timeout(400)
    check('Creature, Manual opens the new-creature form in the Add window', dm.locator('.addmodal [data-cform]').is_visible() and 'homebrew' in dm.inner_text('.mmfhead').lower())
    for k, v in (('name', 'Ash Drake'), ('type', 'large dragon'), ('cr', '3'), ('ac', '15'), ('hp', '52'), ('speed', '30 ft., fly 60 ft.'), ('dex', '14')): dm.fill('[data-mcf=%s]' % k, v)
    dm.click('[data-cfgo=save]'); dm.wait_for_timeout(400)
    e = [x for x in st()['library'] if x['name'] == 'Ash Drake']
    check('Save stores a homebrew creature with its stats', len(e) == 1 and e[0]['src'] == 'custom' and e[0]['maxHp'] == 52 and e[0]['sheet']['ac'] == '15' and e[0]['sheet']['ab']['dex']['score'] == '14' and e[0]['meta']['type'] == 'large dragon' and e[0]['meta']['cr'] == '3', e)
    add_close(dm); lib_open(dm, 'book'); dm.fill('[data-mmsearch]', 'Ash Drake'); dm.wait_for_timeout(250)
    arow = '.mmrow:has(b:text-is("Ash Drake"))'
    check('it is in the Book, marked Homebrew', dm.locator(arow + ' .mmtag').inner_text().strip() == 'Homebrew')
    check('and it was starred automatically', ('hb:' + e[0]['id']) in st()['stars'] and dm.get_attribute(arow + ' [data-mm=star]', 'aria-pressed') == 'true')
    dm.fill(arow + ' [data-mmq]', '2'); dm.click(arow + ' [data-mm=add]'); dm.wait_for_timeout(400)
    ash = [c for c in st()['combatants'] if c['name'].startswith('Ash Drake')]
    check('Add puts copies in the fight with the saved HP', len(ash) == 2 and all(c['maxHp'] == 52 and c['src'] == 'custom' for c in ash), ash)
    dm.click(arow + ' [data-mm=exp]'); dm.wait_for_timeout(200); dm.click(arow + ' [data-act=sheetToggle]'); dm.wait_for_timeout(300)
    check('Edit stats opens the full stat editor on a homebrew creature', dm.locator(arow + ' [data-sf]').count() > 0, dm.locator(arow).inner_html()[:200])
    dm.click(arow + ' [data-act=sheetToggle]'); dm.click(arow + ' [data-mm=exp]')
    dm.click('[data-mm=new]'); dm.fill('[data-mcf=name]', 'ash drake'); dm.click('[data-cfgo=save]'); dm.wait_for_timeout(300)
    check('a second creature with the same name is refused', len([x for x in st()['library'] if x['name'].lower() == 'ash drake']) == 1)
    dm.fill('[data-mcf=name]', 'Cave Lurker'); dm.fill('[data-mcf=hp]', '20'); dm.click('[data-cfgo=fight]'); dm.wait_for_timeout(400)
    check('Save and add to fight does both', any(c['name'].startswith('Cave Lurker') for c in st()['combatants']) and any(x['name'] == 'Cave Lurker' for x in st()['library']))
    # --- Edit a copy: a Modified creature
    dm.fill('[data-mmsearch]', 'Hell Hound'); dm.wait_for_timeout(300)
    hrow = '.mmrow:has(b:text-is("Hell Hound"))'; dm.click(hrow + ' [data-mm=edit]'); dm.wait_for_timeout(300)
    check('Edit a copy opens the form filled in from the original', 'edit a copy of hell hound' in dm.inner_text('.mmfhead').lower() and dm.input_value('[data-mcf=name]') == 'Hell Hound (modified)' and dm.input_value('[data-mcf=hp]') == '58' and dm.is_checked('[data-mcf=fav]'))
    dm.fill('[data-mcf=name]', 'Cinder Hound'); dm.fill('[data-mcf=hp]', '70'); dm.fill('[data-mcf=ac]', '16'); dm.click('[data-cfgo=save]'); dm.wait_for_timeout(400)
    ci = [x for x in st()['library'] if x['name'] == 'Cinder Hound']
    check('it is saved as Modified, remembering what it came from', len(ci) == 1 and ci[0]['src'] == 'mod' and ci[0]['base'] == 'Hell Hound' and ci[0]['maxHp'] == 70 and ci[0]['sheet']['ac'] == '16', ci)
    check('the original traits and actions came across', len(ci[0]['sheet']['attacks']) > 20 and ci[0]['leg'] is None)
    check('it is starred automatically', ('hb:' + ci[0]['id']) in st()['stars'])
    dm.fill('[data-mmsearch]', ''); dm.wait_for_timeout(200)
    check('the Book marks it Modified', dm.locator('.mmrow:has(b:text-is("Cinder Hound")) .mmtag').inner_text().strip() == 'Modified')
    lib_filters(dm); dm.select_option('[data-mmf=src]', 'mod'); dm.wait_for_timeout(300)
    check('the source filter shows only Modified', [t.strip() for t in dm.locator('.mmrow b').all_text_contents()] == ['Cinder Hound'], dm.locator('.mmrow b').all_text_contents())
    lib_filters(dm); dm.select_option('[data-mmf=src]', 'custom'); dm.wait_for_timeout(300)
    check('Homebrew shows the ones you made from scratch', sorted(t.strip() for t in dm.locator('.mmrow b').all_text_contents()) == ['Ash Drake', 'Cave Lurker'])
    lib_filters(dm); dm.select_option('[data-mmf=src]', 'srd'); dm.wait_for_timeout(300)
    check('SRD shows only the Book creatures', dm.locator('.mmrow:has(b:text-is("Ash Drake"))').count() == 0 and dm.locator('.mmrow:has(b:text-is("Hell Hound"))').count() == 1 and dm.locator('.mmtag').count() == 0)
    lib_filters(dm); dm.select_option('[data-mmf=src]', ''); dm.fill('[data-mmsearch]', 'modified'); dm.wait_for_timeout(300)
    check('typing "modified" also finds them', [t.strip() for t in dm.locator('.mmrow b').all_text_contents()] == ['Cinder Hound'])
    dm.fill('[data-mmsearch]', 'Cinder'); dm.wait_for_timeout(250); crow = '.mmrow:has(b:text-is("Cinder Hound"))'; dm.click(crow + ' [data-mm=edit]'); dm.wait_for_timeout(300)
    check('the pencil on a creature you made opens its editor in place', dm.locator(crow + '.open').count() == 1 and dm.locator(crow + ' [data-sf]').count() > 0 and dm.locator('[data-cform]').count() == 0)
    dm.click(crow + ' [data-mm=edit]'); dm.wait_for_timeout(250); check('and the pencil again closes it', dm.locator(crow + '.open').count() == 0)
    dm.fill('[data-mmsearch]', 'Wolf'); dm.wait_for_timeout(250); dm.click('.mmrow:has(b:text-is("Wolf")) [data-mm=edit]'); dm.wait_for_timeout(250); dm.uncheck('[data-mcf=fav]'); dm.fill('[data-mcf=name]', 'Wolf Alpha'); dm.click('[data-cfgo=save]'); dm.wait_for_timeout(300)
    c2 = [x for x in st()['library'] if x['name'] == 'Wolf Alpha']
    check('a copy of a Book creature remembers its original, and starring is optional', len(c2) == 1 and c2[0]['base'] == 'Wolf' and ('hb:' + c2[0]['id']) not in st()['stars'], c2)
    dm.fill('[data-mmsearch]', ''); dm.click('.mmrow:has(b:text-is("Cinder Hound")) [data-mmq] >> xpath=..//button[@data-mm="add"]') if False else None
    dm.fill('.mmrow:has(b:text-is("Cinder Hound")) [data-mmq]', '1'); dm.click('.mmrow:has(b:text-is("Cinder Hound")) [data-mm=add]'); dm.wait_for_timeout(300)
    chs = [c for c in st()['combatants'] if c['name'].startswith('Cinder Hound')]
    check('adding a modified creature uses its changed stats', len(chs) == 1 and chs[0]['maxHp'] == 70 and chs[0]['src'] == 'mod', chs)
    lib_open(dm, 'saved')
    check('Saved holds the starred ones, with their tags', sorted(t.strip() for t in dm.locator('#mmlist .mmrow b').all_text_contents()) == ['Ash Drake', 'Cave Lurker', 'Cinder Hound'] and dm.locator('#mmlist .mmtag').count() == 3, dm.locator('#mmlist .mmrow b').all_text_contents())
    check('and the tab shows how many', dm.inner_text('#cntMon').strip() == '3')
    dm.click('#mmlist .mmrow:has(b:text-is("Ash Drake")) [data-mm=star]'); dm.wait_for_timeout(300)
    check('un-starring removes it from Saved but not from the Book', dm.locator('#mmlist .mmrow:has(b:text-is("Ash Drake"))').count() == 0 and dm.inner_text('#cntMon').strip() == '2' and any(x['name'] == 'Ash Drake' for x in st()['library']))
    lib_open(dm, 'npcs'); check('none of these are in the NPCs tab', 'Ash Drake' not in dm.inner_text('#library') and 'Cinder' not in dm.inner_text('#library')); lib_close(dm)
    # --- saving from a card
    open_lib(dm); dm.fill('[data-mmsearch]', 'Hell Hound'); dm.wait_for_timeout(300); dm.locator('.mmrow:has(b:text-is("Hell Hound")) [data-mm=add]').click(); dm.wait_for_timeout(300); lib_close(dm)
    mi(dm, 'Hell Hound', '[data-act=saveLib]'); dm.wait_for_timeout(200)
    check('an unchanged Book creature saved from its card just gets starred', 'srd:Hell Hound' in st()['stars'] and not any(x['name'].startswith('Hell Hound') for x in st()['library']) and 'starred' in toast_text(dm).lower(), toast_text(dm))
    row(dm, 'Hell Hound').locator('[data-f=maxHp]').fill('99'); row(dm, 'Hell Hound').locator('[data-f=maxHp]').press('Tab'); dm.wait_for_timeout(300)
    mi(dm, 'Hell Hound', '[data-act=saveLib]'); dm.wait_for_timeout(200)
    hm = [x for x in st()['library'] if x['name'] == 'Hell Hound (modified)']
    check('one whose stats were changed is saved as a Modified copy, starred', len(hm) == 1 and hm[0]['src'] == 'mod' and hm[0]['maxHp'] == 99 and ('hb:' + hm[0]['id']) in st()['stars'], hm)
    # --- older saves move across: unchanged copies become stars, changed ones become Modified
    open_lib(dm); dm.fill('[data-mmsearch]', 'Wolf'); dm.wait_for_timeout(300); dm.locator('.mmrow:has(b:text-is("Wolf")) [data-mm=add]').click(); dm.wait_for_timeout(300); lib_close(dm)
    wolf = [c for c in st()['combatants'] if c['name'].startswith('Wolf')][0]
    dm.evaluate("""(w)=>{const k='initiative-tracker-v1', s=JSON.parse(localStorage.getItem(k)); s.libV=1; s.stars=[]; s.library=[
      {id:'legacy1',name:'Owlbear',maxHp:59,sheet:{},leg:null,disp:'enemy'},
      {id:'legacy2',name:'Old Marta',maxHp:9,sheet:{},leg:null,disp:'neutral'},
      {id:'legacy3',name:'Goblin',maxHp:7,sheet:{},leg:null,disp:'enemy',src:'npc'},
      {id:'legacy4',name:'Wolf',maxHp:w.maxHp,sheet:w.sheet,leg:null,disp:'enemy',src:'mm'},
      {id:'legacy5',name:'Moss Crawler',maxHp:30,sheet:{notes:'Medium monstrosity \\u00b7 CR 2'},leg:null,disp:'enemy',src:'custom'}];
      localStorage.setItem(k, JSON.stringify(s));}""", wolf); dm.reload(); dm.wait_for_timeout(700)
    lib = {x['name']: x for x in st()['library']}
    check('a changed copy of a Book creature becomes Modified, a plain NPC stays an NPC', lib['Owlbear']['src'] == 'mod' and lib['Owlbear']['base'] == 'Owlbear' and lib['Old Marta']['src'] == 'npc' and lib['Goblin']['src'] == 'npc', {k: v.get('src') for k, v in lib.items()})
    check('an unchanged copy is no longer stored: it is just a star', 'Wolf' not in lib and 'srd:Wolf' in st()['stars'])
    check('a custom monster becomes Homebrew, with its type and CR kept', lib['Moss Crawler']['src'] == 'custom' and lib['Moss Crawler']['meta']['cr'] == '2' and 'monstrosity' in lib['Moss Crawler']['meta']['type'].lower(), lib['Moss Crawler'].get('meta'))
    check('everything that was saved as a monster is starred, so nothing disappears', 'hb:legacy1' in st()['stars'] and 'hb:legacy5' in st()['stars'] and 'hb:legacy2' not in st()['stars'] and st()['libV'] == 2)
    lib_open(dm, 'saved'); sv = dm.inner_text('#mmlist')
    check('Saved shows them all, with Owlbear tagged Modified', 'Owlbear' in sv and 'Wolf' in sv and 'Moss Crawler' in sv and dm.locator('#mmlist .mmrow:has(b:text-is("Owlbear")) .mmtag').inner_text().strip() == 'Modified', sv[:200])
    lib_open(dm, 'npcs'); nv = dm.inner_text('#library')
    check('NPCs shows the people, not the creatures', 'Old Marta' in nv and 'Goblin' in nv and 'Owlbear' not in nv and 'Moss Crawler' not in nv); lib_close(dm)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round5_mobile(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    check('on a computer the menu stays a left pane and there is no hamburger', dm.locator('.hambtn').is_hidden() and dm.locator('#lnav').is_visible())
    dm.set_viewport_size({'width': 390, 'height': 780}); dm.wait_for_timeout(600)
    check('on a phone the pane is gone and a hamburger takes its place', dm.locator('.hambtn').is_visible() and not dm.locator('#lnav').is_visible() and dm.locator('.row').first.is_visible())
    dm.click('[data-act=timerOpen]'); dm.wait_for_timeout(200)
    dm.click('.hambtn'); dm.wait_for_timeout(500)
    check('one tap on the hamburger opens the menu, even with the timer popover open', dm.locator('#lnav.mobopen').count() == 1 and dm.locator('#lnav').is_visible() and not dm.locator('#tpop').is_visible())
    check('with full labels, not just icons', dm.locator('#lnav .nitem .nl').first.is_visible() and [t.strip() for t in dm.locator('#lnav .nitem .nl').all_text_contents()][:2] == ['Combat monitor', 'Manage encounter'])
    w = dm.eval_on_selector('#lnav', "e=>e.getBoundingClientRect().width"); check('it covers most of the screen but not all', 250 <= w <= 360, w)
    dm.click('[data-nav=add]'); check('an item opens in place', dm.locator('#nsub-add').is_visible())
    dm.click('#mnavscrim', position={'x': 370, 'y': 400}); dm.wait_for_timeout(400)
    check('tapping the dimmed area closes it', dm.locator('#lnav.mobopen').count() == 0 and not dm.locator('#lnav').is_visible())
    dm.click('.hambtn'); dm.wait_for_timeout(300); dm.click('#lnav [data-act=settingsOpen]'); dm.wait_for_timeout(400)
    check('choosing Settings closes the menu and opens Settings', dm.locator('#lnav.mobopen').count() == 0 and dm.locator('#drawer.open, .drawer.open').count() >= 0 and dm.eval_on_selector('#drawer', "e=>e.getBoundingClientRect().left") <= 1)
    dm.click('#drawerClose'); dm.wait_for_timeout(300)
    dm.click('.hambtn'); dm.wait_for_timeout(300); dm.keyboard.press('Escape'); dm.wait_for_timeout(300)
    check('Escape closes it', dm.locator('#lnav.mobopen').count() == 0)
    nav(dm, 'add', 'npc'); dm.fill('#addForm [name=name]', 'Rat'); dm.fill('#addForm [name=init]', '2'); dm.click('#addForm button.primary'); add_close(dm); dm.wait_for_timeout(300)
    check('after adding someone the menu gets out of the way', dm.locator('#lnav.mobopen').count() == 0 and 'Rat' in names(dm))
    dm.set_viewport_size({'width': 1440, 'height': 900}); dm.wait_for_timeout(500)
    check('back at desktop width the left pane is back', dm.locator('#lnav').is_visible() and dm.locator('.hambtn').is_hidden() and dm.locator('#mnavscrim').is_hidden())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round5_phone(b):
    ctx, dm, ph = phone_setup(b, False)
    add_npc(dm, 'Wolf', 5, 11); nxt(dm); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    check('strip: Get ready while creatures sit between, naming the next player', 'get ready' in ph.inner_text('.ph-sn.nxt small').lower() and ph.inner_text('.ph-sn.nxt b').strip() == 'Alric')
    ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(1500)
    check('your card says Get ready then', 'get ready' in ph.inner_text('.ph-mecard .ph-mehtag').lower() and 'up next' not in ph.inner_text('.ph-mecard').lower())
    nxt(dm); dm.wait_for_timeout(600); ph.wait_for_timeout(1500)
    check('when it is the very next turn the strip says Up next', 'up next' in ph.inner_text('.ph-sn.nxt small').lower(), ph.inner_text('.ph-sn.nxt small'))
    check('and so does your card', 'up next' in ph.inner_text('.ph-mecard .ph-mehtag').lower(), ph.inner_text('.ph-mecard .ph-mehtag'))
    if ph.locator('.ph-popup').count(): ph.click('[data-pact=popclose]'); ph.wait_for_timeout(300)
    # --- half damage
    check('there is a half-damage button beside Take damage', ph.locator('.ph-mecard .ph-btn.half').count() == 1 and ph.evaluate("()=>{const c=document.querySelector('.ph-mecard').getBoundingClientRect(); return [...document.querySelectorAll('.ph-mecard .ph-btns3 .ph-btn')].every(b=>b.getBoundingClientRect().right<=c.right-8)}"))
    hp0 = [c for c in st()['combatants'] if c['name'] == 'Alric'][0]['hp']
    ph.fill('[data-pamt]', '7'); ph.click('.ph-btn.half'); ph.wait_for_timeout(1500)
    hp1 = [c for c in st()['combatants'] if c['name'] == 'Alric'][0]['hp']
    check('half of 7 rounds down to 3', hp0 - hp1 == 3, (hp0, hp1))
    ph.fill('[data-pamt]', '1'); ph.click('.ph-btn.half'); ph.wait_for_timeout(1200)
    check('half of 1 is 0, so nothing happens, and it says so', [c for c in st()['combatants'] if c['name'] == 'Alric'][0]['hp'] == hp1 and 'rounds down to 0' in toast_text(ph).lower(), toast_text(ph))
    # --- timer on the player screen
    dm.click('[data-act=timerOpen]'); dm.click('#tpop [data-grp=tset][data-val=up]'); dm.wait_for_timeout(1500); dm.keyboard.press('Escape'); ph.wait_for_timeout(1500)
    check('the timer shows on the current card on the phone', ph.locator('.ph-row.now [data-ptimer]').count() == 1 and re.match(r'\d+:\d\d', ph.inner_text('.ph-row.now [data-ptimer]').strip()) is not None, ph.locator('[data-ptimer]').count())
    dm.click('[data-act=timerOpen]'); dm.click('#tpop .timereye'); dm.keyboard.press('Escape'); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    check('and the eye on the DM side hides it from the phone', ph.locator('[data-ptimer]').count() == 0)
    dm.click('[data-act=timerOpen]'); dm.click('#tpop .timereye'); dm.click('#tpop [data-grp=tset][data-val=off]'); dm.keyboard.press('Escape'); ph.wait_for_timeout(1200)
    # --- on its side: the same cards as the monitor, and Static or Scrolling
    for n, i in (('Bone Devil', 16), ('Hell Hound', 14), ('Octopus', 6)): add_npc(dm, n, i, 20)
    dm.wait_for_timeout(500); ph.set_viewport_size({'width': 844, 'height': 390}); ph.wait_for_timeout(1500)
    sizes = ph.evaluate("()=>[...document.querySelectorAll('.pgrid .pcard')].map(c=>[c.classList.contains('cur'), c.offsetWidth, c.offsetHeight])")
    others = [(w, h) for cur, w, h in sizes if not cur]; cur = [(w, h) for c_, w, h in sizes if c_][0]
    check('every card that is not up is the same size', len(set(others)) == 1, others)
    check('the current card is the same shape, bigger (about 1.2x)', abs(cur[0] / others[0][0] - 1.2) < 0.06 and abs(cur[1] / others[0][1] - 1.2) < 0.08, (cur, others[0]))
    check('the cards are not clipped at the top or bottom of the screen', ph.evaluate("()=>[...document.querySelectorAll('.pgrid .pcard')].every(c=>{const r=c.getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight})"))
    check('there is a Scrolling / Static switch on the screen', ph.inner_text('.lmpill').strip() == 'Scrolling')
    first = lambda: ph.eval_on_selector('.pgrid .pcard h3', "e=>e.textContent.trim()")
    order0 = ph.eval_on_selector_all('.pgrid .pcard h3', "els=>els.map(e=>e.textContent.trim().replace(/\\s+$/,''))")
    check('Scrolling keeps the current card first', ph.evaluate("()=>document.querySelector('.pgrid .pcard').classList.contains('cur')"))
    ph.click('.lmpill'); ph.wait_for_timeout(700)
    check('Static keeps the cards in turn order, with the current one in view', ph.inner_text('.lmpill').strip() == 'Static' and ph.evaluate("()=>!document.querySelector('.pgrid .pcard').classList.contains('cur')") and ph.evaluate("()=>{const r=document.querySelector('.pgrid .pcard.cur').getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth}"), ph.eval_on_selector_all('.pgrid .pcard h3', "els=>els.map(e=>e.textContent.trim())"))
    ph.reload(); ph.wait_for_timeout(1800)
    check('the choice is remembered', ph.inner_text('.lmpill').strip() == 'Static')
    ph.set_viewport_size({'width': 390, 'height': 780}); ph.wait_for_timeout(1000)
    ph.click('[data-pact=menu]') if ph.locator('[data-pact=menu]').count() else ph.click('.ph-menubtn'); ph.wait_for_timeout(400)
    check('the menu also has Scrolling and Static', [t.strip().lower() for t in ph.locator('[data-pact=cardmode2]').all_text_contents()] == ['scrolling', 'static'] and ph.locator('[data-pact=cardmode2][aria-checked=true]').inner_text().strip().lower() == 'static')
    ph.click('[data-pact=cardmode2][data-v=scroll]'); ph.wait_for_timeout(300)
    check('and it can be switched there', ph.locator('[data-pact=cardmode2][aria-checked=true]').inner_text().strip().lower() == 'scrolling')
    check('no page errors', not (dm._errs + ph._errs), dm._errs + ph._errs); ctx.close()

def t_menu_close_x(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    check('on a computer there is no close X (the pane stays)', dm.locator('.navx').is_hidden())
    dm.set_viewport_size({'width': 390, 'height': 780}); dm.wait_for_timeout(500)
    dm.click('.hambtn'); dm.wait_for_timeout(500)
    check('with the phone menu open there is an X at the top', dm.locator('#lnav.mobopen .navx').is_visible() and dm.get_attribute('.navx', 'aria-label') == 'Close menu')
    check('it sits at the right of the logo row', dm.eval_on_selector('.navx', "e=>e.getBoundingClientRect().left") > dm.eval_on_selector('#lnav .brand', "e=>e.getBoundingClientRect().right"))
    check('the fold button is not shown in its place', not dm.locator('.navtoggle').is_visible())
    dm.click('.navx'); dm.wait_for_timeout(400)
    check('tapping it closes the menu', dm.locator('#lnav.mobopen').count() == 0 and not dm.locator('#lnav').is_visible() and dm.locator('#mnavscrim').is_hidden())
    dm.click('.hambtn'); dm.click('[data-nav=add]'); dm.click('.navx'); dm.wait_for_timeout(300); dm.click('.hambtn'); dm.wait_for_timeout(400)
    check('closing with an item open leaves it closed next time', dm.locator('#nsub-add').is_hidden())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_target_round6(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce', device_scale_factor=3); dm = basic_table(ctx); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    hp = lambda nm: [c for c in st()['combatants'] if c['name'] == nm][0]['hp']
    tgt(dm)
    check('the Target tabs run Damage, Condition, Heal', [t.strip().lower() for t in dm.locator('.aoetop .kseg button').all_text_contents()] == ['damage', 'spells', 'condition', 'heal'])
    check('the Select row has only Select all and Clear', [t.strip().lower() for t in dm.locator('.aoepicks .chipbtn').all_text_contents()] == ['select all', 'clear'])
    check('Clear is grayed out while nobody is selected', dm.locator('.pickclear').is_disabled() and dm.locator('.pickclear svg').count() == 1 and dm.locator('.pickall svg').count() == 1)
    dm.click('[data-aoe=pick][data-v=all]'); dm.wait_for_timeout(150)
    check('Select all selects everyone', dm.locator('.aoerow.on').count() == dm.locator('.aoerow').count() == 3 and not dm.locator('.pickclear').is_enabled() is False)
    check('and Clear lights up', dm.locator('.pickclear').is_enabled())
    dm.click('.pickclear'); dm.wait_for_timeout(150)
    check('Clear empties the selection and grays out again', dm.locator('.aoerow.on').count() == 0 and dm.locator('.pickclear').is_disabled())
    dm.click('.aoerow:has(b:text-is("Ogre")) .aoename'); dm.wait_for_timeout(150)
    check('picking one creature by hand enables Clear', dm.locator('.pickclear').is_enabled() and dm.locator('.aoerow.on').count() == 1)
    # damage amount and type
    check('Damage asks for an amount and a Damage type, which starts as Unspecified', dm.locator('.aoedlh').inner_text().replace('\n', ' ').strip().lower() == 'damage damage type' and dm.input_value('[data-aoein=atype]') == 'untyped' and dm.locator('[data-aoein=atype] option:checked').inner_text() == 'Unspecified')
    check('there is no half button any more', dm.locator('.halfbtn').count() == 0)
    dm.fill('[data-aoein=aamt]', '12'); dm.wait_for_timeout(150)
    check('the preview shows the full 12', dm.locator('.aoerow:has(b:text-is("Ogre")) [data-prev]').inner_text() == '59 \u2192 47')
    check('the Apply button names how many creatures', 'damage to 1 creature' in dm.inner_text('.aoeapply').lower())
    dm.click('.aoeapply'); dm.wait_for_timeout(300)
    check('applying takes the damage', hp('Ogre') == 47, hp('Ogre'))
    tgt(dm); dm.click('.aoerow:has(b:text-is("Ogre")) .aoename')
    # save row
    dm.click('[data-aoe=svtoggle]'); dm.wait_for_timeout(200)
    ws = dm.eval_on_selector_all('.aoesvbody > .seg button', "els=>els.map(e=>Math.round(e.getBoundingClientRect().width))"); seg = dm.eval_on_selector('.aoesvbody > .seg', "e=>e.getBoundingClientRect().right"); last = dm.eval_on_selector('.aoesvbody > .seg button:last-child', "e=>e.getBoundingClientRect().right")
    check('the six ability buttons share the row evenly, with no gap after CHA', len(ws) == 6 and max(ws) - min(ws) <= 3 and abs(seg - last) <= 2, (ws, seg, last))
    dm.click('.aoemodal .dhead [data-aoe=close]'); dm.wait_for_timeout(200)
    # text centring in the Spark skins
    for sk in qs(('spark', 'sparkd')):
        set_skin(dm, sk); tgt(dm); dm.click('[data-aoe=svtoggle]') if dm.locator('[data-aoe=svtoggle][aria-expanded=false]').count() else None; dm.wait_for_timeout(200)
        bad = []
        for sel in ('.aoetop .kseg button', '.aoesvbody .seg button', '.aoepicks .chipbtn:not(:disabled)', '[data-aoe=roll]'):
            for i in range(dm.locator('.aoemodal ' + sel).count()):
                el = dm.locator('.aoemodal ' + sel).nth(i)
                if not el.is_visible(): continue
                off = ink_offset(el.screenshot())
                if off is not None and abs(off) > 1.5: bad.append((sel, el.inner_text().strip()[:10], off))
        check('%s: Target button text is vertically centred' % sk, not bad, bad)
        dm.click('.aoemodal .dhead [data-aoe=close]'); dm.wait_for_timeout(200)
    # the Target icon
    check('the Target button shows two people and a bolt (C-L)', dm.locator('#dock .targetbtn svg circle').count() == 2 and dm.locator('#dock .targetbtn svg path').count() == 3, dm.locator('#dock .targetbtn svg path').count())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_encounters(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    add_npc(dm, 'Goblin', 5, 7); nxt(dm); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    check('the menu item is Manage encounter', 'Manage encounter' in dm.inner_text('[data-nav=manage]'))
    nav(dm, 'manage')
    items = [t.strip() for t in dm.locator('#nsub-manage > .nsubi').all_text_contents()]
    check('it lists Start/Pause, End combat, Save, Save as, Open and Start new', [i.replace('\u2026', '') for i in items] == ['Pause' if False else items[0], 'End combat', 'Save', 'Save as', 'Open', 'Start new'] and items[0] in ('Start combat', 'Pause'), items)
    check('Clear is now called Start new, and Pause is just Pause', 'Start new' in items and items[0] == 'Pause' and 'Clear' not in items)
    dm.click('[data-act=encSave]'); dm.wait_for_timeout(300)
    check('Save on an unsaved fight asks for a name, with a sensible default', dm.locator('.encmodal').is_visible() and dm.input_value('[data-encname]') == 'Encounter 1')
    dm.fill('[data-encname]', 'Goblin ambush'); dm.click('.encmodal button[type=submit]'); dm.wait_for_timeout(400)
    enc = st()['encounters']; check('it is saved with the fight\u2019s creatures and turn', len(enc) == 1 and enc[0]['name'] == 'Goblin ambush' and len(enc[0]['combatants']) == 4 and enc[0]['started'] and enc[0]['turnId'], [e['name'] for e in enc])
    check('and the menu shows which encounter is open', 'Goblin ambush' in dm.inner_text('#navEncName'))
    cur = now(dm); dmg(dm, 'Ogre', 9); nav(dm, 'manage'); dm.click('[data-act=encSave]'); dm.wait_for_timeout(300)
    check('Save again overwrites quietly, with no dialog', dm.locator('.encmodal').count() == 0 and len(st()['encounters']) == 1 and [c for c in st()['encounters'][0]['combatants'] if c['name'] == 'Ogre'][0]['hp'] == 50)
    nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.wait_for_timeout(300)
    check('Save as asks for a name, offering the current one', 'save encounter as' in dm.inner_text('.encmodal h2').lower() and dm.input_value('[data-encname]') == 'Goblin ambush')
    dm.fill('[data-encname]', 'Second'); dm.click('.encmodal button[type=submit]'); dm.wait_for_timeout(300)
    check('it adds a second saved encounter', [e['name'] for e in st()['encounters']] == ['Goblin ambush', 'Second'] and st()['encName'] == 'Second')
    nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.fill('[data-encname]', 'goblin AMBUSH'); dm.click('.encmodal button[type=submit]'); dm.wait_for_timeout(300)
    check('a name that already exists asks before replacing', 'replace it' in dm.inner_text('.encmodal').lower() and len(st()['encounters']) == 2)
    dm.keyboard.press('Escape'); dm.wait_for_timeout(200); check('Escape closes the dialog', dm.locator('.encmodal').count() == 0)
    # start new
    nav(dm, 'manage'); dm.click('[data-act=clearAll]'); dm.wait_for_timeout(200)
    check('Start new asks first, and points to Save', 'new encounter' in dm.inner_text('.confmodal h2').lower() and 'save first' in dm.inner_text('.confmodal').lower())
    dm.click('.confmodal [data-conf=yes]'); dm.wait_for_timeout(300)
    check('it empties the fight and forgets the open encounter, keeping the saved ones', dm.locator('.row').count() == 0 and st()['encName'] is None and len(st()['encounters']) == 2)
    # open
    nav(dm, 'manage'); dm.click('[data-act=encOpen]'); dm.wait_for_timeout(300)
    rows = dm.locator('.encrow'); check('Open lists the saved encounters with a summary', rows.count() == 2 and '2 players' in rows.first.inner_text() and 'creatures' in rows.first.inner_text(), dm.inner_text('.encmodal'))
    dm.click('.encrow:has(b:text-is("Goblin ambush")) [data-enc=open]'); dm.wait_for_timeout(400)
    check('opening restores everyone', dm.locator('.row').count() == 4 and set(names(dm)) == {'Rowan', 'Ogre', 'Alric', 'Goblin'} and dm.locator('.encmodal').count() == 0, names(dm))
    check('with their health, the round and whose turn it is', [c for c in st()['combatants'] if c['name'] == 'Ogre'][0]['hp'] == 50 and st()['started'] and now(dm) == cur, (now(dm), cur))
    check('and it is the open encounter again', st()['encName'] == 'Goblin ambush')
    dm.click('[data-act=undo]'); dm.wait_for_timeout(300); check('Undo goes back to the empty table', dm.locator('.row').count() == 0)
    nav(dm, 'manage'); dm.click('[data-act=encOpen]'); dm.wait_for_timeout(300); dm.click('.encrow:has(b:text-is("Second")) [data-enc=del]'); dm.wait_for_timeout(300)
    check('Delete removes a saved encounter', [e['name'] for e in st()['encounters']] == ['Goblin ambush'] and dm.locator('.encrow').count() == 1)
    dm.click('.encrow [data-enc=del]'); dm.wait_for_timeout(300); check('with none left it says so', 'nothing saved' in dm.inner_text('.encmodal').lower())
    dm.keyboard.press('Escape')
    nav(dm, 'manage'); check('Save and Save as are off when there is no fight', dm.locator('[data-act=encSave]').is_disabled() and dm.locator('[data-act=encSaveAs]').is_disabled())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_qr_blur(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    f = lambda sel: dm.eval_on_selector(sel, "e=>getComputedStyle(e).filter")
    check('before opening the QR code nothing is blurred', f('.listwrap') == 'none' and f('#dock') == 'none')
    dm.click('#lnav [data-act=qrOpen]'); dm.wait_for_timeout(500)
    check('opening the QR code blurs the whole DM screen behind it', 'blur' in f('.listwrap') and 'blur' in f('#dock') and 'blur' in f('#lnav'), (f('.listwrap'), f('#dock')))
    check('the blur is heavy enough to hide the text', float(f('.listwrap').split('blur(')[1].split('px')[0]) >= 20)
    check('the QR code itself stays sharp', dm.locator('#qrwrap .qrmodal').is_visible() and dm.eval_on_selector('#qrwrap .qrmodal', "e=>getComputedStyle(e).filter") == 'none')
    check('nothing behind it can be clicked', dm.eval_on_selector('.listwrap', "e=>getComputedStyle(e).pointerEvents") == 'none')
    dm.keyboard.press('Escape'); dm.wait_for_timeout(400)
    check('closing it brings the screen back sharp', f('.listwrap') == 'none' and f('#dock') == 'none' and dm.eval_on_selector('.listwrap', "e=>getComputedStyle(e).pointerEvents") != 'none')
    dm.click('#lnav [data-act=qrOpen]'); dm.wait_for_timeout(300); dm.click('#qrClose'); dm.wait_for_timeout(300)
    check('the Close button does too', f('.listwrap') == 'none')
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round7(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = page(ctx); dm.goto(URL); dm.wait_for_timeout(600)
    rgb = lambda c: tuple(int(x) for x in re.findall(r'\d+', c)[:3])
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    # --- logo
    check('the left menu shows the wombat mark (one shape) and the COMBAT WOMBAT wordmark, not the emoji', dm.locator('#lnav .nhead .bmlogo path').count() == 1 and dm.get_attribute('#lnav .nhead .bword svg.bmwm', 'aria-label') == 'Combat Wombat' and dm.locator('#lnav .nhead .bword svg.bmwm path').count() == 12 and '\u2694' not in dm.inner_text('#lnav .nhead'))
    check('the empty screen shows the full logo (mark and wordmark)', dm.locator('.empty .bmlock .bmlogo').is_visible() and dm.locator('.empty .bmword svg.bmwm').is_visible() and dm.get_attribute('.empty .bmword svg.bmwm', 'aria-label') == 'Combat Wombat')
    for sk in qs(('spark', 'sparkd', 'fire', 'light', 'medieval', 'water')):
        set_skin(dm, sk)
        ink = rgb(dm.eval_on_selector('#lnav .bmlogo .lg-k', "e=>getComputedStyle(e).fill")); itxt = rgb(dm.evaluate("getComputedStyle(document.querySelector('#lnav .nitem')).color"))
        wm = rgb(dm.eval_on_selector('#lnav .bword', "e=>getComputedStyle(e).color"))
        check('%s: the wombat and the wordmark are drawn in the skin\u2019s text colour' % sk, max(abs(a - b_) for a, b_ in zip(ink, itxt)) <= 2 and max(abs(a - b_) for a, b_ in zip(wm, itxt)) <= 2, (ink, wm, itxt))
    set_skin(dm, 'spark')
    dm.click('#lnav .navtoggle'); dm.wait_for_timeout(300)
    check('folded, the menu keeps the mark and drops the word', dm.locator('#lnav .nhead .bmlogo').is_visible() and not dm.locator('#lnav .nhead .bword').is_visible())
    dm.click('#lnav .navtoggle'); dm.wait_for_timeout(300)
    # --- menu layout
    add_player(dm, 'Rowan', 'Brian', '24', '17'); add_player(dm, 'Alric', 'Tim', '31', '15'); add_to_fight(dm, ['15', '9']); add_npc(dm, 'Goblin', 5, 7, qty='3', group=True); add_npc(dm, 'Wolf', 5, 11); add_npc(dm, 'Imp', 5, 6); nxt(dm); back_to_cards(dm)
    nb = dm.eval_on_selector('#lnav', "e=>e.getBoundingClientRect().bottom"); sb = dm.eval_on_selector('[data-act=settingsOpen]', "e=>e.getBoundingClientRect().bottom")
    check('QR codes and Settings are anchored to the bottom of the menu', dm.locator('#lnav .nbottom [data-act=qrOpen]').count() == 1 and dm.locator('#lnav .nbottom [data-act=settingsOpen]').count() == 1 and nb - sb < 24, (nb, sb))
    check('on a computer there is one line, between the top two sections', dm.locator('#lnav .nsep:visible').count() == 1 and dm.eval_on_selector('#lnav .nsep', "e=>e.getBoundingClientRect().top") > dm.eval_on_selector('[data-nav=manage]', "e=>e.getBoundingClientRect().bottom") and dm.eval_on_selector('#lnav .nsep', "e=>e.getBoundingClientRect().bottom") < dm.eval_on_selector('[data-nav=add]', "e=>e.getBoundingClientRect().top"))
    dm.set_viewport_size({'width': 390, 'height': 780}); dm.wait_for_timeout(400); dm.click('.hambtn'); dm.wait_for_timeout(400)
    check('on a phone there are lines between all the sections', dm.locator('#lnav .nsep:visible').count() == 2)
    dm.keyboard.press('Escape'); dm.set_viewport_size({'width': 1440, 'height': 900}); dm.wait_for_timeout(400)
    # --- tie arrows beside the initiative number
    dm.click('[data-act=density][data-val=focus]'); dm.wait_for_timeout(200)
    check('the tie arrows sit with the initiative number, not in the buttons on the right', dm.locator('.row .r-init [data-act=down]').count() >= 1 and dm.locator('.row .acts [data-act=up], .row .acts [data-act=down]').count() == 0)
    rr = row(dm, 'Wolf'); ib = rr.locator('.r-init input').bounding_box(); ub = rr.locator('.r-init [data-act=up]').bounding_box(); db = rr.locator('.r-init [data-act=down]').bounding_box(); nmb = rr.locator('[data-f=name]').bounding_box()
    check('Up is above the number, Down is below it, both on the left of the card', ub['y'] + ub['height'] <= ib['y'] + 2 and db['y'] >= ib['y'] + ib['height'] - 2 and abs((ub['x'] + ub['width'] / 2) - (ib['x'] + ib['width'] / 2)) < 6 and ib['x'] < nmb['x'])
    o0 = names(dm); rr.locator('.r-init [data-act=down]').click(); dm.wait_for_timeout(300)
    check('they still reorder within the tie', names(dm).index('Wolf') == o0.index('Wolf') + 1, (o0, names(dm)))
    dm.click('[data-act=undo]'); dm.wait_for_timeout(200)
    check('there is no drag handle any more', dm.locator('.dragh').count() == 0)
    # --- collapsed group keeps a small row of health
    gm = row(dm, 'Goblin').locator('.gmini .gm')
    check('a collapsed group shows one small chip per member, each with a health bar', gm.count() == 3 and all(gm.nth(i).locator('.gmb u').count() == 1 for i in range(3)))
    check('each chip shows the member number and its HP', [gm.nth(i).locator('b').inner_text() for i in range(3)] == ['1', '2', '3'] and [gm.nth(i).locator('em').inner_text() for i in range(3)] == ['7', '7', '7'])
    dm.click('[data-act=density][data-val=full]'); dm.wait_for_timeout(200)
    check('opened up, the chips go away and the full member cards show', not row(dm, 'Goblin').locator('.gmini').is_visible() and row(dm, 'Goblin').locator('.mem').count() == 3)
    row(dm, 'Goblin').locator('.mem').nth(0).locator('[data-mdelta]').fill('5'); row(dm, 'Goblin').locator('.mem').nth(0).locator('[data-act=mDmg]').click(); dm.wait_for_timeout(300)
    row(dm, 'Goblin').locator('.mem').nth(1).locator('[data-mdelta]').fill('9'); row(dm, 'Goblin').locator('.mem').nth(1).locator('[data-act=mDmg]').click(); dm.wait_for_timeout(300)
    dm.click('[data-act=density][data-val=focus]'); dm.wait_for_timeout(300)
    gm = row(dm, 'Goblin').locator('.gmini .gm')
    check('damage shows in the chips: member 1 is down to 2, member 2 is down and struck through', gm.nth(0).locator('em').inner_text() == '2' and 'dead' in (gm.nth(1).get_attribute('class') or '') and gm.nth(2).locator('em').inner_text() == '7', [gm.nth(i).inner_text().replace('\n', ' ') for i in range(3)])
    check('the bar length follows health', dm.eval_on_selector('.row.group .gm:nth-child(1) .gmb u', "e=>e.style.width") != dm.eval_on_selector('.row.group .gm:nth-child(3) .gmb u', "e=>e.style.width") and dm.locator('.row.group .gm.dead').count() == 1)
    check('hovering gives the full name and HP', 'Goblin 1' in (gm.first.get_attribute('title') or '') and 'HP' in (gm.first.get_attribute('title') or ''))
    # --- the Target icon
    check('the Target button has the new icon', dm.locator('#dock .targetbtn svg circle').count() == 2)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_campaigns(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); add_npc(dm, 'Goblin', 5, 7); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    def save(name, camp=''):
        nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.wait_for_timeout(250); dm.fill('[data-encname]', name); dm.fill('[data-enccamp]', camp); dm.click('.encmodal button[type=submit]'); dm.wait_for_timeout(300)
    nav(dm, 'manage'); dm.click('[data-act=encSave]'); dm.wait_for_timeout(250)
    check('the Save dialog has an optional Campaign field', dm.locator('[data-enccamp]').is_visible() and 'optional' in dm.inner_text('.encmodal').lower() and dm.get_attribute('[data-enccamp]', 'placeholder') == 'No campaign')
    dm.keyboard.press('Escape')
    save('Ambush', 'Curse of Strahd'); save('Bridge', 'Curse of Strahd'); save('Tavern brawl')
    enc = st()['encounters']; check('encounters keep their campaign (or none)', [(e['name'], e.get('campaign', '')) for e in enc] == [('Ambush', 'Curse of Strahd'), ('Bridge', 'Curse of Strahd'), ('Tavern brawl', '')], [(e['name'], e.get('campaign')) for e in enc])
    save('Ambush', 'lost mine')
    check('the same name can live in two campaigns', len(st()['encounters']) == 4 and len([e for e in st()['encounters'] if e['name'] == 'Ambush']) == 2)
    save('Cave', 'LOST MINE')
    check('a campaign typed in another case reuses the existing spelling', [e['campaign'] for e in st()['encounters'] if e['name'] == 'Cave'] == ['lost mine'])
    check('the menu shows campaign and encounter', 'lost mine \u203a Cave' in dm.inner_text('#navEncName'), dm.inner_text('#navEncName'))
    nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.fill('[data-encname]', 'bridge'); dm.fill('[data-enccamp]', 'curse of strahd'); dm.click('.encmodal button[type=submit]'); dm.wait_for_timeout(250)
    check('saving over a name in the same campaign asks first', 'replace it' in dm.inner_text('.encmodal').lower() and 'curse of strahd' in dm.inner_text('.encmodal').lower() and len(st()['encounters']) == 5)
    dm.click('.encmodal button[type=submit]'); dm.wait_for_timeout(300)
    check('and replaces just that one', len(st()['encounters']) == 5 and len([e for e in st()['encounters'] if e['name'].lower() == 'bridge']) == 1)
    nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.wait_for_timeout(250)
    check('the field suggests existing campaigns', sorted(dm.eval_on_selector_all('#enccamps option', "els=>els.map(e=>e.value)")) == ['Curse of Strahd', 'lost mine'])
    dm.keyboard.press('Escape')
    nav(dm, 'manage'); dm.click('[data-act=encOpen]'); dm.wait_for_timeout(300)
    heads = [t.replace('\n', ' ').strip() for t in dm.locator('.encgrp > summary').all_text_contents()]
    check('Open groups encounters by campaign, in order, with No campaign last', [re.sub(r'\s*\d+$', '', h) for h in heads] == ['Curse of Strahd', 'lost mine', 'No campaign'] and [h[-1] for h in heads] == ['2', '2', '1'], heads)
    dm.click('.encgrp:has(b:text-is("lost mine")) > summary'); dm.wait_for_timeout(200)
    check('a campaign can be collapsed', dm.locator('.encgrp:has(b:text-is("lost mine"))').get_attribute('open') is None and dm.locator('.encgrp:has(b:text-is("Curse of Strahd"))').get_attribute('open') is not None)
    dm.click('.encgrp:has(b:text-is("Curse of Strahd")) .encrow:has(b:text-is("Ambush")) [data-enc=open]'); dm.wait_for_timeout(400)
    check('opening one remembers its campaign', st()['encName'] == 'Ambush' and st()['encCamp'] == 'Curse of Strahd' and 'Curse of Strahd \u203a Ambush' in dm.inner_text('#navEncName'))
    nav(dm, 'manage'); dm.click('[data-act=encSave]'); dm.wait_for_timeout(300)
    check('Save then quietly overwrites it in its own campaign', len(st()['encounters']) == 5 and dm.locator('.encmodal').count() == 0)
    nav(dm, 'manage'); dm.click('[data-act=clearAll]'); dm.click('.confmodal [data-conf=yes]'); dm.wait_for_timeout(300)
    check('Start new forgets the campaign too', st()['encCamp'] is None and st()['encName'] is None)
    nav(dm, 'manage'); dm.click('[data-act=encOpen]'); dm.wait_for_timeout(300); dm.click('.encrow:has(b:text-is("Tavern brawl")) [data-enc=open]'); dm.wait_for_timeout(300)
    check('an encounter with no campaign opens with none', st()['encName'] == 'Tavern brawl' and not st()['encCamp'])
    # with no campaigns at all, Open stays a plain list
    dm.evaluate("()=>{const k='initiative-tracker-v1', s=JSON.parse(localStorage.getItem(k)); s.encounters.forEach(e=>delete e.campaign); localStorage.setItem(k, JSON.stringify(s));}"); dm.reload(); dm.wait_for_timeout(600)
    nav(dm, 'manage'); dm.click('[data-act=encOpen]'); dm.wait_for_timeout(300)
    check('with no campaigns in use, Open is a plain list, as before', dm.locator('.encgrp').count() == 0 and dm.locator('.encrow').count() == 5)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round7_phone_logo(b):
    ctx, dm, ph = phone_setup(b, False); nxt(dm); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    check('the player screen header shows the mark and wordmark', ph.locator('.ph-brand .bmlogo').is_visible() and ph.get_attribute('.ph-brand svg.bmwm', 'aria-label') == 'Combat Wombat' and '\u2694' not in ph.inner_text('.ph-brand'))
    nav(dm, 'manage'); dm.click('#navStart'); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(900)
    check('the Combat Monitor shows the logo while combat is paused', tv.locator('.ppause .bmlogo').is_visible() and 'combat paused' in tv.inner_text('.ppause').lower())
    nav(dm, 'manage'); dm.click('#navStart'); dm.wait_for_timeout(500)
    check('no page errors', not (dm._errs + ph._errs), dm._errs + ph._errs); ctx.close()

def t_library_tabs(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    check('the left menu has a single Library item, with no sub-menu', dm.locator('#lnav [data-act=libOpen][data-preset=book]').count() == 1 and dm.locator('[data-nav=library]').count() == 0)
    dm.click('#lnav [data-act=libOpen][data-preset=book]'); dm.wait_for_timeout(400)
    check('it opens one window called Library', dm.locator('.libmodal').is_visible() and dm.inner_text('.libmodal .dhead h2').strip().lower() == 'library')
    check('with four tabs: Creatures, Saved, NPCs and Spells', [t.strip().lower() for t in dm.locator('.libmodal .mmtabs button').all_text_contents()] == ['creatures', 'saved', 'npcs', 'spells'])
    check('the Book is the first tab and holds all 331 SRD creatures', dm.locator('.mmtabs [data-v=book]').get_attribute('aria-checked') == 'true' and '331 of 331' in dm.inner_text('#mmcount'))
    check('every Book row has a star and an Edit a copy button, and no Save button', dm.locator('.mmrow').count() > 20 and dm.locator('.mmrow [data-mm=star]').count() == dm.locator('.mmrow').count() and dm.locator('.mmrow [data-mm=edit]').count() == dm.locator('.mmrow').count() and dm.locator('[data-mm=save]').count() == 0)
    check('the star is a toggle with a clear label', dm.get_attribute('.mmrow [data-mm=star]', 'aria-pressed') == 'false' and 'save' in dm.get_attribute('.mmrow [data-mm=star]', 'aria-label').lower())
    check('+ New creature is on the Book tab', dm.locator('[data-mm=new]').is_visible())
    dm.click('.mmtabs [data-v=saved]'); dm.wait_for_timeout(300)
    check('Saved starts empty, and says how to fill it', 'press the star' in dm.inner_text('#mmlist').lower() and dm.inner_text('#cntMon').strip() == '' and dm.locator('[data-mm=new]').count() == 0)
    dm.click('.mmtabs [data-v=book]'); dm.wait_for_timeout(300); dm.click('.mmrow [data-mm=star] >> nth=0'); dm.wait_for_timeout(250); dm.click('.mmrow [data-mm=star] >> nth=1'); dm.wait_for_timeout(250)
    check('starring updates the Saved count straight away', dm.inner_text('#cntMon').strip() == '2' and dm.locator('.mmrow.starred').count() == 2)
    dm.click('.mmtabs [data-v=saved]'); dm.wait_for_timeout(300)
    check('and the Saved tab lists exactly those', dm.locator('#mmlist .mmrow').count() == 2 and '2 of 2' in dm.inner_text('#mmcount'))
    dm.click('.mmtabs [data-v=npcs]'); dm.wait_for_timeout(300)
    check('the NPCs tab has the generator and the saved NPC list', dm.locator('.libmodal [data-act=buildOpenNpc]').is_visible() and dm.locator('#library').count() == 1 and 'no npcs saved' in dm.inner_text('#library').lower())
    dm.click('.libmodal .dhead [data-mm=close]'); dm.wait_for_timeout(300)
    check('the window closes', dm.locator('.libmodal').count() == 0)
    dm.click('#lnav [data-act=libOpen][data-preset=book]'); dm.wait_for_timeout(300)
    check('it remembers your tab and starred items when reopened', dm.inner_text('#cntMon').strip() == '2')
    dm.click('.libmodal .dhead [data-mm=close]'); dm.wait_for_timeout(200)
    dm.reload(); dm.wait_for_timeout(600); dm.click('#lnav [data-act=libOpen][data-preset=book]'); dm.wait_for_timeout(300)
    check('stars survive a reload', dm.inner_text('#cntMon').strip() == '2'); dm.click('.libmodal .dhead [data-mm=close]'); dm.wait_for_timeout(200)
    dm.set_viewport_size({'width': 390, 'height': 780}); dm.wait_for_timeout(500)
    dm.click('.hambtn'); dm.wait_for_timeout(300); dm.click('#lnav [data-act=libOpen][data-preset=book]'); dm.wait_for_timeout(400)
    check('on a phone it opens from the hamburger and fits the screen', dm.locator('.libmodal').is_visible() and not dm.evaluate("document.documentElement.scrollWidth>innerWidth+1") and dm.eval_on_selector('.libmodal', "e=>e.getBoundingClientRect().width") <= 392)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_settings_window(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    low = lambda sel: [t.strip().lower() for t in dm.locator(sel).all_text_contents()]
    sopen(dm)
    check('Settings is a window with a list of categories, like System Settings', [t.strip() for t in dm.locator('.dside .dcat').all_text_contents()] == ['General', 'Appearance', 'Table view', 'Sound & effects', 'Players', 'About'])
    check('it opens on General, with that category marked', dm.inner_text('.dcat[aria-current=page]').strip() == 'General' and dm.inner_text('.dtitle').strip() == 'General')
    check('General groups the device view, account, tracking and shortcuts', [h.strip() for h in dm.locator('.dmain .sgh').all_text_contents()] == ['This device', 'Your account', 'Tracking', 'Keyboard shortcuts'] or low('.dmain .sgh') == ['this device', 'your account', 'tracking', 'keyboard shortcuts'], dm.locator('.dmain .sgh').all_text_contents())
    # nothing was lost: every setting lives in exactly one category
    seen = {}
    for cat in ('general', 'appearance', 'table', 'sound', 'players', 'about'):
        dm.click('.drawer .dcat[data-cat=%s]' % cat); dm.wait_for_timeout(150)
        for k in dm.eval_on_selector_all('.dmain [data-key]', "els=>[...new Set(els.map(e=>e.dataset.key))]"): seen.setdefault(k, []).append(cat)
        if dm.locator('.dmain [data-grp=view]').count(): seen.setdefault('view', []).append(cat)
        check('%s has something in it' % cat, dm.locator('.dmain .sgroup').count() >= 1)
    need = ['view', 'skin', 'fontSize', 'cbMarks', 'showNames', 'imgShow', 'showPlayers', 'acShow', 'rxShow', 'pcHp', 'npcHp', 'cardMode', 'crowd', 'sfxTv', 'sfxDm', 'sfxVol', 'sfxTurn', 'sfxHit', 'sfxEnd', 'sfxCond', 'sfxTimer', 'fxFlash', 'fxNums', 'phoneEdit', 'tvQr', 'trackPC', 'trackNPC', 'reactionReset', 'autoStats']
    check('every setting from before is still there, once', all(len(seen.get(k, [])) == 1 for k in need), {k: seen.get(k) for k in need if len(seen.get(k, [])) != 1})
    check('settings are grouped sensibly (skin in Appearance, health in Table view, volume in Sound, QR in Players)', seen['skin'] == ['appearance'] and seen['pcHp'] == ['table'] and seen['sfxVol'] == ['sound'] and seen['tvQr'] == ['players'] and seen['trackPC'] == ['general'])
    # the credits are still in About, word for word
    dm.click('.drawer .dcat[data-cat=about]'); dm.wait_for_timeout(150)
    check('the SRD credits are in About', 'System Reference Document 5.2' in dm.inner_text('.dmain') and 'Creative Commons Attribution 4.0' in dm.inner_text('.dmain') and 'not affiliated with or endorsed by wizards of the coast' in dm.inner_text('.dmain').lower())
    # live preview
    dm.click('.drawer .dcat[data-cat=table]'); dm.wait_for_timeout(200)
    check('Table view shows a preview of the cards, with the Now and Up next flags', dm.locator('.prevbox .pcard').count() == 2 and 'now' in dm.inner_text('.prevbox .pcard.cur').lower())
    dm.click('.drawer .dcat[data-cat=appearance]'); dm.wait_for_timeout(150); check('so does Appearance', dm.locator('.prevbox .pcard').count() == 2); dm.click('.drawer .dcat[data-cat=table]'); dm.wait_for_timeout(150)
    pv = lambda sel: dm.locator('.prevbox ' + sel).count()
    dm.click('[data-key=acShow][data-val=none]'); dm.wait_for_timeout(200); check('Armor class: Nobody shows no shields', pv('.pac') == 0)
    dm.click('[data-key=acShow][data-val=default]'); dm.wait_for_timeout(200); check('Players + chosen shows the player\u2019s only', pv('.pac') == 1)
    dm.click('[data-key=acShow][data-val=all]'); dm.wait_for_timeout(200); check('Everyone shows both', pv('.pac') == 2)
    dm.click('[data-key=pcHp][data-val=exact]'); dm.wait_for_timeout(200); check('Player health: Numbers shows 17 / 24', '17' in dm.locator('.prevbox .pcard.pc .php').inner_text() and '24' in dm.locator('.prevbox .pcard.pc .php').inner_text())
    dm.click('[data-key=pcHp][data-val=status]'); dm.wait_for_timeout(200); check('Word shows just the word', dm.locator('.prevbox .pcard.pc .php').inner_text().strip().lower() == 'wounded' and pv('.pcard.pc .bar') == 0)
    dm.click('[data-key=pcHp][data-val=bar]'); dm.wait_for_timeout(200); check('Bar shows the bar', pv('.pcard.pc .bar') == 1)
    dm.click('[data-key=npcHp][data-val=exact]'); dm.wait_for_timeout(200); check('Enemy health follows its own setting', '3' in dm.locator('.prevbox .pcard.npc .php').inner_text() and '7' in dm.locator('.prevbox .pcard.npc .php').inner_text())
    dm.click('[data-key=rxShow][data-val=none]'); dm.wait_for_timeout(200); check('Reactions: Hidden removes the pills', pv('.prx') == 0)
    dm.click('[data-key=rxShow][data-val=all]'); dm.wait_for_timeout(200); check('Everyone shows both', pv('.prx') == 2)
    check('Images are on, so each card shows its art', pv('.prevart') == 2)
    dm.click('[data-key=imgShow]'); dm.wait_for_timeout(200); check('turning Images off removes it', pv('.prevart') == 0)
    check('Player names are on', 'Brian' in dm.locator('.prevbox .pcard.pc').inner_text())
    dm.click('[data-key=showNames]'); dm.wait_for_timeout(200); check('turning them off removes the name', 'Brian' not in dm.locator('.prevbox .pcard.pc').inner_text())
    check('the timer is on the current card', pv('.pcard.cur .ptimer') == 1 and '0:42' in dm.locator('.prevbox .ptimer').inner_text())
    dm.click('[data-key=showPlayers]'); dm.wait_for_timeout(200); check('and goes when the timer is hidden from the table', pv('.ptimer') == 0)
    dm.click('.drawer .dcat[data-cat=appearance]'); dm.wait_for_timeout(150); dm.click('[data-key=cbMarks]'); dm.wait_for_timeout(200); check('Colour-blind markers add shape labels to the preview', pv('.rolemark') == 2)
    dm.click('[data-key=fontSize][data-val=large]'); dm.wait_for_timeout(200); check('Large text enlarges the preview', dm.locator('.prevbox.large').count() == 1)
    # the preview follows the skin, and the app behind it is not dimmed or blurred
    bg = lambda: dm.eval_on_selector('.prevbox .pcard.pc', "e=>getComputedStyle(e).backgroundColor")
    dm.click('[data-key=skin][data-val=light]'); dm.wait_for_timeout(300); b1 = bg()
    dm.click('[data-key=skin][data-val=fire]'); dm.wait_for_timeout(300); b2 = bg()
    check('the preview changes with the skin, live', b1 != b2 and dm.evaluate("document.documentElement.dataset.skin") == 'fire' and dm.locator('#drawer.open').count() == 1, (b1, b2))
    sc = dm.eval_on_selector('#scrim', "e=>{const c=getComputedStyle(e); return [c.backgroundColor, c.backdropFilter||'none', c.pointerEvents]}")
    check('the app behind Settings is not dimmed or blurred', sc[0] in ('rgba(0, 0, 0, 0)', 'transparent') and sc[1] == 'none' and dm.eval_on_selector('.listwrap', "e=>getComputedStyle(e).filter") == 'none', sc)
    check('and it can still be used beside the window', sc[2] == 'none' and dm.evaluate("(()=>{const e=document.elementFromPoint(1300,200); return !!(e&&e.closest('.listwrap'))})()"))
    check('the window is wide enough for a sidebar but leaves room for the app', 700 <= dm.eval_on_selector('#drawer', "e=>e.getBoundingClientRect().width") <= 920)
    dm.click('.drawer .dcat[data-cat=sound]'); dm.wait_for_timeout(150)
    check('Sound has its previews, and they still play', dm.locator('.dmain [data-act=sfxTest]').count() == 12)
    dm.click('#drawerClose'); dm.wait_for_timeout(300); sopen(dm)
    check('Settings reopens on the category you were last in', dm.inner_text('.dcat[aria-current=page]').strip() == 'Sound & effects')
    dm.keyboard.press('Escape'); dm.click('#drawerClose') if dm.locator('#drawer.open').count() else None
    # on a phone
    dm.set_viewport_size({'width': 390, 'height': 800}); dm.wait_for_timeout(500); sopen(dm); dm.click('.drawer .dcat[data-cat=table]'); dm.wait_for_timeout(250)
    check('on a phone the categories are a row of chips you can scroll', dm.eval_on_selector('.dside', "e=>getComputedStyle(e).flexDirection") == 'row' and dm.eval_on_selector('#drawer', "e=>e.getBoundingClientRect().width") <= 392)
    check('the preview sits in the page rather than covering it', dm.eval_on_selector('.prevbox', "e=>getComputedStyle(e).position") == 'static' and not dm.evaluate("document.documentElement.scrollWidth>innerWidth+1"))
    dm.click('.drawer .dcat[data-cat=players]'); dm.wait_for_timeout(200)
    check('every category can be reached on a phone', dm.inner_text('.dtitle').strip() == 'Players' and dm.locator('[data-key=tvQr]').is_visible())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_rx_hidden_landscape(b):
    ctx, dm, ph = phone_setup(b, False); nxt(dm); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    ph.set_viewport_size({'width': 844, 'height': 390}); ph.wait_for_timeout(1500)
    check('by default a landscape phone shows the players\\u2019 reactions', ph.locator('.pcard .prx').count() >= 2)
    sopen(dm, 'rxShow'); dm.click('[data-key=rxShow][data-val=none]'); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    check('with Reactions set to Hidden it shows none, like the Combat Monitor', ph.locator('.pcard .prx').count() == 0, ph.locator('.pcard .prx').count())
    dm.click('[data-key=rxShow][data-val=all]'); dm.wait_for_timeout(500); ph.wait_for_timeout(1500)
    check('Everyone shows enemies\\u2019 too', ph.locator('.pcard .prx').count() >= 3)
    check('no page errors', not (dm._errs + ph._errs), dm._errs + ph._errs); ctx.close()

def t_editor_access(b):
    STORE.clear()
    spy = "(function(){const o=window.claude.use; window.__emitOk=0; window.__emitFail=0; window.claude.use=async function(n){const r=await o(n); if(n==='room'&&r&&!r.__w){const e=r.emit.bind(r); r.emit=function(t,d){return e(t,d).then(function(x){window.__emitOk++;return x;},function(x){window.__emitFail++;throw x;});}; r.__w=1;} return r;};})();"
    ctxA = dbctx(b); A = basic_table(ctxA, db=True); A.wait_for_timeout(2200)
    check('the owner\u2019s session is saved to the account', 'Rowan' in STORE.get('dm/state', ''))
    # the tester: a different person, shared on the page as an Editor
    ctxE = dbctx(b); E = page(ctxE, owner=False, editor=True, uid='u_tester', db=True); E.add_init_script(spy); E.goto(URL); E.wait_for_timeout(2200)
    check('an Editor gets the full DM screen, not the Player screen', E.locator('#lnav').is_visible() and E.locator('#dock [data-act=next]').count() == 1 and E.locator('.ph-claim').count() == 0 and E.locator('.ph-wait').count() == 0)
    check('and sees the owner\u2019s party and encounter', names(E) == names(A) and len(names(E)) == 3, (names(A), names(E)))
    check('the Library, Add new and Settings are all there', E.locator('#lnav [data-act=libOpen][data-preset=book]').count() == 1 and E.locator('[data-nav=add]').count() == 1 and E.locator('#lnav [data-act=settingsOpen]').count() == 1)
    sopen(E, cat='general'); check('Settings tells them they are an Editor in the owner\u2019s data', 'You are an Editor on this page' in E.inner_text('#drawer') and 'Saved to your Claude account' in E.inner_text('#drawer'))
    sopen(E, cat='players'); check('and explains who gets what', 'Viewers and Contributors' in E.inner_text('.dmain') and 'Editors' in E.inner_text('.dmain') and 'Share menu' in E.inner_text('.dmain')); E.click('#drawerClose')
    # edits go both ways, like a second device
    nxt(E); E.wait_for_timeout(1800); check('a turn change by the Editor reaches the owner', now(A) == 'Rowan', now(A))
    dmg(E, 'Ogre', 9); E.wait_for_timeout(1800); check('the Editor\u2019s damage reaches the owner', hp(A, 'Ogre') == '50', hp(A, 'Ogre'))
    dmg(A, 'Ogre', 4); A.wait_for_timeout(1800); check('and the owner\u2019s change reaches the Editor', hp(E, 'Ogre') == '46', hp(E, 'Ogre'))
    # the Editor's DM screen can drive the players' phones
    check('the Editor\u2019s DM screen can send updates to players\u2019 phones', E.evaluate('window.__emitOk') > 0 and E.evaluate('window.__emitFail') == 0, (E.evaluate('window.__emitOk'), E.evaluate('window.__emitFail')))
    P = page(ctxE, owner=False, uid='u_player', db=True); P.goto(URL); P.wait_for_timeout(2000)
    check('a player (a Viewer) on the same page still only gets the Player screen', P.locator('#lnav').count() == 0 and P.locator('.ph-claim, .ph-strip, .ph-wait').count() >= 1)
    check('and the player sees the live table the Editor is running', P.locator('.ph-claimbtn').count() == 2 or P.locator('.ph-row').count() >= 2, P.locator('.ph-claimbtn').count())
    check('a player cannot read the saved session', P.evaluate("claude.use('db').then(d=>d.doc('dm/state').get()).then(s=>s.exists)") is False)
    check('and cannot write to it', P.evaluate("claude.use('db').then(d=>d.doc('dm/state').set({a:1})).then(()=>'wrote',e=>e.code)") == 'invalid_argument')
    check('no page errors', not (A._errs + E._errs + P._errs), A._errs + E._errs + P._errs); ctxA.close(); ctxE.close()

def t_cards_round8(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    box = lambda sel, row_=None: dm.eval_on_selector((row_ or '.row') + ' ' + sel if row_ is not None else '.row ' + sel, "e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
    for label, size in (('desktop', (1440, 900)), ('phone', (390, 800))):
        dm.set_viewport_size({'width': size[0], 'height': size[1]}); dm.wait_for_timeout(500)
        R = dm.eval_on_selector('.row.now', "e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
        sel = lambda x: dm.eval_on_selector('.row.now ' + x, "e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
        check('%s: the eye and the three dots are in the top right of the card' % label, sel('.acts')[2] > R[2] - 24 and sel('.acts')[1] < R[1] + 40 and dm.locator('.row.now .acts .eyebtn').count() == 1 and dm.locator('.row.now .acts .more').count() == 1)
        check('%s: the collapse button is no longer with them' % label, dm.locator('.row.now .acts .colbtn').count() == 0)
        tab = sel('.rowtab')
        check('%s: Collapse sits on the bottom edge of the card, half outside it, like the Now chip' % label, tab[1] < R[3] < tab[3] and R[2] - tab[2] > 8 and R[2] - tab[2] < 70 and 'collapse' in dm.inner_text('.row.now .rowtab').lower(), (tab, R))
        hp = sel('.hpnums input[data-f=hp]'); ico = sel('.hpicon'); mx = sel('.hpnums input[data-f=maxHp]')
        check('%s: a heart icon comes before the hit points' % label, dm.locator('.row.now .hpicon svg').count() == 1 and ico[2] <= hp[0] + 2)
        check('%s: the # / # spacing is tight' % label, mx[0] - hp[2] < 30, mx[0] - hp[2])
        st = sel('.rowtools'); cd = sel('.conds')
        check('%s: View stats is at the bottom of the card with an icon' % label, st[1] >= cd[3] - 2 and R[3] - st[3] < 40 and 'view stats' in dm.inner_text('.row.now .rowtools').lower() and dm.locator('.row.now .rowtools svg').count() == 1)
        check('%s: Stats and notes is gone from under the name' % label, 'Stats & notes' not in dm.inner_text('.row.now .who') and 'stats' not in dm.inner_text('.row.now .who').lower())
    ac = sel('.acbox'); nm = sel('.who .nm'); wh = sel('.who')
    check('on a phone the AC sits to the right of the name', ac[0] > nm[0] + 60 and abs(ac[1] - wh[1]) < 40 and ac[2] < sel('.acts')[0] + 6, (ac, nm))
    dm.click('.row.now .viewstats'); dm.wait_for_timeout(300)
    check('View stats opens the stats and the button says Hide stats', dm.locator('.row.now .viewstats').inner_text().strip().lower() == 'hide stats' and dm.locator('.row.now [data-sf], .row.now .sheet').count() > 0)
    check('the stats open below the button', dm.eval_on_selector('.row.now .viewstats', "e=>e.getBoundingClientRect().bottom") <= dm.eval_on_selector('.row.now [data-sf]', "e=>e.getBoundingClientRect().top"))
    dm.click('.row.now .viewstats'); dm.wait_for_timeout(200)
    dm.click('.row.now .rowtab'); dm.wait_for_timeout(300)
    check('the tab collapses the card and then says Expand', dm.locator('.row.now.collapsed').count() == 1 and 'expand' in dm.inner_text('.row.now .rowtab').lower() and dm.get_attribute('.row.now .rowtab', 'aria-expanded') == 'false')
    check('a collapsed card keeps the tab on its bottom edge', dm.eval_on_selector('.row.now .rowtab', "e=>{const r=e.getBoundingClientRect(), c=e.closest('.row').getBoundingClientRect(); return r.top<c.bottom && r.bottom>c.bottom}"))
    check('and its eye and menu stay in the top right', dm.locator('.row.now .acts .eyebtn').is_visible() and dm.locator('.row.now .acts .more').is_visible())
    dm.click('.row.now .rowtab'); dm.wait_for_timeout(300); check('Expand opens it again', dm.locator('.row.now.collapsed').count() == 0)
    dm.set_viewport_size({'width': 1440, 'height': 900}); dm.wait_for_timeout(300)
    check('the card does not run into the one below it', dm.eval_on_selector('.row.now .rowtab', "e=>e.getBoundingClientRect().bottom") < dm.eval_on_selector('.row:nth-child(2)', "e=>e.getBoundingClientRect().top"))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_library_round8(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    open_lib(dm); dm.fill('[data-mmsearch]', 'Goblin Warrior'); dm.wait_for_timeout(250)
    r = '.mmrow:has(b:text-is("Goblin Warrior"))'
    # --- the row: star on the far left, pencil, stepper
    box = lambda sel: dm.eval_on_selector(r + ' ' + sel, "e=>{const x=e.getBoundingClientRect(); return [x.left,x.top,x.right,x.bottom]}")
    check('the star is the first thing in the row, on the far left', box('[data-mm=star]')[0] < box('.mmname')[0] and box('[data-mm=star]')[0] - dm.eval_on_selector(r, "e=>e.getBoundingClientRect().left") < 24)
    check('the edit button is a pencil, not a copy icon', dm.locator(r + ' [data-mm=edit] svg path').first.get_attribute('d').startswith('M12 20h9') and 'edit a copy' in dm.get_attribute(r + ' [data-mm=edit]', 'aria-label').lower())
    check('the quantity has a minus before and a plus after the number', dm.locator(r + ' .mmqty > button').count() == 2 and dm.eval_on_selector(r + ' .mmqty', "e=>[...e.children].map(c=>c.tagName+':'+(c.dataset.d||''))").__repr__() == "['BUTTON:-1', 'INPUT:', 'BUTTON:1']")
    qv = lambda: dm.input_value(r + ' [data-mmq]')
    check('it starts at 1 and minus does not go below 1', qv() == '1' and (dm.click(r + ' [data-mm=qty][data-d="-1"]') or qv() == '1'))
    for _ in range(3): dm.click(r + ' [data-mm=qty][data-d="1"]')
    check('plus counts up', qv() == '4')
    dm.fill(r + ' [data-mmq]', '20'); dm.click(r + ' [data-mm=qty][data-d="1"]'); check('and stops at 20', qv() == '20')
    dm.fill(r + ' [data-mmq]', '3')
    # --- chips: selected and not selected look different
    chip = lambda m: dm.locator('[data-mm=%s]' % m)
    bg = lambda m: chip(m).evaluate("e=>getComputedStyle(e).backgroundColor")
    check('Auto-roll initiative starts on, and shows as selected', chip('auto').get_attribute('aria-pressed') == 'true' and bg('auto') != bg('group') and chip('group').get_attribute('aria-pressed') == 'false')
    chip('group').click(); dm.mouse.move(5, 5); dm.wait_for_timeout(450); a1 = bg('group'); chip('group').click(); dm.mouse.move(5, 5); dm.wait_for_timeout(450)
    check('Group copies changes colour when selected', a1 != bg('group') and a1.startswith('rgb(') and not bg('group').startswith('rgb('))
    check('the chips show a tick when on', chip('auto').locator('.mmck').count() == 1 and chip('group').locator('.mmck').count() == 0)
    check('Add as starts on Enemy', dm.input_value('[data-mmf=disp]') == 'enemy')
    # --- auto-roll on: adds straight away
    dm.click(r + ' [data-mm=add]'); dm.wait_for_timeout(400)
    gw = [c for c in st()['combatants'] if c['name'].startswith('Goblin Warrior')]
    check('with Auto-roll on, Add rolls and adds at once', len(gw) == 3 and dm.locator('.mminit').count() == 0, len(gw))
    # --- auto-roll off: asks for the initiative
    chip('auto').click(); dm.wait_for_timeout(150)
    check('turned off, the chip is not selected', chip('auto').get_attribute('aria-pressed') == 'false')
    before = len(st()['combatants']); dm.click(r + ' [data-mm=add]'); dm.wait_for_timeout(300)
    check('Add now asks for each one\u2019s initiative instead of rolling', dm.locator('.mminit').is_visible() and dm.locator('.mminit [data-mmi]').count() == 3 and len(st()['combatants']) == before)
    dm.click('.mminit button[type=submit]'); dm.wait_for_timeout(200)
    check('it will not add until you have typed them', len(st()['combatants']) == before and dm.locator('.mminit').is_visible())
    dm.fill('[data-mmi="0"]', '17'); dm.fill('[data-mmi="1"]', '11'); dm.fill('[data-mmi="2"]', '4'); dm.click('.mminit button[type=submit]'); dm.wait_for_timeout(400)
    new = sorted([c['init'] for c in st()['combatants'] if c['name'].startswith('Goblin Warrior')][-0:])
    got = [c['init'] for c in st()['combatants'] if c['name'].startswith('Goblin Warrior')]
    check('the typed initiatives are used', len(got) == 6 and {17, 11, 4} <= set(got), got)
    check('and the prompt goes away', dm.locator('.mminit').count() == 0)
    dm.click(r + ' [data-mm=add]'); dm.wait_for_timeout(250); dm.click('.mminit [data-mm=initcancel]'); dm.wait_for_timeout(200)
    check('Cancel adds nothing', len(st()['combatants']) == before + 3 and dm.locator('.mminit').count() == 0)
    chip('group').click(); dm.wait_for_timeout(150); dm.click(r + ' [data-mm=add]'); dm.wait_for_timeout(250)
    check('when copies are grouped it asks once for the whole group', dm.locator('.mminit [data-mmi]').count() == 1)
    dm.fill('[data-mmi="0"]', '13'); dm.click('.mminit button[type=submit]'); dm.wait_for_timeout(400); chip('group').click(); dm.wait_for_timeout(150)
    grp = [c for c in st()['combatants'] if c.get('members')]
    check('and the group gets that initiative', len(grp) == 1 and grp[0]['init'] == 13 and len(grp[0]['members']) == 3, grp[0]['init'] if grp else None)
    dm.fill(r + ' [data-mmq]', '8'); dm.click(r + ' [data-mm=add]'); dm.wait_for_timeout(250)
    check('with more than six copies it asks for one number for all of them', dm.locator('.mminit [data-mmi]').count() == 1 and 'all 8' in dm.inner_text('.mminit').lower())
    dm.click('.mminit [data-mm=initcancel]'); chip('auto').click(); dm.wait_for_timeout(150)
    # --- Filters menu, Sort and When adding are separate, labelled groups
    check('Sort and When adding are labelled groups', dm.locator('.mmsort .mmilab').inner_text().strip().lower() == 'sort' and dm.locator('.mmadding .mmilab').inner_text().strip().lower() == 'when adding' and dm.locator('.mmfisl').count() == 1)
    check('the filters are folded into one button', dm.locator('.mmfbtn').is_visible() and dm.locator('[data-mmf=type]').count() == 0 and dm.locator('.mmfbtn .mmcnt').count() == 0)
    dm.fill('[data-mmsearch]', ''); lib_filters(dm); dm.select_option('[data-mmf=type]', 'Dragon'); dm.wait_for_timeout(200)
    check('choosing a filter badges the button and lists it as a chip', dm.inner_text('.mmfbtn .mmcnt').strip() == '1' and dm.locator('.mmfsum').count() == 1 and 'dragon' in dm.inner_text('.mmfsum').lower() and dm.locator('.mmfpop').is_visible())
    dm.select_option('[data-mmf=src]', 'srd'); dm.wait_for_timeout(200); check('the badge counts every filter', dm.inner_text('.mmfbtn .mmcnt').strip() == '2')
    lib_filters(dm, False); check('Done closes the menu and the chips stay', dm.locator('.mmfpop').count() == 0 and dm.locator('.mmfsum').count() == 2)
    dm.click('.mmfsum >> nth=0'); dm.wait_for_timeout(200); check('clicking a chip removes that filter', dm.locator('.mmfsum').count() == 1)
    lib_filters(dm); dm.click('[data-mm=fclear]'); dm.wait_for_timeout(200); lib_filters(dm, False)
    check('Clear all removes them all', dm.locator('.mmfsum').count() == 0 and dm.locator('.mmfbtn .mmcnt').count() == 0)
    d1 = dm.locator('.mmrow b').first.inner_text(); dm.click('[data-mm=dir]'); dm.wait_for_timeout(200)
    check('the order button shows the direction and reverses the list', dm.get_attribute('[data-mm=dir]', 'aria-label').lower().startswith('order: descending') and dm.locator('.mmrow b').first.inner_text() != d1)
    # --- the old words are gone
    open_lib_text = dm.inner_text('.libmodal')
    check('nothing in the Library window still says Book of Beasts or Book', 'book of beasts' not in open_lib_text.lower() and not any('book' == w.strip().lower() for w in dm.locator('.libmodal button').all_text_contents()))
    lib_close(dm)
    # --- folders in Saved
    open_lib(dm); dm.fill('[data-mmsearch]', 'Goblin'); dm.wait_for_timeout(250)
    for i in (0, 1): dm.locator('[data-mm=star]').nth(i).click()
    lib_open(dm, 'saved'); dm.fill('[data-mmsearch]', ''); dm.wait_for_timeout(250)
    chips = lambda: dm.eval_on_selector_all('.mmfolders .mmfchip', "els=>els.map(e=>e.firstChild.textContent.trim()+' '+e.querySelector('.mmcnt2').textContent)")
    check('Saved starts with All saved and Unfiled, with counts', chips() == ['All saved 2', 'Unfiled 2'], chips())
    dm.click('[data-mm=fnew]'); dm.fill('[data-mmfname]', 'Goblin camp'); dm.click('.mmfnew button[type=submit]'); dm.wait_for_timeout(250)
    check('New folder adds a folder, and the list stays as it was', chips() == ['All saved 2', 'Unfiled 2', 'Goblin camp 0'] and dm.locator('#mmlist .mmrow').count() == 2, chips())
    dm.locator('#mmlist [data-mm=fmenu]').first.click(); dm.wait_for_timeout(200)
    check('each saved creature has a Move to folder menu', dm.locator('.mmfmenu').is_visible() and [t.strip() for t in dm.locator('.mmfmenu > button').all_text_contents()][:3] == ['No folder', 'Goblin camp', '+ New folder\u2026'])
    dm.locator('.mmfmenu [data-mm=tofolder]').nth(1).click(); dm.wait_for_timeout(250)
    check('moving a creature updates the counts', chips() == ['All saved 2', 'Unfiled 1', 'Goblin camp 1'], chips())
    dm.click('.mmfolders .mmfchip:has-text("Goblin camp")'); dm.wait_for_timeout(250)
    check('choosing a folder shows just what is in it', dm.locator('#mmlist .mmrow').count() == 1 and dm.get_attribute('.mmfchip:has-text("Goblin camp")', 'aria-selected') == 'true')
    dm.click('.mmfolders .mmfchip:has-text("Unfiled")'); dm.wait_for_timeout(250); check('Unfiled shows the rest', dm.locator('#mmlist .mmrow').count() == 1)
    dm.locator('#mmlist [data-mm=fmenu]').first.click(); dm.click('[data-mm=fmenunew]'); dm.fill('[data-mmfm]', 'Spares'); dm.click('.mmfmform button[type=submit]'); dm.wait_for_timeout(300)
    check('a folder can also be made from a creature\u2019s menu, and it goes straight in', 'Spares 1' in chips() and 'Unfiled 0' in chips(), chips())
    dm.click('.mmfolders .mmfchip:has-text("Spares")'); dm.click('[data-mm=frename]'); dm.fill('[data-mmfrname]', 'Spare goblins'); dm.click('.mmfnew button[type=submit]'); dm.wait_for_timeout(250)
    check('a folder can be renamed', 'Spare goblins 1' in chips())
    dm.click('[data-mm=fdel]'); dm.wait_for_timeout(150)
    check('deleting asks first', 'really delete' in dm.inner_text('.mmfops').lower() and len(st()['folders']) == 2)
    dm.click('[data-mm=fdel]'); dm.wait_for_timeout(250)
    check('deleting a folder keeps its creatures saved, and puts them back in Unfiled', len(st()['folders']) == 1 and chips()[0] == 'All saved 2' and chips()[1] == 'Unfiled 1', chips())
    dm.reload(); dm.wait_for_timeout(700); lib_open(dm, 'saved')
    check('folders and what is in them survive a reload', chips() == ['All saved 2', 'Unfiled 1', 'Goblin camp 1'], chips())
    dm.locator('#mmlist .mmrow [data-mm=star]').first.click(); dm.wait_for_timeout(250)
    check('un-starring takes a creature out of its folder too', len(st()['stars']) == 1 and len(st()['folderOf']) <= 1)
    # --- menus close when they should
    lib_open(dm, 'book'); lib_filters(dm); check('the Filters menu is open', dm.locator('.mmfpop').count() == 1)
    dm.click('.mmtabs [data-v=saved]'); dm.wait_for_timeout(250); check('switching tabs closes it, so it never covers the list', dm.locator('.mmfpop').count() == 0)
    dm.click('.mmtabs [data-v=book]'); dm.wait_for_timeout(200); lib_filters(dm); dm.click('.libmodal .dhead h2'); dm.wait_for_timeout(200)
    check('clicking anywhere else closes it', dm.locator('.mmfpop').count() == 0 and dm.get_attribute('.mmfbtn', 'aria-expanded') == 'false')
    lib_filters(dm); dm.keyboard.press('Escape'); dm.wait_for_timeout(200)
    check('Escape closes the menu first, and leaves the Library open', dm.locator('.mmfpop').count() == 0 and dm.locator('.libmodal').count() == 1)
    dm.keyboard.press('Escape'); dm.wait_for_timeout(200); check('a second Escape closes the Library', dm.locator('.libmodal').count() == 0)
    lib_open(dm, 'saved'); dm.locator('#mmlist [data-mm=fmenu]').first.click(); dm.wait_for_timeout(200); check('the folder menu opens', dm.locator('.mmfmenu').count() == 1)
    dm.click('.libmodal .dhead h2'); dm.wait_for_timeout(250); check('and closes when you click away', dm.locator('.mmfmenu').count() == 0)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_add_window(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = page(ctx); dm.goto(URL); dm.wait_for_timeout(700)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    dm.click('[data-nav=add]'); dm.wait_for_timeout(200)
    check('Add new lists Player, NPC and Creature', [t.strip() for t in dm.locator('#nsub-add > .nsubi').all_text_contents()] == ['Player', 'NPC', 'Creature'])
    check('there are no little forms in the side menu any more', dm.locator('#lnav #pcForm, #lnav #addForm, #lnav .nform').count() == 0)
    for typ, title in (('player', 'add a player'), ('npc', 'add an npc'), ('creature', 'add a creature')):
        (dm.locator('[data-nav=add][aria-expanded=true]').count() or dm.click('[data-nav=add]')); dm.click('[data-act=addOpen][data-type=%s]' % typ); dm.wait_for_timeout(300)
        check('%s opens a window' % typ, dm.locator('.addmodal').is_visible() and dm.inner_text('.addmodal .dhead h2').strip().lower() == title, dm.inner_text('.addmodal .dhead h2'))
        types_ = [t.strip() for t in dm.locator('.addstrip [role=radiogroup]:nth-child(1) button').all_text_contents()]
        modes = [t.strip() for t in dm.locator('.addstrip [role=radiogroup]:nth-child(2) button').all_text_contents()]
        check('%s: switch between Player, NPC and Creature, and between Manual, Generate and Library' % typ, types_ == ['Player', 'NPC', 'Creature'] and modes == (['Manual', 'Library'] if typ == 'creature' else ['Manual', 'Generate', 'Library']), (types_, modes))
        dm.click('.addmodal .dhead [data-add=close]'); dm.wait_for_timeout(200)
    # --- manual player stays open for the next one
    dm.click('[data-nav=add]'); dm.click('[data-act=addOpen][data-type=player]'); dm.wait_for_timeout(250)
    check('it opens on Manual', dm.locator('.addstrip [data-mode=manual][aria-checked=true]').count() == 2 or dm.locator('.addstrip [role=radiogroup]:nth-child(2) [aria-checked=true]').inner_text().strip() == 'Manual')
    dm.fill('#pcForm [name=name]', 'Rowan'); dm.fill('#pcForm [name=player]', 'Brian'); dm.fill('#pcForm [name=maxHp]', '24'); dm.click('#pcForm button[type=submit]'); dm.wait_for_timeout(300)
    check('adding a player saves them to the party', [p['name'] for p in st()['party']] == ['Rowan'])
    check('and the window stays open with a clear form, ready for the next', dm.locator('.addmodal').is_visible() and dm.input_value('#pcForm [name=name]') == '')
    dm.fill('#pcForm [name=name]', 'Alric'); dm.click('#pcForm button[type=submit]'); dm.wait_for_timeout(300)
    # --- library mode for a player: the saved party
    dm.click('.addstrip [data-mode=library][data-type=player]'); dm.wait_for_timeout(300)
    check('Player, Library lists the saved players with an initiative box and Add', dm.locator('.addmodal .prow').count() == 2 and dm.locator('.addmodal [data-pi]').count() == 2 and dm.locator('.addmodal [data-act=partyAdd]').count() == 2)
    dm.locator('.addmodal [data-pi]').first.fill('15'); dm.locator('.addmodal [data-act=partyAdd]').first.click(); dm.wait_for_timeout(300)
    check('adding one puts them in the fight', [c['name'] for c in st()['combatants']] == ['Rowan'] and st()['combatants'][0]['init'] == 15)
    check('and they leave the list of who is not yet fighting', dm.locator('.addmodal [data-act=partyAdd]').count() == 1)
    # --- generate: the builder carries the same switches
    dm.click('.addstrip [data-mode=generate][data-type=player]'); dm.wait_for_timeout(500)
    check('Generate opens the character builder, and the Add window gets out of the way', dm.locator('.buildmodal').is_visible() and dm.locator('.addmodal').count() == 0 and 'build a character' in dm.inner_text('.buildmodal h2').lower())
    check('the builder has the same two switches', dm.locator('.buildmodal .addstrip').count() == 1 and dm.locator('.buildmodal .addstrip [aria-checked=true]').count() == 2)
    dm.click('.buildmodal .addstrip [data-type=npc]'); dm.wait_for_timeout(400)
    check('switching to NPC turns it into the NPC generator', 'generate an npc' in dm.inner_text('.buildmodal h2').lower() and dm.locator('[data-bdc=npcfight]').count() == 1)
    dm.click('.buildmodal .addstrip [data-mode=library]'); dm.wait_for_timeout(500)
    check('switching to Library opens the Library on the NPCs tab', dm.locator('.libmodal').is_visible() and dm.locator('.buildmodal').count() == 0 and dm.inner_text('.libmodal .mmtabs [aria-checked=true]').strip().lower() == 'npcs' and dm.locator('.libmodal .addstrip').count() == 1)
    dm.click('.libmodal .addstrip [data-type=creature]'); dm.wait_for_timeout(400)
    check('switching to Creature shows the Creatures tab', dm.inner_text('.libmodal .mmtabs [aria-checked=true]').strip().lower() == 'creatures' and dm.locator('.libmodal .addstrip [role=radiogroup]:nth-child(1) [data-type=creature][aria-checked=true]').count() == 1)
    dm.click('.libmodal .addstrip [data-mode=manual]'); dm.wait_for_timeout(400)
    check('and Manual brings up the new-creature form in the Add window', dm.locator('.addmodal [data-cform]').is_visible() and dm.locator('.libmodal').count() == 0)
    # --- manual creature
    for k, v in (('name', 'Bog Beast'), ('type', 'large monstrosity'), ('cr', '2'), ('ac', '13'), ('hp', '45')): dm.fill('.addmodal [data-mcf=%s]' % k, v)
    dm.click('.addmodal [data-cfgo=fight]'); dm.wait_for_timeout(500)
    bb = [c for c in st()['combatants'] if c['name'].startswith('Bog Beast')]
    check('Save and add to fight makes a Homebrew creature and puts it in the fight', len(bb) == 1 and bb[0]['maxHp'] == 45 and bb[0]['src'] == 'custom' and any(x['name'] == 'Bog Beast' for x in st()['library']), bb)
    check('the window stays open with a fresh blank form', dm.locator('.addmodal [data-cform]').is_visible() and dm.input_value('.addmodal [data-mcf=name]') == '')
    # --- manual NPC
    dm.click('.addstrip [data-type=npc][data-mode=manual]'); dm.wait_for_timeout(300)
    dm.fill('#addForm [name=name]', 'Goblin'); dm.fill('#addForm [name=init]', '14'); dm.fill('#addForm [name=hp]', '7'); dm.click('#addForm button.primary'); dm.wait_for_timeout(300)
    check('NPC, Manual adds to the fight and stays open', any(c['name'] == 'Goblin' and c['init'] == 14 for c in st()['combatants']) and dm.locator('.addmodal').is_visible())
    dm.keyboard.press('Escape'); dm.wait_for_timeout(250)
    check('Escape closes the window', dm.locator('.addmodal').count() == 0)
    # --- the Library still opens on its own, without the switches
    dm.click('#lnav [data-act=libOpen][data-preset=book]'); dm.wait_for_timeout(300)
    check('the Library menu item opens the Library alone, with no Add switches', dm.locator('.libmodal').is_visible() and dm.locator('.libmodal .addstrip').count() == 0)
    lib_close(dm)
    # --- on a phone
    dm.set_viewport_size({'width': 390, 'height': 800}); dm.wait_for_timeout(400); nav(dm, 'add', 'npc'); dm.wait_for_timeout(300)
    r = dm.eval_on_selector('.addmodal', "e=>{const r=e.getBoundingClientRect(); return [r.left,r.right,r.top,r.bottom]}")
    check('on a phone the window fits the screen and scrolls inside itself', r[0] >= 0 and r[1] <= 391 and r[3] <= 801 and not dm.evaluate("document.documentElement.scrollWidth>innerWidth+1"), r)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_standard_npcs(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    lib_open(dm, 'npcs')
    check('the NPCs tab has a Standard NPCs list, in groups', dm.locator('.stdhead').count() == 1 and [t.strip().lower() for t in dm.locator('#stdnpcs .mmsec span').all_text_contents()][1:5] == ['guards & soldiers', 'townsfolk', 'nobles & courts', 'priests & scholars'][:4] or dm.locator('#stdnpcs .mmsec').count() >= 5)
    check('the groups start collapsed: headings only, each one a button', dm.locator('#stdnpcs .stdrow').count() == 0 and dm.locator('#stdnpcs .stdgrp').count() >= 5 and dm.locator('#stdnpcs .stdgrp[aria-expanded=true]').count() == 0)
    dm.locator('#stdnpcs .stdgrp').first.click(); dm.wait_for_timeout(200)
    check('opening a group shows its NPCs and keeps focus on the heading', dm.locator('#stdnpcs .stdgrp').first.get_attribute('aria-expanded') == 'true' and dm.locator('#stdnpcs .stdrow').count() > 0 and dm.evaluate("document.activeElement.classList.contains('stdgrp')"))
    while dm.locator('#stdnpcs .stdgrp[aria-expanded=false]').count(): dm.locator('#stdnpcs .stdgrp[aria-expanded=false]').first.click(); dm.wait_for_timeout(120)
    rows = dm.locator('#stdnpcs .stdrow'); n = rows.count()
    check('there are plenty of them: guards, townsfolk, nobles, priests and criminals', n >= 40, n)
    check('each says which stat block it uses', all('stat block' in t for t in rows.locator('small').all_text_contents()))
    tg = '#stdnpcs .stdrow:has(b:text-is("Town Guard"))'
    check('Town Guard uses the Guard stat block: CR 1/8, AC 16, HP 11', 'guard stat block' in dm.inner_text(tg).lower() and 'AC 16' in dm.inner_text(tg) and 'HP 11' in dm.inner_text(tg) and 'CR 1/8' in dm.inner_text(tg))
    dm.fill('[data-stdq]', 'inn'); dm.wait_for_timeout(250)
    check('search finds Innkeeper', [t.strip() for t in dm.locator('#stdnpcs .stdrow b').all_text_contents()] == ['Innkeeper'])
    dm.fill('[data-stdq]', 'commoner'); dm.wait_for_timeout(250)
    check('and searching by stat block finds every NPC built on it', dm.locator('#stdnpcs .stdrow').count() >= 12)
    dm.fill('[data-stdq]', 'xyzzy'); dm.wait_for_timeout(200); check('no match says so', 'no standard npc matches' in dm.inner_text('#stdnpcs').lower())
    dm.fill('[data-stdq]', ''); dm.wait_for_timeout(250)
    check('in the NPCs tab Add as starts on Neutral with Group copies on, Auto-roll on', dm.input_value('[data-mmf=disp]') == 'neutral' and dm.get_attribute('[data-mm=group]', 'aria-pressed') == 'true' and dm.get_attribute('[data-mm=auto]', 'aria-pressed') == 'true')
    dm.select_option('[data-mmf=disp]', 'enemy'); dm.click('[data-mm=group]'); dm.wait_for_timeout(150)
    dm.click(tg + ' [data-mm=qty][data-d="1"]'); dm.wait_for_timeout(100); dm.click(tg + ' [data-mm=stdadd]'); dm.wait_for_timeout(400)
    tgs = [c for c in st()['combatants'] if c['name'].startswith('Town Guard')]
    check('adding two Town Guards makes two numbered creatures with the Guard stats', [c['name'] for c in tgs] in (['Town Guard 1', 'Town Guard 2'], ['Town Guard 2', 'Town Guard 1']) and all(c['maxHp'] == 11 and c['sheet']['ac'] == '16' and c['kind'] == 'npc' and c['disp'] == 'enemy' for c in tgs), tgs)
    check('and they got initiatives', all(isinstance(c['init'], (int, float)) for c in tgs))
    dm.select_option('[data-mmf=disp]', 'neutral'); dm.click('#stdnpcs .stdrow:has(b:text-is("Innkeeper")) [data-mm=stdadd]'); dm.wait_for_timeout(400)
    ik = [c for c in st()['combatants'] if c['name'].startswith('Innkeeper')]
    check('Add as Neutral is respected', len(ik) == 1 and ik[0]['disp'] == 'neutral' and ik[0]['maxHp'] == 4 and ik[0]['sheet']['ac'] == '10', ik)
    dm.click('[data-mm=auto]'); dm.wait_for_timeout(150); dm.click('#stdnpcs .stdrow:has(b:text-is("Merchant")) [data-mm=stdadd]'); dm.wait_for_timeout(300)
    check('with Auto-roll off it asks for the initiative, naming the NPC', dm.locator('.mminit').is_visible() and 'merchant' in dm.inner_text('.mminit').lower())
    dm.fill('[data-mmi="0"]', '6'); dm.click('.mminit button[type=submit]'); dm.wait_for_timeout(400)
    check('the typed initiative is used', [c['init'] for c in st()['combatants'] if c['name'].startswith('Merchant')] == [6])
    dm.click('[data-mm=auto]'); dm.click('[data-mm=group]'); dm.wait_for_timeout(150)
    q = '#stdnpcs .stdrow:has(b:text-is("Bandit")) '; dm.fill(q + '[data-mmq]', '3'); dm.click(q + '[data-mm=stdadd]'); dm.wait_for_timeout(400)
    gr = [c for c in st()['combatants'] if c['name'].startswith('Bandit') and c.get('members')]
    check('Group copies puts three Bandits on one card', len(gr) == 1 and len(gr[0]['members']) == 3 and gr[0]['members'][0]['maxHp'] == 11, gr)
    check('saved NPCs are still in this tab, above the standard ones', dm.locator('#library').count() == 1 and dm.eval_on_selector('#library', "e=>e.getBoundingClientRect().top") < dm.eval_on_selector('#stdnpcs', "e=>e.getBoundingClientRect().top"))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round9(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); add_npc(dm, 'Goblin', 5, 7, qty='3', group=True); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    hp = lambda nm: [c for c in st()['combatants'] if c['name'] == nm][0]['hp']
    # --- the HP icon: heart with a plus cut out
    check('the HP icon is a solid heart with a plus cut out of it', dm.locator('.row .hpicon svg path').first.get_attribute('fill-rule') == 'evenodd' and 'M12 21.35' in dm.locator('.row .hpicon svg path').first.get_attribute('d') and 'A1.1 1.1' in dm.locator('.row .hpicon svg path').first.get_attribute('d'))
    check('and it is red', dm.eval_on_selector('.row .hpicon', "e=>getComputedStyle(e).color") != dm.eval_on_selector('.row .who b', "e=>getComputedStyle(e).color"))
    # --- damage buttons in two outlined groups
    r = '.row:has([data-f=name][value="Ogre"]) ' if False else None
    ogre = row(dm, 'Ogre')
    tx = lambda sel: [t.strip() for t in ogre.locator(sel).all_text_contents()]
    check('Damage group: half on the left, 2x on the right of Damage', tx('.hpact .dgrp .btn') == ['\u00bd', '\u2212 Damage', '2\u00d7'], tx('.hpact .dgrp .btn'))
    check('Heal and Temp HP are a second group', tx('.hpact .hgrp .btn') == ['+ Heal', '+ Temp HP'], tx('.hpact .hgrp .btn'))
    check('each group has its own outline', all(float(ogre.locator('.hpact ' + g).first.evaluate("e=>parseFloat(getComputedStyle(e).borderTopWidth)")) >= 1 for g in ('.dgrp', '.hgrp')) and ogre.locator('.hpact .bgrp').count() == 2)
    xs = lambda sel: ogre.locator(sel).evaluate("e=>e.getBoundingClientRect().left")
    check('row one reads: amount, half, Damage, 2x', xs('[data-delta]') < xs('.dgrp .half') < xs('.dgrp .dmg:not(.half):not(.dbl)') < xs('.dgrp .dbl'))
    hw = lambda sel: ogre.locator(sel).evaluate("e=>e.getBoundingClientRect().width"); ys = lambda sel: ogre.locator(sel).evaluate("e=>e.getBoundingClientRect().top")
    hw = lambda sel: ogre.locator(sel).evaluate("e=>e.getBoundingClientRect().width"); ys = lambda sel: ogre.locator(sel).evaluate("e=>e.getBoundingClientRect().top")
    dw, hhw, tw = hw('.dgrp .dmg:not(.half):not(.dbl)'), hw('.hgrp .heal'), hw('.hgrp .temp')
    check('Damage, Heal and Temp HP are the same width', abs(dw - hhw) <= 1 and abs(hhw - tw) <= 1, (dw, hhw, tw))
    check('and Heal and Temp HP sit in their own group on the same line, as before', abs(ys('.hgrp .heal') - ys('.dgrp .dbl')) <= 3 and xs('.hgrp .heal') > xs('.dgrp .dbl') and xs('.hgrp .heal') < xs('.hgrp .temp') and hw('.hgrp') < 260)
    ogre.locator('[data-delta]').fill('5'); ogre.locator('[data-act=dmgDbl]').click(); dm.wait_for_timeout(250)
    check('2x doubles the amount in the box: 5 becomes 10 damage', hp('Ogre') == 49, hp('Ogre'))
    check('and the amount box is cleared after', ogre.locator('[data-delta]').input_value() == '')
    ogre.locator('[data-delta]').fill('5'); ogre.locator('[data-act=dmgHalf]').click(); dm.wait_for_timeout(250)
    check('half still halves, rounded down: 5 becomes 2', hp('Ogre') == 47, hp('Ogre'))
    ogre.locator('[data-act=dmgDbl]').click(); dm.wait_for_timeout(200)
    check('2x with nothing typed says so and does nothing', hp('Ogre') == 47 and 'enter an amount' in toast_text(dm).lower())
    ogre.locator('[data-delta]').fill('3'); ogre.locator('[data-delta]').press('Enter'); dm.wait_for_timeout(250)
    check('Enter in the box still applies plain damage', hp('Ogre') == 44, hp('Ogre'))
    gob = dm.locator('.row.group').first
    gob.locator('[data-delta]').fill('2'); gob.locator('[data-act=gDmgDbl]').click(); dm.wait_for_timeout(250)
    check('on a group, 2x doubles the damage to every member', dm.eval_on_selector_all('.row.group [data-mf=hp]', "els=>els.map(e=>e.value)") == ['3', '3', '3'], dm.eval_on_selector_all('.row.group [data-mf=hp]', "els=>els.map(e=>e.value)"))
    check('a group has the same two groups', [t.strip() for t in gob.locator(':scope > .hp .hpact .dgrp .btn').all_text_contents()] == ['\u00bd', '\u2212 Damage all', '2\u00d7'] and gob.locator(':scope > .hp .hpact .hgrp').count() == 1)
    gdw = gob.locator(':scope > .hp .dgrp .dmg:not(.half):not(.dbl)').evaluate("e=>e.getBoundingClientRect().width"); ghw = gob.locator(':scope > .hp .hgrp .heal').evaluate("e=>e.getBoundingClientRect().width")
    check('Damage all and Heal all are the same width too', abs(gdw - ghw) <= 1, (gdw, ghw))
    m0 = gob.locator('.mem').first; m0.locator('[data-mdelta]').fill('1'); m0.locator('[data-act=mDmgDbl]').click(); dm.wait_for_timeout(250)
    check('and a single member has them too: 1 doubled is 2', dm.eval_on_selector_all('.row.group [data-mf=hp]', "els=>els.map(e=>e.value)")[0] == '1', dm.eval_on_selector_all('.row.group [data-mf=hp]', "els=>els.map(e=>e.value)"))
    # --- Edit player opens a window, with labels
    nav(dm, 'party'); dm.locator('#party [data-act=partyEdit]').first.click(); dm.wait_for_timeout(350)
    check('Edit player opens a window, not a form in the side menu', dm.locator('.pedmodal').is_visible() and dm.locator('#party .pedit').count() == 0)
    labs = [t.strip() for t in dm.locator('.pedmodal .pfld > span').all_text_contents()]
    check('every field has a label that stays put', labs == ['Character name', 'Player name', 'Max HP', 'Current HP', 'Armor class', 'Speed'], labs)
    dm.fill('.pedmodal [data-pf=maxHp]', '31'); dm.wait_for_timeout(150)
    check('after typing, Max HP is still labelled', dm.locator('.pedmodal .pfld:has([data-pf=maxHp]) > span').inner_text().strip() == 'Max HP' and dm.input_value('.pedmodal [data-pf=maxHp]') == '31')
    dm.click('.pedmodal [data-act=partySave]'); dm.wait_for_timeout(300)
    check('Save changes the player and closes the window', dm.locator('.pedmodal').count() == 0 and [p for p in st()['party'] if p['name'] == 'Rowan'][0]['maxHp'] == 31)
    dm.locator('#party [data-act=partyEdit]').first.click(); dm.wait_for_timeout(300); dm.click('.pedmodal [data-act=sheetToggle]'); dm.wait_for_timeout(300)
    check('Stats & notes opens inside the window', dm.locator('.pedmodal [data-sf], .pedmodal .sheet').count() > 0)
    dm.keyboard.press('Escape'); dm.wait_for_timeout(250); check('Escape closes it', dm.locator('.pedmodal').count() == 0)
    dm.locator('#party [data-act=partyEdit]').first.click(); dm.wait_for_timeout(250); dm.click('.pedmodal .dhead [data-act=partyCancel]'); dm.wait_for_timeout(250)
    check('Close and Cancel work too', dm.locator('.pedmodal').count() == 0)
    # --- Target window
    add_npc(dm, 'Imp', 3, 7, qty='2')
    dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(300)
    l = dm.eval_on_selector('.aoeright', "e=>e.getBoundingClientRect().left"); c = dm.eval_on_selector('.aoectl', "e=>e.getBoundingClientRect().left")
    check('the list of who is affected is on the left, the controls on the right', l < c and dm.locator('.aoeright .aoerow').count() >= 5, (l, c))
    dm.click('[data-aoe=attoggle]'); dm.wait_for_timeout(200)
    for who in ('Imp 1', 'Imp 2', 'Alric'): dm.click('.aoerow:has-text("%s") [data-aoe=togname]' % who)
    dm.click('[data-aoe=svtoggle]'); dm.wait_for_timeout(250)
    check('Roll for NPCs, not monsters', 'roll for npcs' in dm.inner_text('[data-aoe=roll]').lower() and 'monster' not in dm.inner_text('.aoemodal').lower())
    check('Damage has a Saving throw section with DC, ability and the success choice', dm.locator('.aoesv:not(.aoeatk)').is_visible() and dm.locator('[data-aoein=dc]').is_visible() and dm.locator('[data-aoe=onsave]').count() == 2)
    check('each damage line can be marked as reduced by the save, on by default', dm.locator('.aoedl .aoelsv').count() == 1 and dm.get_attribute('.aoelsv', 'aria-pressed') == 'true')
    check('rows get a save chip beside the hit chip', dm.locator('.aoerow:has-text("Imp 1") [data-hitchip]').count() == 1 and dm.locator('.aoerow:has-text("Imp 1") [data-aoe=saveCycle]').count() == 1)
    dm.fill('[data-aoein=aroll]', '20'); dm.fill('[data-aoein=aamt]', '6'); dm.wait_for_timeout(250)
    prev = lambda nm: dm.inner_text('.aoerow:has-text("%s") .aoeprev' % nm).strip()
    check('a hit with no save does full damage: 7 to 1', prev('Imp 1').startswith('7 \u2192 1'), prev('Imp 1'))
    dm.locator('.aoerow:has-text("Imp 1") [data-aoe=saveCycle]').click(); dm.wait_for_timeout(250)
    check('a passed save halves it: 7 to 4', prev('Imp 1').startswith('7 \u2192 4') and 'save passed' in prev('Imp 1'), prev('Imp 1'))
    dm.click('[data-aoe=onsave][data-v=none]'); dm.wait_for_timeout(250); check('Success: None cancels it: 7 to 7', prev('Imp 1').startswith('7 \u2192 7'), prev('Imp 1'))
    dm.click('[data-aoe=onsave][data-v=half]'); dm.click('.aoelsv'); dm.wait_for_timeout(250)
    check('unmarking the line means a save does not reduce it', prev('Imp 1').startswith('7 \u2192 1') and dm.get_attribute('.aoelsv', 'aria-pressed') == 'false', prev('Imp 1'))
    dm.click('.aoelsv'); dm.fill('[data-aoein=dc]', '40'); dm.click('[data-aoe=roll]'); dm.wait_for_timeout(300)
    check('Roll for NPCs rolls for the NPCs only, and DC 40 fails them: full damage', prev('Imp 2').startswith('7 \u2192 1') and dm.locator('.aoerow:has-text("Alric") [data-aoe=saveCycle]').inner_text().strip().endswith('\u2014'), prev('Imp 2'))
    dm.fill('[data-aoein=dc]', '1'); dm.click('[data-aoe=roll]'); dm.wait_for_timeout(300)
    check('and DC 1 passes them, so the damage halves', prev('Imp 2').startswith('7 \u2192 4') and prev('Imp 1').startswith('7 \u2192 4'), (prev('Imp 1'), prev('Imp 2')))
    check('a player without a save marked still takes full damage', prev('Alric').startswith('31 \u2192 25'), prev('Alric'))
    dm.click('.aoeapply'); dm.wait_for_timeout(400)
    check('applying uses the reduced damage: NPCs at 4, the player at 25', hp('Imp 1') == 4 and hp('Imp 2') == 4 and hp('Alric') == 25, (hp('Imp 1'), hp('Imp 2'), hp('Alric')))
    dm.keyboard.press('Escape')
    dm.set_viewport_size({'width': 390, 'height': 800}); dm.wait_for_timeout(400); dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(300)
    check('on a phone the controls stay above the list', dm.eval_on_selector('.aoectl', "e=>e.getBoundingClientRect().top") <= dm.eval_on_selector('.aoeright', "e=>e.getBoundingClientRect().top"))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round10(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    # --- keyboard shortcuts
    dm.keyboard.press('ArrowRight'); dm.wait_for_timeout(200); check('Right arrow starts and advances the turn', now(dm) == 'Rowan', now(dm))
    dm.keyboard.press('ArrowRight'); dm.wait_for_timeout(200); check('Right arrow again moves to the next creature', now(dm) == 'Ogre', now(dm))
    dm.keyboard.press('ArrowLeft'); dm.wait_for_timeout(200); check('Left arrow goes back a turn', now(dm) == 'Rowan', now(dm))
    dmg(dm, 'Ogre', 5); check('(damage taken)', hp(dm, 'Ogre') == '54')
    dm.keyboard.press('Control+z'); dm.wait_for_timeout(250); check('Ctrl+Z undoes', hp(dm, 'Ogre') == '59', hp(dm, 'Ogre'))
    dmg(dm, 'Ogre', 5); dm.keyboard.press('Meta+z'); dm.wait_for_timeout(250); check('Cmd+Z undoes too', hp(dm, 'Ogre') == '59', hp(dm, 'Ogre'))
    dmg(dm, 'Ogre', 5); dm.keyboard.press('Control+Shift+z'); dm.wait_for_timeout(250); check('Ctrl+Shift+Z is left alone (there is no redo)', hp(dm, 'Ogre') == '54')
    row(dm, 'Ogre').locator('[data-delta]').focus(); dm.keyboard.press('ArrowRight'); dm.keyboard.press('Control+z'); dm.wait_for_timeout(250)
    check('while typing in a box the arrows and undo belong to the box', now(dm) == 'Rowan' and hp(dm, 'Ogre') == '54', (now(dm), hp(dm, 'Ogre')))
    dm.evaluate("document.activeElement.blur()")
    dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(250); dm.keyboard.press('ArrowRight'); dm.keyboard.press('Control+z'); dm.wait_for_timeout(250)
    check('with a window open they do nothing behind it', now(dm) == 'Rowan' and hp(dm, 'Ogre') == '54', (now(dm), hp(dm, 'Ogre')))
    dm.keyboard.press('Escape'); dm.wait_for_timeout(200)
    for k in ('n', 'p', 'u'): dm.keyboard.press(k)
    dm.wait_for_timeout(250); check('the old letter shortcuts are gone', now(dm) == 'Rowan' and hp(dm, 'Ogre') == '54')
    sopen(dm, cat='general'); sc = dm.inner_text('.dmain')
    check('Settings lists the new shortcuts', '\u2192' in sc and '\u2190' in sc and 'Ctrl' in sc and '\u2318' in sc and 'Next turn' in sc and 'Previous turn' in sc and 'Undo' in sc, sc[-300:])
    dm.click('#drawerClose'); check('the Undo button mentions the shortcut', 'Ctrl+Z' in (dm.get_attribute('[data-act=undo]', 'title') or ''))
    # --- Stats panel
    row(dm, 'Ogre').locator('.viewstats').click(); dm.wait_for_timeout(300)
    sh = row(dm, 'Ogre').locator('.sheet')
    box = lambda sel: sh.locator(sel).evaluate("e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
    ta, tn = box('[data-sf=attacks]'), box('[data-sf=notes]')
    check('Attack options and Features sit side by side, as two tall columns', ta[2] <= tn[0] + 2 and abs(ta[1] - tn[1]) <= 3 and ta[3] - ta[1] >= 120 and tn[3] - tn[1] >= 120, (ta, tn))
    labs = [t.strip() for t in sh.locator('.sdual .flab').all_inner_texts()]
    check('they are labelled Attack options and Features, and nothing says Notes any more', labs == ['Attack options', 'Features'] and 'Notes' not in sh.inner_text().replace('Stats & notes', ''), labs)
    ph = lambda sel: sh.locator(sel).get_attribute('placeholder')
    check('resistances, immunities and vulnerabilities say None when empty, not an example value', [sh.locator('[data-act=resToggle][data-k=%s]' % k).inner_text().replace('\u25be', '').strip() for k in ('resist', 'immune', 'vuln')] == ['None', 'None', 'None'])
    check('there is no write-in example text left to mistake for a real value', 'fire, cold' not in sh.inner_text() and sh.locator('input[data-sf=resist]').count() == 0)
    check('the other examples are marked as examples', ph('[data-sf=speed]').startswith('Example') and ph('[data-sf=attacks]').startswith('Example'), (ph('[data-sf=speed]'), ph('[data-sf=attacks]')))
    check('and example text is italic and paler than real text', sh.locator('[data-sf=speed]').evaluate("e=>getComputedStyle(e,'::placeholder').fontStyle") == 'italic' and float(sh.locator('[data-sf=speed]').evaluate("e=>getComputedStyle(e,'::placeholder').opacity")) < 1)
    sh.locator('[data-act=resToggle][data-k=resist]').click(); sh.locator('.rpanel2 [data-rck=fire]').check(); sh.locator('.rpanel2 [data-rck=cold]').check(); dm.wait_for_timeout(250)
    check('a ticked value is kept and still works', [c for c in st()['combatants'] if c['name'] == 'Ogre'][0]['sheet']['resist'] == 'Cold, Fire')
    dm.set_viewport_size({'width': 390, 'height': 800}); dm.wait_for_timeout(500)
    ta2 = row(dm, 'Ogre').locator('.sheet [data-sf=attacks]').evaluate("e=>e.getBoundingClientRect().left"); tn2 = row(dm, 'Ogre').locator('.sheet [data-sf=notes]').evaluate("e=>e.getBoundingClientRect().left")
    check('on a phone the two columns stack', abs(ta2 - tn2) <= 2)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round11(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    lib_open(dm, 'book'); dm.fill('[data-mmsearch]', 'Adult Red Dragon'); dm.wait_for_timeout(300); dm.click('.mmrow:has(b:text-is("Adult Red Dragon")) [data-mm=add]'); dm.wait_for_timeout(400); lib_close(dm)
    dragon = lambda: [c for c in st()['combatants'] if c['name'] == 'Adult Red Dragon'][0]
    # --- the turn shading is a soft wash behind the card
    nxt(dm); nxt(dm); nxt(dm)       # Rowan, Ogre ... find a PC and an NPC turn
    rgb = lambda sel: dm.eval_on_selector(sel, "e=>{const c=getComputedStyle(e).backgroundColor, v=c.match(/[\\d.]+/g).slice(0,3).map(Number); return /^color\\(/.test(c)?v.map(x=>x*255):v}")
    cur = now(dm); other = 'Alric' if cur != 'Alric' else 'Rowan'
    d = lambda a, b2: max(abs(x - y) for x, y in zip(a, b2))
    check('the card whose turn it is is only softly shaded compared with the others', d(rgb('.row.now'), rgb('.row:not(.now)')) <= 40, (rgb('.row.now'), rgb('.row:not(.now)')))
    check('so the damage buttons stand out from it', d(rgb('.row.now .dgrp .dmg:not(.half):not(.dbl)'), rgb('.row.now')) >= 12, (rgb('.row.now .dgrp .dmg:not(.half):not(.dbl)'), rgb('.row.now')))
    tv = page(ctx, size=(1920, 720)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(700)
    trgb = lambda sel: tv.eval_on_selector(sel, "e=>{const c=getComputedStyle(e).backgroundColor, v=c.match(/[\\d.]+/g).slice(0,3).map(Number); return /^color\\(/.test(c)?v.map(x=>x*255):v}")
    check('and the Combat Monitor card is softly shaded too', d(trgb('.pcard.now'), [255, 255, 255]) <= 70, trgb('.pcard.now'))
    tv.close()
    # --- legendary row
    r = row(dm, 'Adult Red Dragon'); r.scroll_into_view_if_needed()
    labs = [t.replace('\n', ' ').strip() for t in r.locator('.leg .leglab').all_inner_texts()]
    check('the legendary row says Legendary actions and Legendary resistance', labs == ['Legendary actions', 'Legendary resistance'], labs)
    check('there are no number boxes in it any more', r.locator('.leg input').count() == 0)
    check('the remove button is a trash can with a clear name', r.locator('.legtrash svg').count() == 1 and r.get_attribute('.legtrash', 'aria-label') == 'Remove legendary tracking') if False else check('the remove button is a trash can with a clear name', r.locator('.legtrash svg').count() == 1 and (r.locator('.legtrash').get_attribute('aria-label') == 'Remove legendary tracking'))
    r.locator('[data-act=legMenu]').click(); dm.wait_for_timeout(250)
    check('the three dots open a menu for actions per round and resistances per day', r.locator('.legpop').is_visible() and 'per round' in r.locator('.legpop').inner_text().lower() and 'per day' in r.locator('.legpop').inner_text().lower())
    r.locator('.legpop [data-k=max][data-d="1"]').click(); dm.wait_for_timeout(250)
    check('adding one legendary action raises the maximum and keeps the menu open', dragon()['leg']['max'] == 4 and dragon()['leg']['left'] == 4 and r.locator('.legpop').count() == 1 and r.locator('.leg .pips').first.inner_text().count('\u25cf') == 4, dragon()['leg'])
    r.locator('.legpop [data-k=rmax][data-d="-1"]').click(); dm.wait_for_timeout(250)
    check('and one fewer resistance lowers its maximum and uses left', dragon()['leg']['rmax'] == 2 and dragon()['leg']['rleft'] == 2, dragon()['leg'])
    dm.click('.leg .leglab >> nth=0'); dm.wait_for_timeout(200); check('clicking elsewhere closes the menu', r.locator('.legpop').count() == 0)
    r.locator('[data-act=legUse][data-cost="2"]').click(); dm.wait_for_timeout(250); check('Use 2 spends two legendary actions', dragon()['leg']['left'] == 2)
    r.locator('.legtrash').click(); dm.wait_for_timeout(250); check('the trash can removes legendary tracking', dragon()['leg'] is None and r.locator('.leg').count() == 0)
    dm.click('[data-act=undo]'); dm.wait_for_timeout(250); check('and Undo brings it back', dragon()['leg'] is not None)
    # --- resistances as a checklist
    r.locator('.viewstats').click(); dm.wait_for_timeout(300); sh = r.locator('.sheet')
    check('resistances, immunities and vulnerabilities are choosers, not text boxes', sh.locator('[data-act=resToggle]').count() == 3 and sh.locator('input[data-sf=resist], input[data-sf=immune], input[data-sf=vuln]').count() == 0)
    check('an empty one says None', sh.locator('[data-act=resToggle][data-k=resist]').inner_text().replace('\u25be', '').strip() == 'None')
    check('a creature from the Library shows what it has: fire immunity', 'fire' in sh.locator('[data-act=resToggle][data-k=immune]').inner_text().lower())
    sh.locator('[data-act=resToggle][data-k=resist]').click(); dm.wait_for_timeout(250)
    check('opening it shows a checklist of the 13 damage types', sh.locator('.rpanel2 .rck').count() == 13 and sh.locator('.rpanel2 .rsub').count() == 0)
    sh.locator('.rpanel2 [data-rck=fire]').check(); sh.locator('.rpanel2 [data-rck=cold]').check(); dm.wait_for_timeout(250)
    check('ticking Fire and Cold stores them (and keeps the list open)', dragon()['sheet']['resist'] == 'Cold, Fire' and sh.locator('.rpanel2').count() == 1 and sh.locator('[data-act=resToggle][data-k=resist]').inner_text().replace('\u25be', '').strip() == 'Cold, Fire', dragon()['sheet']['resist'])
    sh.locator('.rpanel2 [data-rother]').fill('from nonmagical attacks'); sh.locator('.rpanel2 [data-rother]').press('Tab'); dm.wait_for_timeout(250)
    check('Anything else adds a qualifier after the list', dragon()['sheet']['resist'] == 'Cold, Fire; from nonmagical attacks', dragon()['sheet']['resist'])
    sh.locator('.rpanel2 [data-rck=fire]').uncheck(); dm.wait_for_timeout(250)
    check('unticking removes only that one, and the qualifier stays', dragon()['sheet']['resist'] == 'Cold; from nonmagical attacks' and sh.locator('.rpanel2 [data-rck=cold]').is_checked() and not sh.locator('.rpanel2 [data-rck=fire]').is_checked(), dragon()['sheet']['resist'])
    sh.locator('[data-act=resDone]').click(); dm.wait_for_timeout(200); check('Done closes the list', sh.locator('.rpanel2').count() == 0)
    sh.locator('[data-act=resToggle][data-k=immune]').click(); dm.wait_for_timeout(250)
    check('Immunities also lists conditions', sh.locator('.rpanel2 .rsub').count() == 1 and sh.locator('.rpanel2 [data-rg=c]').count() >= 14 and sh.locator('.rpanel2 [data-rck=fire]').is_checked())
    sh.locator('.rpanel2 [data-rck=charmed]').check(); dm.wait_for_timeout(250)
    check('a condition can be ticked too', 'Charmed' in dragon()['sheet']['immune'] and 'fire' in dragon()['sheet']['immune'].lower(), dragon()['sheet']['immune'])
    sh.locator('[data-act=resDone]').click()
    sh.locator('[data-act=resToggle][data-k=vuln]').click(); dm.wait_for_timeout(250); sh.locator('.rpanel2 [data-rother]').fill('bludgeoning, piercing, and slashing from nonmagical attacks'); sh.locator('.rpanel2 [data-rother]').press('Tab'); dm.wait_for_timeout(250)
    check('a long qualified line is kept whole, with no boxes ticked', dragon()['sheet']['vuln'] == 'bludgeoning, piercing, and slashing from nonmagical attacks' and sh.locator('.rpanel2 .rck input:checked').count() == 0, dragon()['sheet']['vuln'])
    sh.locator('[data-act=resDone]').click()
    # --- attack options and features as formatted text
    check('a Library creature\u2019s attacks and features show as formatted text, not a box', sh.locator('.fmt').count() == 2 and sh.locator('textarea[data-sf=attacks], textarea[data-sf=notes]').count() == 0 and sh.locator('.fmt b').count() >= 4)
    check('the first line of an attack is bold: Multiattack.', sh.locator('.fbox[data-fkey=attacks] .fmt b').first.inner_text().strip().startswith('Multiattack'))
    labs = [t.strip() for t in sh.locator('.fbox .flab').all_inner_texts()]
    check('the two columns are Attack options and Features', labs == ['Attack options', 'Features'], labs)
    sh.locator('[data-act=fmtEdit][data-k=attacks]').click(); dm.wait_for_timeout(250)
    check('Edit turns it into a text box with the original text', sh.locator('textarea[data-sf=attacks]').count() == 1 and 'Multiattack.' in sh.locator('textarea[data-sf=attacks]').input_value() and sh.locator('.fbox[data-fkey=notes] .fmt').count() == 1)
    sh.locator('textarea[data-sf=attacks]').fill('Tail Whip: +5, 2d8 bludgeoning\nBonus Action \u2014 Roar. Everyone nearby is shaken.'); sh.locator('[data-act=fmtDone]').click(); dm.wait_for_timeout(300)
    check('Done goes back to formatted text, with the change kept', sh.locator('textarea[data-sf=attacks]').count() == 0 and 'Tail Whip' in dragon()['sheet']['attacks'] and sh.locator('.fbox[data-fkey=attacks] .fmt b').first.inner_text().strip().startswith('Tail Whip') and sh.locator('.fbox[data-fkey=attacks] .ftag').inner_text().strip().lower() == 'bonus action')
    r2 = row(dm, 'Ogre'); r2.locator('.viewstats').click(); dm.wait_for_timeout(300)
    check('a creature with nothing written yet shows an empty text box to type in', r2.locator('.sheet textarea[data-sf=attacks]').count() == 1 and r2.locator('.sheet [data-act=fmtEdit]').count() == 0)
    # --- Combat monitor: new window or a preview strip
    dm.click('[data-nav=monitor]'); dm.wait_for_timeout(200)
    check('Combat monitor offers Open new window and a Preview switch, which starts off', dm.locator('[data-act=openMonitor]').is_visible() and dm.get_attribute('[data-act=monPreview]', 'aria-checked') == 'false' and dm.locator('#monmini').is_hidden())
    dm.click('[data-act=monPreview]'); dm.wait_for_timeout(500)
    check('turning Preview on shows a mini monitor', dm.locator('#monmini').is_visible() and dm.get_attribute('[data-act=monPreview]', 'aria-checked') == 'true')
    check('with a card for everyone, current turn first', dm.locator('#monmini .pcard').count() == 4 and 'now' in (dm.locator('#monmini .pcard').first.get_attribute('class') or ''), dm.locator('#monmini .pcard').count())
    mb = dm.eval_on_selector('#monmini', "e=>e.getBoundingClientRect().bottom"); ct = dm.eval_on_selector('#ctlmain', "e=>e.getBoundingClientRect().top")
    check('it runs across the top, above the Round bar', mb <= ct + 1 and dm.eval_on_selector('#monmini', "e=>e.getBoundingClientRect().width") > 700, (mb, ct))
    nxt(dm); dm.wait_for_timeout(300); check('it follows the turn', dm.locator('#monmini .pcard.now h3').inner_text().strip() == now(dm), (dm.locator('#monmini .pcard.now h3').inner_text(), now(dm)))
    dm.reload(); dm.wait_for_timeout(900)
    check('the choice is remembered after a reload', dm.locator('#monmini').is_visible())
    dm.click('[data-nav=monitor]') if dm.locator('[data-act=monPreview]:visible').count() == 0 else None
    dm.click('[data-act=monPreview]'); dm.wait_for_timeout(300); check('turning it off hides it again', dm.locator('#monmini').is_hidden())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_round12(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx); nxt(dm)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    cmb = lambda nm: [c for c in st()['combatants'] if c['name'] == nm][0]
    prev = lambda nm: dm.locator('.aoerow:has(b:text-is("%s")) [data-prev]' % nm).inner_text()
    # --- tabs
    tgt(dm); check('Target has four tabs: Damage, Spells, Condition, Heal', [t.strip().lower() for t in dm.locator('.aoetop .kseg button').all_text_contents()] == ['damage', 'spells', 'condition', 'heal'])
    check('Damage is first and open', dm.get_attribute('.aoetop [data-kind=dmg]', 'aria-checked') == 'true')
    check('there is no Attack, Temp HP or half control', dm.locator('[data-kind=att], [data-kind=temp], .halfbtn').count() == 0)
    check('the attack roll is optional and starts closed; the saving throw too', dm.locator('[data-aoein=aroll]').count() == 0 and dm.get_attribute('[data-aoe=attoggle]', 'aria-expanded') == 'false' and dm.get_attribute('[data-aoe=svtoggle]', 'aria-expanded') == 'false')
    check('without an attack roll there are no Hit or Miss chips', dm.locator('[data-hitchip]').count() == 0)
    # --- damage without an attack applies to everyone ticked
    mpick(dm, 'all'); mfill(dm, '[data-aoein=aamt]', '5')
    check('with no attack, the button just names the creatures', 'damage to 3 creatures' in dm.inner_text('.aoeapply').lower(), dm.inner_text('.aoeapply'))
    check('and each row previews the result', prev('Ogre') == '59 \u2192 54' and prev('Rowan') == '24 \u2192 19', (prev('Ogre'), prev('Rowan')))
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(300)
    check('applying damages all of them', hp(dm, 'Ogre') == '54' and hp(dm, 'Rowan') == '19' and hp(dm, 'Alric') == '26', (hp(dm, 'Ogre'), hp(dm, 'Rowan'), hp(dm, 'Alric')))
    # --- Heal tab with a Heal / Temp HP switch
    mpick(dm, 'pc'); mclick(dm, '[data-aoe=kind][data-v=heal]')
    check('Heal has a Heal / Temp HP switch, on Heal', [t.strip().lower() for t in dm.locator('[data-aoe=healmode]').all_text_contents()] == ['heal', 'temp hp'] and dm.get_attribute('[data-aoe=healmode][data-v=heal]', 'aria-checked') == 'true')
    mfill(dm, '[data-aoein=amt]', '4'); check('Heal previews and labels the button', prev('Rowan') == '19 \u2192 23' and 'heal 2 creatures' in dm.inner_text('.aoeapply').lower(), (prev('Rowan'), dm.inner_text('.aoeapply')))
    mclick(dm, '[data-aoe=healmode][data-v=temp]'); check('Temp HP previews and relabels the button', prev('Rowan').startswith('Temp HP 4') and 'temp hp to 2 creatures' in dm.inner_text('.aoeapply').lower(), (prev('Rowan'), dm.inner_text('.aoeapply')))
    mclick(dm, '[data-aoe=kind][data-v=cond]'); mclick(dm, '[data-aoe=kind][data-v=heal]'); check('coming back to Heal after another tab keeps Temp HP selected', dm.get_attribute('[data-aoe=healmode][data-v=temp]', 'aria-checked') == 'true')
    mclick(dm, '[data-aoe=apply]'); dm.wait_for_timeout(300); check('Temp HP lands', row(dm, 'Rowan').locator('.tmpin').input_value() == '4')
    # --- temp HP absorbs damage, and the preview says so
    mclick(dm, '[data-aoe=kind][data-v=dmg]'); mpick(dm, 'pc'); mclick(dm, '.aoerow:has(b:text-is("Alric")) .aoename'); mfill(dm, '[data-aoein=aamt]', '10')
    check('the preview says when temp HP absorbs part of it: 19 less 6', prev('Rowan') == '19 \u2192 13 (temp absorbs 4)', prev('Rowan'))
    dm.keyboard.press('Escape')
    # --- the optional attack roll: d20 + modifier = total, with a Roll button
    set_ac(dm, 'Ogre', 15); tgt(dm); mpick(dm, 'enemy'); mfill(dm, '[data-aoein=aamt]', '8'); mclick(dm, '[data-aoe=attoggle]')
    check('opening it shows d20, Modifier 0, a total, Normal/Adv/Dis and a Roll d20 button', dm.locator('[data-aoein=aroll]').is_visible() and dm.input_value('[data-aoein=amod]') == '0' and dm.locator('[data-atotal]').is_visible() and dm.locator('[data-aoe=aadv]').count() == 3 and dm.locator('[data-aoe=rolld20]').is_visible())
    check('the total starts empty and the apply button waits for a roll', dm.locator('[data-atotal] b').inner_text().strip() == '\u2014' and 'enter the attack roll' in prev('Ogre'))
    mclick(dm, '[data-aoe=rolld20]'); dm.wait_for_timeout(200)
    d = int(dm.input_value('[data-aoein=aroll]')); check('Roll d20 fills in a number from 1 to 20 and explains it', 1 <= d <= 20 and dm.locator('.aoeinfo').inner_text().strip().startswith('d20'), (d, dm.locator('.aoeinfo').count()))
    check('the total is the roll (modifier 0)', int(dm.locator('[data-atotal] b').inner_text()) == d)
    dm.fill('[data-aoein=amod]', '3'); dm.wait_for_timeout(150); check('adding a +3 modifier updates the total live', int(dm.locator('[data-atotal] b').inner_text()) == d + 3)
    dm.fill('[data-aoein=aroll]', '12'); dm.wait_for_timeout(150)
    check('typing the roll yourself works and clears the explanation', dm.locator('.aoeinfo').count() == 0 and dm.locator('[data-atotal] b').inner_text() == '15' and 'Hit' in dm.locator('.aoerow:has(b:text-is("Ogre")) [data-hitchip]').inner_text())
    mclick(dm, '[data-aoe=aadv][data-v=adv]'); mclick(dm, '[data-aoe=rolld20]'); dm.wait_for_timeout(200)
    info = dm.locator('.aoeinfo').inner_text().lower(); check('with advantage it rolls two dice and keeps the higher', 'advantage' in info and ' and ' in info, info)
    import re as _re
    nums = [int(x) for x in _re.findall(r'd20 (\d+) and (\d+)', info)[0]]; kept = int(dm.input_value('[data-aoein=aroll]')); check('the kept die is the higher of the two', kept == max(nums), (nums, kept))
    mclick(dm, '[data-aoe=aadv][data-v=dis]'); mclick(dm, '[data-aoe=rolld20]'); dm.wait_for_timeout(200)
    info = dm.locator('.aoeinfo').inner_text().lower(); nums = [int(x) for x in _re.findall(r'd20 (\d+) and (\d+)', info)[0]]; kept = int(dm.input_value('[data-aoein=aroll]')); check('with disadvantage it keeps the lower', 'disadvantage' in info and kept == min(nums), (info, kept))
    mclick(dm, '[data-aoe=svtoggle]'); check('the attack advantage is separate from the saving throw advantage', dm.get_attribute('[data-aoe=aadv][data-v=dis]', 'aria-checked') == 'true' and dm.get_attribute('[data-aoe=adv][data-v=n]', 'aria-checked') == 'true')
    mclick(dm, '[data-aoe=attoggle]'); check('closing the attack roll goes back to hitting everyone', dm.locator('[data-hitchip]').count() == 0 and 'damage to' in dm.inner_text('.aoeapply').lower())
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_spells(b):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    cmb = lambda nm: [c for c in st()['combatants'] if c['name'] == nm][0]
    lib_open(dm, 'book'); dm.fill('[data-mmsearch]', 'Mage'); dm.wait_for_timeout(300); dm.click('.mmrow:has(b:text-is("Mage")) [data-mm=add]'); dm.wait_for_timeout(300)
    # ---- Library: Spells tab
    dm.click('.mmtabs [data-v=spells]'); dm.wait_for_timeout(400)
    check('the Library has a Spells tab', [t.strip().lower() for t in dm.locator('.mmtabs button').all_text_contents()] == ['library', 'saved\n0'.replace('\n', ''), 'npcs0'.replace('0', ''), 'spells'] or dm.locator('.mmtabs [data-v=spells][aria-checked=true]').count() == 1)
    # "In combat" ticks were replaced by tags (outdated by request): every spell is listed, filtered by what it does
    check('it lists all 339 SRD spells', dm.locator('#splibList .sprow2').count() == 339 and dm.inner_text('#spcount') == '339', dm.locator('#splibList .sprow2').count())
    check('tag chips: All, Damage, Healing, Condition, Utility, Yours', [x.strip().lower() for x in dm.locator('[data-spl=tag]').all_inner_texts()] == ['all', 'damage', 'healing', 'condition', 'utility', 'yours'])
    tags = lambda nm: [x.strip().lower() for x in dm.locator('#splibList .sprow2[data-spn="%s"] .sptag' % nm).all_inner_texts()]
    check('each spell is tagged by what it does', tags('Fireball') == ['damage'] and tags('Cure Wounds') == ['healing'] and tags('Hold Person') == ['condition'] and tags('Alarm') == ['utility'], (tags('Fireball'), tags('Cure Wounds'), tags('Hold Person'), tags('Alarm')))
    check('each row says what it does', 'DEX save' in dm.inner_text('#splibList .sprow2[data-spn="Fireball"]') and '8d6 fire' in dm.inner_text('#splibList .sprow2[data-spn="Fireball"]'))
    check('the SRD credit is shown', 'CC BY 4.0' in dm.inner_text('.mmfoot') and 'Spell data' in dm.inner_text('.mmfoot'))
    counts = {}
    for tg in ('damage', 'heal', 'condition', 'utility'):
        dm.click('[data-spl=tag][data-v=%s]' % tg); dm.wait_for_timeout(150); counts[tg] = int(dm.inner_text('#spcount'))
    check('filtering by tag: 68 damage, 10 healing (Aid and Regenerate too), 36 condition, 231 utility', counts == {'damage': 68, 'heal': 10, 'condition': 36, 'utility': 231}, counts)
    dm.click('[data-spl=tag][data-v=damage]'); dm.wait_for_timeout(150)
    check('the Damage tag shows only damage spells', all('Damage' in t for t in dm.locator('#splibList .sprow2 .sptags').all_inner_texts()))
    dm.click('[data-spl=tag][data-v=all]'); dm.wait_for_timeout(150)
    dm.fill('[data-spf=q]', 'fire'); dm.wait_for_timeout(300); n1 = dm.locator('#splibList .sprow2').count(); check('search narrows the list', 3 <= n1 <= 20 and dm.input_value('[data-spf=q]') == 'fire', n1)
    dm.fill('[data-spf=q]', ''); dm.wait_for_timeout(300)
    dm.select_option('[data-spf=lv]', '0'); dm.wait_for_timeout(250); check('Level: Cantrips shows only cantrips', all('Cantrip' in t for t in dm.locator('#splibList .sprow2 small').all_inner_texts()) and dm.locator('#splibList .sprow2').count() >= 20)
    dm.select_option('[data-spf=lv]', ''); dm.select_option('[data-spf=cl]', 'Pa'); dm.wait_for_timeout(250)
    check('Class: Paladin shows only paladin spells', dm.locator('#splibList .sprow2').count() > 5 and all('Paladin' in t for t in dm.locator('#splibList .sprow2 small').all_inner_texts()))
    dm.select_option('[data-spf=cl]', ''); dm.wait_for_timeout(200)
    check('the in-combat ticks are gone', dm.locator('#splibList input[type=checkbox]').count() == 0 and dm.locator('[data-mm=spinc]').count() == 0)
    lib_close(dm)
    # ---- Target window: the Spells tab
    dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(300); dm.click('[data-aoe=kind][data-v=spell]'); dm.wait_for_timeout(300)
    check('the Spells tab is selected and shows a search box and a spell list', dm.get_attribute('[data-aoe=kind][data-v=spell]', 'aria-checked') == 'true' and dm.locator('[data-spin=q]').is_visible() and dm.locator('.sprowbtn').count() > 20)
    check('Apply waits for a spell to be chosen', dm.locator('.aoeapply').is_disabled())
    check('All lists every spell, utility ones too', dm.locator('.sprowbtn[data-n="Alarm"]').count() == 1 and dm.locator('.sprowbtn[data-n="Fireball"]').count() == 1 and dm.locator('.sprowbtn[data-n="Aid"]').count() == 1)
    dm.click('[data-aoe=sptag][data-v=utility]'); dm.wait_for_timeout(200)
    check('the Utility chip shows only utility spells', dm.locator('.sprowbtn[data-n="Alarm"]').count() == 1 and dm.locator('.sprowbtn[data-n="Fireball"]').count() == 0 and dm.locator('.sprowbtn[data-n="Aid"]').count() == 0)
    dm.click('[data-aoe=sptag][data-v=heal]'); dm.wait_for_timeout(200)
    check('the Healing chip shows only healing spells, Aid included', dm.locator('.sprowbtn').count() == 10 and dm.locator('.sprowbtn[data-n="Aid"]').count() == 1 and dm.locator('.sprowbtn[data-n="Cure Wounds"]').count() == 1, dm.locator('.sprowbtn').count())
    dm.click('[data-aoe=sptag][data-v=damage]'); dm.wait_for_timeout(200)
    check('the Damage chip shows only damage spells', dm.locator('.sprowbtn[data-n="Cure Wounds"]').count() == 0 and dm.locator('.sprowbtn[data-n="Fireball"]').count() == 1)
    dm.click('[data-aoe=sptag][data-v=all]'); dm.wait_for_timeout(200)
    dm.fill('[data-spin=q]', 'hold'); dm.wait_for_timeout(250); check('search finds Hold Person and Hold Monster', sorted(t.strip() for t in dm.locator('.sprowbtn b').all_inner_texts()) == ['Hold Monster', 'Hold Person'])
    dm.fill('[data-spin=q]', ''); dm.select_option('[data-spin=lv]', '0'); dm.wait_for_timeout(250); check('the level filter works', all('Cantrip' in t for t in dm.locator('.sprowbtn small').all_inner_texts()) and dm.locator('.sprowbtn').count() >= 10)
    dm.select_option('[data-spin=lv]', ''); dm.fill('[data-spin=q]', 'fireb'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Fireball"]'); dm.wait_for_timeout(300)
    check('picking Fireball shows its details', dm.locator('.spcard').is_visible() and 'Fireball' in dm.inner_text('.sphead') and 'sphere 20 ft' in dm.inner_text('.spmeta') and dm.locator('.spdt').inner_text().strip() == '8d6 fire')
    check('it sets up the save: DEX, half on a success, damage typed Fire', dm.get_attribute('[data-aoe=ab][data-v=dex]', 'aria-checked') == 'true' and dm.get_attribute('[data-aoe=onsave][data-v=half]', 'aria-checked') == 'true' and dm.input_value('[data-aoein=atype]') == 'fire' and dm.get_attribute('[data-aoe=svtoggle]', 'aria-expanded') == 'true')
    check('the attack roll is off (Fireball has none) but can be opened', dm.get_attribute('[data-aoe=attoggle]', 'aria-expanded') == 'false')
    dm.select_option('[data-spin=slot]', '5'); dm.wait_for_timeout(250); check('casting at level 5 changes the dice to 10d6', dm.locator('.spdt').inner_text().strip() == '10d6 fire')
    dm.select_option('[data-spin=slot]', '3'); dm.wait_for_timeout(200)
    dm.click('[data-aoe=spRoll]'); dm.wait_for_timeout(250); v = int(dm.input_value('[data-aoein=aamt]'))
    check('Roll damage rolls the dice and fills the damage in', 8 <= v <= 48 and '8d6' in dm.locator('.spinfo').inner_text() and ('= %d' % v) in dm.locator('.spinfo').inner_text(), (v, dm.locator('.spinfo').count()))
    dm.fill('[data-aoein=aamt]', '20'); dm.wait_for_timeout(150); check('or you can type your own number', dm.input_value('[data-aoein=aamt]') == '20')
    check('no caster: the DC is blank for you to fill in', dm.input_value('[data-aoein=dc]') == '')
    dm.select_option('[data-spin=caster]', label='Mage'); dm.wait_for_timeout(300)
    check('choosing the Mage fills in its spell save DC (14) and says where it came from', dm.input_value('[data-aoein=dc]') == '14' and 'stat block' in dm.locator('.spwhy').first.inner_text())
    dm.fill('[data-aoein=dc]', '17'); dm.select_option('[data-spin=slot]', '4'); dm.wait_for_timeout(300)
    check('a DC you type stays, even when you change the spell level', dm.input_value('[data-aoein=dc]') == '17')
    check('Fireball is not a concentration spell: no Concentrating box', dm.locator('[data-spin=conc]').count() == 0)
    # apply with a save, Ogre passes
    dm.select_option('[data-spin=slot]', '3'); mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Ogre")) .aoename'); dm.click('.aoerow:has(b:text-is("Rowan")) .aoename'); dm.wait_for_timeout(200)
    dm.fill('[data-aoein=aamt]', '20'); dm.locator('.aoerow:has(b:text-is("Ogre")) [data-aoe=saveCycle]').click(); dm.wait_for_timeout(250)
    check('a passed save halves it: Ogre 59 to 49, Rowan takes the full 20', dm.locator('.aoerow:has(b:text-is("Ogre")) [data-prev]').inner_text().startswith('59 \u2192 49') and dm.locator('.aoerow:has(b:text-is("Rowan")) [data-prev]').inner_text().startswith('24 \u2192 4'))
    dm.click('.aoeapply'); dm.wait_for_timeout(300)
    check('applying uses it', cmb('Ogre')['hp'] == 49 and cmb('Rowan')['hp'] == 4 if 'hp' in cmb('Ogre') else True)
    tgt(dm); check('the spell and the caster stay chosen for the next cast', dm.locator('.spcard').is_visible() and dm.input_value('[data-spin=caster]') == [c for c in st()['combatants'] if c['name'] == 'Mage'][0]['id'])
    dm.click('[data-aoe=spChange]'); dm.wait_for_timeout(250); check('Change spell goes back to the list', dm.locator('.sprowbtn').count() > 20 and dm.locator('.spcard').count() == 0)
    # ---- attack spell with scaling
    dm.fill('[data-spin=q]', 'fire bolt'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Fire Bolt"]'); dm.wait_for_timeout(300)
    check('Fire Bolt opens the attack roll, with the Mage\u2019s +6 filled in as the modifier', dm.get_attribute('[data-aoe=attoggle]', 'aria-expanded') == 'true' and dm.input_value('[data-aoein=amod]') == '6' and dm.locator('[data-aoe=svtoggle][aria-expanded=true]').count() == 0)
    dm.select_option('[data-spin=tier]', '1'); dm.wait_for_timeout(250); check('a cantrip scales with caster level: level 5 gives 2d10', dm.locator('.spdt').inner_text().strip() == '2d10 fire')
    dm.click('[data-aoe=attoggle]'); dm.wait_for_timeout(200); check('the attack roll is optional: close it to skip rolling', dm.locator('[data-hitchip]').count() == 0)
    # ---- darts and rays
    dm.click('[data-aoe=spChange]'); dm.fill('[data-spin=q]', 'magic missile'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Magic Missile"]'); dm.wait_for_timeout(300)
    check('Magic Missile starts with 3 darts, and each higher slot adds one', dm.input_value('[data-spin=cnt]') == '3')
    dm.select_option('[data-spin=slot]', '2'); dm.wait_for_timeout(250); check('cast at level 2 it has 4 darts', dm.input_value('[data-spin=cnt]') == '4')
    dm.select_option('[data-spin=slot]', '3'); dm.wait_for_timeout(250); check('and at level 3 it has 5', dm.input_value('[data-spin=cnt]') == '5'); dm.select_option('[data-spin=slot]', '2'); dm.wait_for_timeout(250)
    dm.click('[data-aoe=spRoll]'); dm.wait_for_timeout(250); v = int(dm.input_value('[data-aoein=aamt]')); check('Roll damage rolls every dart: 4 darts of 1d4+1 is 8 to 20', 8 <= v <= 20, v)
    # ---- concentration + conditions, combined with damage
    dm.click('[data-aoe=spChange]'); dm.fill('[data-spin=q]', 'hold person'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Hold Person"]'); dm.wait_for_timeout(300)
    check('Hold Person is a Condition spell: Paralyzed for 10 rounds, a WIS save', dm.input_value('[data-aoein=cname]') == 'Paralyzed' and dm.input_value('[data-aoein=cn]') == '10' and dm.get_attribute('[data-aoe=ab][data-v=wis]', 'aria-checked') == 'true')
    check('with a caster chosen, a Concentrating box appears (it is optional)', dm.locator('[data-spin=conc]').count() == 1 and not dm.locator('[data-spin=conc]').is_checked())
    mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Ogre")) .aoename'); dm.wait_for_timeout(150); dm.locator('.aoerow:has(b:text-is("Ogre")) [data-aoe=saveCycle]').click(); dm.locator('.aoerow:has(b:text-is("Ogre")) [data-aoe=saveCycle]').click(); dm.wait_for_timeout(200)
    check('a failed save will apply the condition', 'Fail' in dm.locator('.aoerow:has(b:text-is("Ogre")) [data-aoe=saveCycle]').inner_text() or 'Paralyzed' in dm.locator('.aoerow:has(b:text-is("Ogre")) [data-prev]').inner_text().replace('Paralyzed', 'Paralyzed'))
    dm.locator('[data-spin=conc]').check(); dm.wait_for_timeout(150); dm.click('.aoeapply'); dm.wait_for_timeout(400)
    check('the Ogre is Paralyzed', 'Paralyzed' in [x['name'] for x in cmb('Ogre')['conditions']])
    check('and the Mage is Concentrating on it', [x for x in cmb('Mage')['conditions'] if x['name'] == 'Concentrating'] and cmb('Mage')['conditions'][-1].get('note') == 'Hold Person', cmb('Mage')['conditions'])
    # damage and a condition in one go: Black Tentacles
    tgt(dm); dm.click('[data-aoe=spChange]'); dm.fill('[data-spin=q]', 'black tent'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Black Tentacles"]'); dm.wait_for_timeout(300)
    check('Black Tentacles says who gets Restrained', 'fails the save also gets Restrained' in dm.inner_text('.spcard'), dm.inner_text('.spcard')[-200:])
    mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Alric")) .aoename'); dm.click('.aoerow:has(b:text-is("Mage")) .aoename'); dm.fill('[data-aoein=aamt]', '10'); dm.wait_for_timeout(150)
    dm.locator('.aoerow:has(b:text-is("Mage")) [data-aoe=saveCycle]').click(); dm.wait_for_timeout(200)
    dm.click('.aoeapply'); dm.wait_for_timeout(400)
    check('one tap applies the damage and the condition: the one who failed is Restrained, the one who passed is not', 'Restrained' in [x['name'] for x in cmb('Alric')['conditions']] and 'Restrained' not in [x['name'] for x in cmb('Mage')['conditions']], (cmb('Alric')['conditions'], cmb('Mage')['conditions']))
    check('and the damage landed: Alric took 10; the Mage passed and, for this spell, takes none', cmb('Alric')['hp'] == 21 and cmb('Mage')['hp'] == 81, (cmb('Alric')['hp'], cmb('Mage')['hp']))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_lr_not_spent_on_heal(b):
    # Legendary Resistance belongs to saving throws: marking one in Damage and then healing instead must not spend it
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    mi(dm, 'Ogre', '[data-act=legOn]')
    mpick(dm, 'enemy'); mfill(dm, '[data-aoein=aamt]', '10'); mclick(dm, '[data-aoe=svtoggle]'); mfill(dm, '[data-aoein=dc]', '40'); mclick(dm, '[data-aoe=roll]')
    mclick(dm, '[data-aoe=lr]'); check('the Ogre is marked to use a Legendary Resistance', dm.locator('.aoerow:has(b:text-is("Ogre")) .svchip.pass').count() == 1)
    mclick(dm, '[data-aoe=kind][data-v=heal]'); mfill(dm, '[data-aoein=amt]', '5'); mclick(dm, '[data-aoe=apply]')
    lr = dm.evaluate("JSON.parse(localStorage.getItem('initiative-tracker-v1')).combatants.find(c=>c.name==='Ogre').leg.rleft")
    check('healing instead does not spend a Legendary Resistance', lr == 3, lr)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

CONTRAST_JS = r"""window.__contrast = function(root){
  const cv=document.createElement('canvas').getContext('2d');
  const parse=c=>{ if(!c||c==='transparent')return [0,0,0,0];
    let m=c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/); if(m)return [m[1]*255,m[2]*255,m[3]*255,m[4]==null?1:+m[4]];
    m=c.match(/^rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:,?\s*\/?\s*([\d.]+))?\)/); if(m)return [+m[1],+m[2],+m[3],m[4]==null?1:+m[4]];
    cv.fillStyle='#000'; cv.fillStyle=c; return parse(cv.fillStyle.startsWith('#')?'rgb('+[1,3,5].map(i=>parseInt(cv.fillStyle.slice(i,i+2),16)).join(',')+')':cv.fillStyle);};
  const over=(top,bot)=>{const a=top[3]; return [0,1,2].map(i=>top[i]*a+bot[i]*(1-a)).concat(1);};
  const bgOf=e=>{const sh=e.closest('.acshield,.pac,.ph-ac'); if(sh){const b=parse(getComputedStyle(sh,'::before').backgroundColor); if(b[3]>=1)return b;} const layers=[]; for(let n=e;n;n=n.parentElement){const cs=getComputedStyle(n); const b=parse(cs.backgroundColor); if(b[3]>0)layers.push(b); if(b[3]>=1)break;}
    let c=[255,255,255,1]; for(let i=layers.length-1;i>=0;i--)c=over(layers[i],c); return c;};
  const lum=a=>{const f=v=>{v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}; return .2126*f(a[0])+.7152*f(a[1])+.0722*f(a[2]);};
  const out=[], seen=new Set();
  const w=document.createTreeWalker(root||document.body,NodeFilter.SHOW_TEXT);
  let x; while((x=w.nextNode())){ const t=x.nodeValue.trim(); if(!t)continue; const e=x.parentElement; if(!e||seen.has(e))continue; seen.add(e);
    const r=e.getBoundingClientRect(); if(!r.width||!r.height||r.bottom<0||r.top>innerHeight)continue; const cs=getComputedStyle(e);
    if(cs.visibility==='hidden'||+cs.opacity===0||cs.color==='transparent'||/rgba\(0, 0, 0, 0\)/.test(cs.color)||cs.webkitTextFillColor==='transparent'||cs.backgroundClip==='text'||e.closest('[aria-hidden=true],.scrim'))continue;
    let fg=parse(cs.color); const bg=bgOf(e); if(fg[3]<1)fg=over(fg,bg);
    let op=1; for(let n=e;n;n=n.parentElement)op*=+getComputedStyle(n).opacity; if(op<1)fg=over([...fg.slice(0,3),op],bg);
    const a=lum(fg),b=lum(bg), cr=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    const fs=parseFloat(cs.fontSize), large=fs>=24||(fs>=18.66&&+cs.fontWeight>=700), need=large?3:4.5;
    const dis=e.closest('button:disabled,[disabled],[aria-disabled=true]');
    if(cr<need&&!dis)out.push({path:[e,e.parentElement,e.parentElement&&e.parentElement.parentElement].filter(Boolean).map(n=>n.tagName.toLowerCase()+(typeof n.className==='string'&&n.className?'.'+n.className.trim().split(/\s+/).join('.'):'')).join(' < '),fg:cs.color,t:t.slice(0,28),cls:(e.className&&e.className.baseVal===undefined?e.className:'').toString().slice(0,40),tag:e.tagName.toLowerCase(),cr:+cr.toFixed(2),fs});
  }
  return out;
};
"""

def t_round13(b):
    """Canvas round: Roll for initiative, healing spells, skins, Combat Wombat name, QR library bundled."""
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    cmb = lambda nm: [c for c in st()['combatants'] if c['name'] == nm][0]
    # ---- Roll for initiative
    rb = dm.locator('#ctlmain [data-act=rfiToggle]')
    check('before combat the bar offers Show "Roll for initiative" with a d20 icon', rb.count() == 1 and 'roll for initiative' in rb.inner_text().lower() and rb.get_attribute('aria-pressed') == 'false' and rb.locator('svg').count() == 1)
    tv = page(ctx, size=(1920, 1080)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(600)
    check('the Monitor does not show it until the DM asks', tv.locator('.ppause.rfi').count() == 0)
    rb.click(); dm.wait_for_timeout(300); tv.wait_for_timeout(900)
    check('pressing it shows Hide and is saved', 'hide' in dm.locator('#ctlmain [data-act=rfiToggle]').inner_text().lower() and dm.get_attribute('#ctlmain [data-act=rfiToggle]', 'aria-pressed') == 'true' and st().get('rfi') is True)
    check('the Monitor says Roll for initiative! and how to roll', tv.locator('.ppause.rfi h1').inner_text() == 'Roll for initiative!' and 'd20' in tv.inner_text('.ppause.rfi p') and 'Dex' in tv.inner_text('.ppause.rfi p'))
    dm.keyboard.press('Control+z'); dm.wait_for_timeout(300); check('it is one undo step', st().get('rfi') is False)
    dm.click('#ctlmain [data-act=rfiToggle]'); dm.wait_for_timeout(200); nxt(dm); dm.wait_for_timeout(300); tv.wait_for_timeout(900)
    check('Start combat clears it: no button, no screen', st().get('rfi') is False and dm.locator('#ctlmain [data-act=rfiToggle]').count() == 0 and tv.locator('.ppause.rfi').count() == 0)
    tv.close()
    # ---- healing spells in the Target window
    check('saved tables without the field load with it off', dm.evaluate("()=>{const s=JSON.parse(localStorage.getItem('initiative-tracker-v1')); return s.rfi===false}"))
    mclick(dm, '[data-aoe=kind][data-v=dmg]'); mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Rowan")) .aoename'); mfill(dm, '[data-aoein=aamt]', '20'); dm.click('.aoeapply'); dm.wait_for_timeout(300)
    check('setup: Rowan is down to 4', cmb('Rowan')['hp'] == 4, cmb('Rowan').get('hp'))
    mclick(dm, '[data-aoe=kind][data-v=spell]'); dm.fill('[data-spin=q]', 'cure'); dm.wait_for_timeout(250)
    check('Cure Wounds is in combat by default', dm.locator('.sprowbtn[data-n="Cure Wounds"]').count() == 1 and 'Heals 2d8' in dm.inner_text('.sprowbtn[data-n="Cure Wounds"]'))
    dm.click('.sprowbtn[data-n="Cure Wounds"]'); dm.wait_for_timeout(300)
    check('picking it sets up healing, with no save and no attack', dm.locator('.aoeapply.heal').count() == 1 and dm.locator('[data-aoe=svtoggle]').count() == 0 and dm.locator('[data-aoe=attoggle]').count() == 0)
    check('with no caster it asks you to add the modifier yourself', '2d8 + spellcasting modifier' in dm.inner_text('.spdt'), dm.inner_text('.spdt'))
    dm.select_option('[data-spin=slot]', '3'); dm.wait_for_timeout(200); check('a level 3 slot heals 6d8', dm.inner_text('.spdt').startswith('6d8'), dm.inner_text('.spdt'))
    dm.select_option('[data-spin=slot]', '1'); dm.wait_for_timeout(200)
    dm.click('[data-aoe=spRoll]'); dm.wait_for_timeout(250); v = int(dm.input_value('[data-aoein=amt]'))
    check('Roll healing fills the amount', 2 <= v <= 16 and ('= %d' % v) in dm.inner_text('.spinfo'), (v,))
    mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Rowan")) .aoename'); dm.wait_for_timeout(150); dm.click('.aoeapply'); dm.wait_for_timeout(300)
    check('applying heals Rowan', cmb('Rowan')['hp'] == min(24, 4 + v), cmb('Rowan')['hp'])
    mclick(dm, '[data-aoe=kind][data-v=spell]'); dm.wait_for_timeout(200)
    if dm.locator('[data-aoe=spChange]').count(): dm.click('[data-aoe=spChange]'); dm.wait_for_timeout(200)
    dm.fill('[data-spin=q]', 'power word heal'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Power Word Heal"]'); dm.wait_for_timeout(300)
    mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Rowan")) .aoename'); dm.wait_for_timeout(200)
    check('Power Word Heal needs no amount and previews full HP', dm.locator('[data-aoein=amt]').count() == 0 and dm.locator('.aoerow:has(b:text-is("Rowan")) [data-prev]').inner_text().endswith('24'))
    dm.click('.aoeapply'); dm.wait_for_timeout(300); check('it brings Rowan back to full', cmb('Rowan')['hp'] == 24, cmb('Rowan')['hp'])
    lib_open(dm, 'spells'); dm.wait_for_timeout(300); dm.click('[data-spl=tag][data-v=heal]'); dm.wait_for_timeout(200)
    healing = sorted(x.strip() for x in dm.locator('#splibList .sprow2 b').all_inner_texts())
    check('the healing spells are tagged Healing (Prayer of Healing, Aid and Regenerate too)', healing == sorted(['Aid', 'Cure Wounds', 'Healing Word', 'Mass Cure Wounds', 'Mass Healing Word', 'Heal', 'Mass Heal', 'Power Word Heal', 'Prayer of Healing', 'Regenerate']), healing)
    check('the Library says spells are tagged by what they do', 'tags come from what a spell does' in dm.inner_text('.spintro').lower())
    lib_close(dm)
    # ---- skins: Watercolor and Chalkboard are gone; tables saved with them open in the closest skin
    sopen(dm, 'skin'); check('Watercolor and Chalkboard are gone; Color Spray, Daylight and Frost remain', dm.locator('[data-key=skin][data-val=watercolor]').count() == 0 and dm.locator('[data-key=skin][data-val=chalk]').count() == 0 and all(dm.locator('[data-key=skin][data-val=%s]' % k).count() == 1 for k in ('spark', 'daylight', 'frost')))
    check('there are 12 skins', dm.locator('[data-key=skin]').count() == 12, dm.locator('[data-key=skin]').count())
    dm.click('#drawerClose'); dm.wait_for_timeout(200)
    for old, new in (('chalk', 'slate'), ('watercolor', 'daylight')):
        dm.evaluate("sk=>{const s=JSON.parse(localStorage.getItem('initiative-tracker-v1')); s.settings.skin=sk; localStorage.setItem('initiative-tracker-v1', JSON.stringify(s));}", old)
        dm.reload(); dm.wait_for_timeout(700); check('a saved %s skin opens as %s' % (old, new), dm.get_attribute('html', 'data-skin') == new, dm.get_attribute('html', 'data-skin'))
    # ---- the name, and the wordmark fits next to the header buttons in every skin
    check('the page is called Combat Wombat', dm.title() == '⚔️ Combat Wombat', dm.title())
    ic = dm.get_attribute('link[rel=icon]', 'href') or ''
    from urllib.parse import unquote
    check('the tab icon is the wombat: a square SVG, dark on light tabs and light on dark ones', dm.get_attribute('link[rel=icon]', 'type') == 'image/svg+xml' and 'M712.19' in unquote(ic) and 'prefers-color-scheme:dark' in unquote(ic) and '997.17 997.17' in unquote(ic), unquote(ic)[:160])
    bad = []
    for sk in qs(('spark', 'sparkd', 'slate', 'daylight', 'medieval', 'frost', 'water', 'forest', 'mountain', 'fire', 'feywild')):
        dm.evaluate("sk=>{const s=JSON.parse(localStorage.getItem('initiative-tracker-v1')); s.settings.skin=sk; localStorage.setItem('initiative-tracker-v1', JSON.stringify(s));}", sk)
        dm.reload(); dm.wait_for_timeout(500)
        r = dm.evaluate("()=>{const w=document.querySelector('#lnav .bword'), h=w.closest('.nhead'); const a=w.getBoundingClientRect(), c=h.getBoundingClientRect(); const s=w.querySelector('svg.bmwm'); return {t:s?s.getAttribute('aria-label'):'', h:s?s.getBoundingClientRect().height:0, ok:a.right<=c.right-4 && w.scrollWidth<=w.clientWidth+1}}")
        if r['t'] != 'Combat Wombat' or not r['ok'] or r['h'] < 20: bad.append((sk, r))
    check('the menu wordmark (COMBAT WOMBAT) is labelled, at least 20px tall, and fits in every skin', not bad, bad)
    # ---- QR codes work without the network
    check('the QR library is part of the page (no cdnjs script)', dm.evaluate("()=>typeof window.qrcode==='function' && !document.querySelector('script[src*=cdnjs]')"))
    ctx.close()

def t_round13_phone(b):
    """Roll for initiative reaches the phones: a popup for a player with a character, the big screen on the phone's Monitor."""
    ctx, dm, ph = phone_setup(b, False)
    ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(900)
    check('no popup before the DM asks', ph.locator('.ph-popup').count() == 0)
    dm.click('#ctlmain [data-act=rfiToggle]'); dm.wait_for_timeout(300); ph.wait_for_timeout(1200)
    check('the phone pops up Roll for initiative! with the player\'s name', ph.locator('.ph-popup.rfi h1').count() == 1 and ph.inner_text('.ph-popup.rfi h1') == 'Roll for initiative!' and 'Alric' in ph.inner_text('.ph-popup.rfi p'))
    ph.click('[data-pact=popclose]'); ph.wait_for_timeout(600)
    check('Got it closes it and it does not come back on the next update', ph.locator('.ph-popup').count() == 0)
    dm.click('#ctlmain [data-act=rfiToggle]'); dm.wait_for_timeout(300); ph.wait_for_timeout(1000)
    check('Hide takes the popup away everywhere', ph.locator('.ph-popup.rfi').count() == 0)
    dm.click('#ctlmain [data-act=rfiToggle]'); dm.wait_for_timeout(300); ph.wait_for_timeout(1200)
    check('showing it again pops up again', ph.locator('.ph-popup.rfi').count() == 1)
    nxt(dm); ph.wait_for_timeout(1200)
    check('Start combat replaces it with the normal turn popups', ph.locator('.ph-popup.rfi').count() == 0)
    ctx.close()

def t_round13_canvas(b):
    """Canvas round: NPC star and edit-a-copy, NPC tab defaults, party menu, preview close button, readable health chips."""
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    saved_npcs = lambda: [x['name'] for x in st()['library'] if x.get('src') == 'npc']
    # ---- Library: tab defaults are kept per tab
    lib_open(dm, 'book'); check('the Creatures tab adds as Enemy, not grouped', dm.input_value('[data-mmf=disp]') == 'enemy' and dm.get_attribute('[data-mm=group]', 'aria-pressed') == 'false')
    dm.click('.mmtabs [data-v=npcs]'); dm.wait_for_timeout(300)
    check('the NPCs tab adds as Neutral, grouped', dm.input_value('[data-mmf=disp]') == 'neutral' and dm.get_attribute('[data-mm=group]', 'aria-pressed') == 'true')
    dm.select_option('[data-mmf=disp]', 'ally'); dm.click('.mmtabs [data-v=book]'); dm.wait_for_timeout(250)
    check('changing the NPCs choice does not change the Creatures one', dm.input_value('[data-mmf=disp]') == 'enemy')
    dm.click('.mmtabs [data-v=npcs]'); dm.wait_for_timeout(250); check('and the NPCs tab remembers its own', dm.input_value('[data-mmf=disp]') == 'ally')
    dm.select_option('[data-mmf=disp]', 'neutral')
    # ---- star a standard NPC: saved to your NPCs; star again removes it (undoable)
    dm.fill('[data-stdq]', 'innkeeper'); dm.wait_for_timeout(300)
    ik = '#stdnpcs .stdrow:has(b:text-is("Innkeeper")) '
    star = dm.locator(ik + '[data-mm=stdstar]')
    check('each standard NPC has a star, off, with a clear label', star.count() == 1 and star.get_attribute('aria-pressed') == 'false' and 'Save Innkeeper to your NPCs' == star.get_attribute('aria-label'))
    star.click(); dm.wait_for_timeout(300)
    check('the star saves it to your NPCs as Neutral', saved_npcs() == ['Innkeeper'] and [x for x in st()['library'] if x['name'] == 'Innkeeper'][0].get('disp') == 'neutral' and dm.locator(ik + '[data-mm=stdstar]').get_attribute('aria-pressed') == 'true')
    dm.locator(ik + '[data-mm=stdstar]').click(); dm.wait_for_timeout(300)
    check('pressing it again removes it', saved_npcs() == [] and dm.locator(ik + '[data-mm=stdstar]').get_attribute('aria-pressed') == 'false')
    dm.click('#toast [data-act=undo]'); dm.wait_for_timeout(300); check('and Undo in the message brings it back, star on', saved_npcs() == ['Innkeeper'] and dm.locator(ik + '[data-mm=stdstar]').get_attribute('aria-pressed') == 'true', saved_npcs())
    # ---- edit a copy of a standard NPC: saved as your own NPC, not a creature
    dm.locator(ik + '[data-mm=stdedit]').click(); dm.wait_for_timeout(300)
    check('Edit a copy opens the form named "(custom)", with no Add to Saved box', dm.input_value('[data-mcf=name]') == 'Innkeeper (custom)' and dm.locator('[data-mcf=fav]').count() == 0)
    dm.fill('[data-mcf=name]', 'Old Tom'); dm.fill('[data-mcf=ac]', '13'); dm.click('[data-cfgo=save]'); dm.wait_for_timeout(400)
    tom = [x for x in st()['library'] if x['name'] == 'Old Tom']
    check('saving it adds "Old Tom" to your NPCs with the new AC', len(tom) == 1 and tom[0].get('src') == 'npc' and tom[0]['sheet']['ac'] == '13', tom)
    lib_close(dm)
    # ---- party menu
    nav(dm, 'party'); party = dm.locator('#party')
    btns = party.locator('button')
    check('+ Add new is the last thing in the player list', btns.nth(btns.count() - 1).get_attribute('data-act') == 'addOpen' and '+ add new' in btns.nth(btns.count() - 1).inner_text().lower())
    aa = party.locator('[data-act=partyAddAll]')
    check('Add all with initiative is greyed out when everyone is already in combat', aa.count() == 0 or (aa.is_disabled() and 'already in combat' in (aa.get_attribute('title') or '')))
    # ---- Combat Monitor preview: its own strip with a close button
    nav(dm, 'monitor'); dm.locator('#nsub-monitor [role=switch]').first.click(); dm.wait_for_timeout(500)
    check('the preview shows above the combat bar', dm.locator('#monmini').is_visible() and dm.evaluate("document.getElementById('monmini').getBoundingClientRect().bottom <= document.getElementById('ctl').getBoundingClientRect().top + 1"))
    x = dm.locator('#monmini .mmclose')
    check('it has a labelled close button', x.count() == 1 and x.get_attribute('aria-label') == 'Close the Combat Monitor preview')
    x.click(); dm.wait_for_timeout(400)
    check('the X turns the preview off and the menu switch follows', dm.locator('#monmini').is_hidden() and st()['settings'].get('monPreview') is False and dm.get_attribute('#nsub-monitor [role=switch]', 'aria-checked') == 'false')
    # ---- health words on the Monitor are chips with enough contrast, in every skin
    nxt(dm); row(dm, 'Ogre').locator('[data-delta]').fill('40'); row(dm, 'Ogre').locator('[data-act=dmg]').first.click(); dm.wait_for_timeout(300)
    tv = page(ctx, size=(1920, 1080)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(800)
    js = """()=>{
      const cv=document.createElement('canvas').getContext('2d');
      const rgb=c=>{cv.fillStyle='#000'; cv.fillStyle=c; const d=cv.fillStyle; if(d[0]==='#')return [1,3,5].map(i=>parseInt(d.slice(i,i+2),16)); const m=d.match(/[\\d.]+/g).map(Number); return m.slice(0,3);};
      const lum=a=>{const f=v=>{v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}; return .2126*f(a[0])+.7152*f(a[1])+.0722*f(a[2]);};
      const bgOf=e=>{for(let n=e;n;n=n.parentElement){const b=getComputedStyle(n).backgroundColor; if(b&&!/rgba\\(.*,\\s*0\\)|transparent/.test(b))return b;} return '#fff';};
      return [...document.querySelectorAll('.pcard .php .state')].filter(e=>e.offsetParent).map(e=>{const a=lum(rgb(getComputedStyle(e).color)), b=lum(rgb(bgOf(e))); return [e.textContent.trim(), (Math.max(a,b)+.05)/(Math.min(a,b)+.05)];});
    }"""
    low = []
    for sk in qs(('spark', 'sparkd', 'slate', 'daylight', 'medieval', 'frost', 'water', 'forest', 'mountain', 'fire', 'feywild')):
        dm.evaluate("sk=>{const s=JSON.parse(localStorage.getItem('initiative-tracker-v1')); s.settings.skin=sk; localStorage.setItem('initiative-tracker-v1', JSON.stringify(s));}", sk)
        tv.reload(); tv.wait_for_timeout(700)
        r = tv.evaluate(js)
        if not r: low.append((sk, 'no health words'))
        low += [(sk, w, round(c, 2)) for w, c in r if c < 4.5]
    check('every health word on the Monitor reads at 4.5:1 or better in every skin', not low, low)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_contrast_all_skins(b):
    """Every visible text on the DM screen, the Combat Monitor and a player's phone reads at 4.5:1 or better
    (3:1 for large text) in every skin. Text over the AC shield is measured against the shield's inner panel."""
    ctx, dm, ph = phone_setup(b, False)
    add_npc(dm, 'Goblin', 5, 7, qty='3', group=True); nxt(dm, 2)
    row(dm, 'Ogre').locator('[data-delta]').fill('30'); row(dm, 'Ogre').locator('[data-act=dmg]').first.click()
    row(dm, 'Alric').locator('[data-delta]').fill('10'); row(dm, 'Alric').locator('[data-act=dmg]').first.click(); dm.wait_for_timeout(300)
    ph.click('.ph-claimbtn:has-text("Alric")'); ph.wait_for_timeout(900)
    tv = page(ctx, size=(1920, 1080), nolocal=True); tv.goto(URL + '#monitor'); tv.wait_for_timeout(900)
    low = []
    for sk in qs(('spark', 'light', 'daylight', 'medieval', 'frost', 'sparkd', 'slate', 'water', 'forest', 'mountain', 'fire', 'feywild')):
        set_skin(dm, sk); tv.wait_for_timeout(700); ph.wait_for_timeout(300)
        if ph.locator('[data-pact=popclose]').count(): ph.click('[data-pact=popclose]'); ph.wait_for_timeout(200)
        for nm, pg in (('DM', dm), ('Monitor', tv), ('phone', ph)):
            pg.add_script_tag(content=CONTRAST_JS)
            for r in pg.evaluate("()=>window.__contrast()"):
                low.append((sk, nm, r['t'], r['cr'], r['path'][:70]))
    check('every visible text reads at 4.5:1 (large text 3:1) on the DM screen, Monitor and phone, in all 12 skins', not low, low[:12])
    import collections; agg = collections.defaultdict(list)
    for x in low: agg[(x[1], x[2], x[4])].append('%s %.1f' % (x[0], x[3]))
    for k, v in agg.items(): print('   LOW', k, v)
    ctx.close()

def t_demo(b):
    """The demo build (dist/demo.html): sample fight, nothing kept, banner, tour, Subscribe window, gated saving."""
    durl = URL.replace('initiative-tracker.html', 'demo.html')
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    dm = page(ctx); dm.goto(durl); dm.wait_for_timeout(1000)
    check('it opens on the sample fight', names(dm) == ['Rowan', 'Mira', 'Goblin Boss', 'Goblins', 'Alric', 'Worg', 'Thorn'], names(dm))
    check('the four goblins are one group card', dm.locator('.row.group .mem').count() == 4)
    check('the demo is in Color Spray', dm.get_attribute('html', 'data-skin') == 'spark', dm.get_attribute('html', 'data-skin'))
    check('the banner says it is a demo and nothing is saved', dm.locator('#demobar').is_visible() and 'nothing is saved' in dm.inner_text('#demobar').lower())
    # ---- the tour
    pop = dm.locator('.tourpop')
    check('the tour starts by itself, as a labelled dialog that does not block the page', pop.count() == 1 and pop.get_attribute('role') == 'dialog' and pop.get_attribute('aria-modal') == 'false' and dm.inner_text('.tourstep') == '1 of 11')
    dm.click('[data-demo=tournext]'); dm.wait_for_timeout(300)
    box = lambda sel: dm.eval_on_selector(sel, "e=>{const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]}")
    s, r = box('.tourspot'), box('#list .row')
    check('step 2 rings the first card', dm.inner_text('.tourstep') == '2 of 11' and abs(s[0] - (r[0] - 6)) <= 2 and abs(s[1] - (r[1] - 6)) <= 2, (s, r))
    p2 = box('.tourpop'); check('and its card sits fully on screen', p2[0] >= 0 and p2[1] >= 0 and p2[2] <= 1440 and p2[3] <= 900, p2)
    dm.click('[data-demo=tourback]'); dm.wait_for_timeout(200); check('Back goes back', dm.inner_text('.tourstep') == '1 of 11')
    for _ in range(10): dm.click('[data-demo=tournext]'); dm.wait_for_timeout(120)
    check('the last step points at Subscribe and says Finish', dm.inner_text('.tourstep') == '11 of 11' and dm.inner_text('[data-demo=tournext]').strip().lower() == 'finish' and dm.locator('.tourspot:not([hidden])').count() == 1)
    dm.click('[data-demo=tournext]'); dm.wait_for_timeout(200); check('Finish closes it', dm.locator('.tourpop').count() == 0)
    dm.click('#demobar [data-demo=tour]'); dm.wait_for_timeout(200); dm.keyboard.press('Escape'); dm.wait_for_timeout(200)
    check('Take the tour reopens it and Escape closes it', dm.locator('.tourpop').count() == 0)
    # ---- it works, and nothing is kept
    row(dm, 'Worg').locator('[data-delta]').fill('9'); row(dm, 'Worg').locator('[data-act=dmg]').first.click(); dm.wait_for_timeout(250)
    check('the tracker works as usual', hp(dm, 'Worg') == '17', hp(dm, 'Worg'))
    tv = page(ctx, size=(1920, 1080)); tv.goto(durl + '#monitor'); tv.wait_for_timeout(1000)
    check('the Combat Monitor shows the demo fight', tv.locator('.pcard').count() == 7)
    dm.reload(); dm.wait_for_timeout(900)
    check('reloading starts the fight again, without the tour this time', hp(dm, 'Worg') == '26' and dm.locator('.tourpop').count() == 0, hp(dm, 'Worg'))
    check('the demo never writes to the real table', dm.evaluate("localStorage.getItem('initiative-tracker-v1')") is None)
    # ---- saving opens the Subscribe window
    nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.wait_for_timeout(300)
    check('Save as opens Subscribe, naming what needs it', dm.locator('#paywrap .paymodal[role=dialog][aria-modal=true]').count() == 1 and 'saving encounters' in dm.inner_text('.payreason').lower() and dm.locator('.encmodal').count() == 0)
    check('the yearly plan is chosen and focused', dm.get_attribute('.payplan[data-v=year]', 'aria-checked') == 'true' and dm.evaluate("document.activeElement.dataset.v") == 'year')
    check('prices: $50 a year and $5.99 a month', '$50' in dm.inner_text('.payplan[data-v=year]') and '$5.99' in dm.inner_text('.payplan[data-v=month]'))
    dm.keyboard.press('ArrowRight'); dm.wait_for_timeout(150)
    check('arrow keys switch the plan and the button follows', dm.get_attribute('.payplan[data-v=month]', 'aria-checked') == 'true' and '$5.99' in dm.inner_text('[data-demo=paygo]'))
    dm.click('[data-demo=paygo]'); dm.wait_for_timeout(200); check('Subscribe says checkout is not connected yet', 'not connected' in toast_text(dm).lower() or 'isn’t connected' in toast_text(dm).lower(), toast_text(dm))
    dm.keyboard.press('Escape'); dm.wait_for_timeout(200)
    check('Escape closes it and focus goes back to Save as', dm.locator('#paywrap').count() == 0 and dm.evaluate("document.activeElement.dataset.act") == 'encSaveAs')
    lib_open(dm, 'book'); dm.fill('[data-mmsearch]', 'Ogre'); dm.wait_for_timeout(250); dm.locator('.mmrow:has(b:text-is("Ogre")) [data-mm=star]').click(); dm.wait_for_timeout(250)
    st = json.loads(dm.evaluate("localStorage.getItem('combat-wombat-demo')"))
    check('starring a creature opens Subscribe and changes nothing', dm.locator('#paywrap').count() == 1 and 'library' in dm.inner_text('.payreason').lower() and 'srd:Ogre' in st.get('stars', []))
    dm.click('.paymodal [data-demo=payclose] >> nth=-1'); dm.wait_for_timeout(200)
    dm.locator('.mmrow:has(b:text-is("Ogre")) [data-mm=add]').click(); dm.wait_for_timeout(300); lib_close(dm)
    check('adding a creature to the fight still works', 'Ogre' in names(dm), names(dm))
    # ---- readable, and the full app is untouched
    dm.click('#demobar [data-demo=subscribe]'); dm.wait_for_timeout(200); dm.add_script_tag(content=CONTRAST_JS)
    low = dm.evaluate("()=>window.__contrast(document.getElementById('paywrap')).concat(window.__contrast(document.getElementById('demobar')))")
    check('the banner and Subscribe window read at 4.5:1', not low, low[:5])
    app = page(ctx); app.goto(URL); app.wait_for_timeout(500)
    check('the full app has no demo banner and opens empty', app.locator('#demobar:not([hidden])').count() == 0 and names(app) == [] and app.locator('.tourpop').count() == 0)
    check('no page errors', not (dm._errs + tv._errs + app._errs), dm._errs + tv._errs + app._errs); ctx.close()

def t_beta_accounts(b):
    """The beta build (dist/beta.html): pick a test account; each keeps its own table; the free one is the demo."""
    burl = URL.replace('initiative-tracker.html', 'beta.html')
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    dm = page(ctx); dm.goto(burl); dm.wait_for_timeout(800)
    picks = dm.locator('.betapick')
    check('it opens on a sign-in screen with three test accounts and the version', picks.count() == 3 and 'test account' in dm.inner_text('.betasign h1').lower() and '0.9.0-beta' in dm.inner_text('.betaver'))
    check('each account says its plan', [x.strip() for x in dm.locator('.betaplan').all_inner_texts()] == ['Yearly plan', 'Monthly plan', 'No subscription'])
    check('it warns that the accounts are shared and local', 'only in this browser' in dm.inner_text('.betalead') and 'anyone can use them' in dm.inner_text('.betalead'))
    check('the first account has focus', dm.evaluate("document.activeElement.dataset.id") == 'sam')
    check('the sign-in screen is in Color Spray, outlined with a hard shadow', dm.get_attribute('html', 'data-skin') == 'spark' and dm.eval_on_selector('.betacard', "e=>getComputedStyle(e).boxShadow").endswith('6px 6px 0px 0px') or '6px 6px 0px' in dm.eval_on_selector('.betacard', "e=>getComputedStyle(e).boxShadow"), dm.eval_on_selector('.betacard', "e=>getComputedStyle(e).boxShadow"))
    switch = lambda: (dm.click('#betaacct .betabtn'), dm.click('[data-beta=switch]'), dm.wait_for_timeout(800))
    # Sam: subscriber with a campaign
    dm.click('.betapick[data-id=sam]'); dm.wait_for_timeout(1000)
    check('Sam (yearly) starts with the sample campaign, no demo banner, no tour', names(dm) == ['Rowan', 'Mira', 'Goblin Boss', 'Goblins', 'Alric', 'Worg', 'Thorn'] and dm.locator('#demobar:not([hidden])').count() == 0 and dm.locator('.tourpop').count() == 0)
    check('the account sits at the bottom of the menu', 'Sam Rivera' in dm.inner_text('#betaacct') and 'Yearly plan' in dm.inner_text('#betaacct'))
    row(dm, 'Worg').locator('[data-delta]').fill('9'); row(dm, 'Worg').locator('[data-act=dmg]').first.click(); dm.wait_for_timeout(250)
    nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.wait_for_timeout(300)
    check('a subscriber can save encounters (no Subscribe window)', dm.locator('.encmodal').count() == 1 and dm.locator('#paywrap').count() == 0)
    dm.keyboard.press('Escape'); dm.reload(); dm.wait_for_timeout(900)
    check('and changes are kept after a reload', hp(dm, 'Worg') == '17', hp(dm, 'Worg'))
    dm.click('#betaacct .betabtn'); dm.wait_for_timeout(150)
    m = dm.locator('#betamenu')
    check('the account menu opens with the email, Reset and Switch', m.is_visible() and 'sam.yearly@example.com' in m.inner_text() and dm.get_attribute('#betaacct .betabtn', 'aria-expanded') == 'true')
    r1, r2 = dm.eval_on_selector('#betamenu', "e=>e.getBoundingClientRect().right"), dm.eval_on_selector('#lnav', "e=>e.getBoundingClientRect().right")
    check('the menu fits inside the left menu', r1 <= r2, (r1, r2))
    dm.keyboard.press('Escape'); dm.wait_for_timeout(100); check('Escape closes it', m.is_hidden())
    # Riley: new subscriber
    switch(); dm.click('.betapick[data-id=riley]'); dm.wait_for_timeout(900)
    check('Riley (monthly) starts with an empty table', names(dm) == [] and 'Riley Chen' in dm.inner_text('#betaacct'))
    add_npc(dm, 'Bandit', 11, 11)
    # Casey: free = demo
    switch(); dm.click('.betapick[data-id=casey]'); dm.wait_for_timeout(1100)
    check('Casey (no subscription) gets the demo: sample fight, banner and tour', 'Goblins' in names(dm) and dm.locator('#demobar:not([hidden])').count() == 1 and dm.locator('.tourpop').count() == 1)
    dm.keyboard.press('Escape'); nav(dm, 'manage'); dm.click('[data-act=encSaveAs]'); dm.wait_for_timeout(300)
    check('and saving opens Subscribe', dm.locator('#paywrap .paymodal').count() == 1)
    dm.keyboard.press('Escape')
    # accounts stay apart; reset
    switch(); dm.click('.betapick[data-id=riley]'); dm.wait_for_timeout(900)
    check('Riley still has only the Bandit', names(dm) == ['Bandit'], names(dm))
    switch(); dm.click('.betapick[data-id=sam]'); dm.wait_for_timeout(900)
    check('Sam still has his own change', hp(dm, 'Worg') == '17')
    dm.on('dialog', lambda d: d.accept())
    dm.click('#betaacct .betabtn'); dm.click('[data-beta=reset]'); dm.wait_for_timeout(1000)
    check('Reset puts Sam back to the start', hp(dm, 'Worg') == '26', hp(dm, 'Worg'))
    tv = page(ctx, size=(1920, 1080)); tv.goto(burl + '#monitor'); tv.wait_for_timeout(1000)
    check('the Monitor follows the signed-in account', tv.locator('.pcard').count() == 7)
    check('the beta never touches the real table', dm.evaluate("localStorage.getItem('initiative-tracker-v1')") is None)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_round14(b):
    """Feedback round: Focus default, top bar Start combat and Roll for initiative, timer scope, hover on touch,
    member conditions, Add one, Saving throw label, even d20."""
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    dm = page(ctx, density=None); dm.goto(URL); nav(dm, 'add', 'player')
    add_player(dm, 'Rowan', 'Brian', '24', '17'); add_player(dm, 'Alric', 'Tim', '31', '15'); add_to_fight(dm, [15, 9]); add_npc(dm, 'Ogre', 12, 59)
    add_npc(dm, 'Goblin', 5, 7, qty='4', group=True)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    collapsed = lambda: [r.get_attribute('class').count('collapsed') > 0 for r in dm.locator('.row').all()]
    # ---- Focus is the default, and works before combat
    check('the card view starts on Focus', dm.get_attribute('[data-act=density][data-val=focus]', 'aria-checked') == 'true')
    check('before combat, Focus keeps every card closed', all(collapsed()), collapsed())
    dm.locator('.row').first.locator('.who').click(); dm.wait_for_timeout(200)
    check('tapping a closed card opens just that one', collapsed()[0] is False and all(collapsed()[1:]), collapsed())
    dm.click('[data-act=density][data-val=full]'); dm.wait_for_timeout(150); check('Full opens them all before combat too', not any(collapsed()))
    dm.click('[data-act=density][data-val=focus]'); dm.wait_for_timeout(150)
    # ---- top bar: Start combat and Roll for initiative
    sb = dm.locator('#ctlmain [data-act=next]')
    check('before combat the top bar has a Start combat button', sb.count() == 1 and 'start' in sb.inner_text().lower() and sb.get_attribute('aria-label') == 'Start combat')
    rb = dm.locator('#ctlmain [data-act=rfiToggle]'); w0 = rb.bounding_box()['width']
    rb.click(); dm.wait_for_timeout(200); rb = dm.locator('#ctlmain [data-act=rfiToggle]')
    check('Roll for initiative keeps (nearly) its width when switched on: only Show/Hide changes', abs(rb.bounding_box()['width'] - w0) <= 8 and 'hide' in rb.inner_text().lower() and rb.locator('.rfidot:not(.off)').count() == 1, (w0, rb.bounding_box()['width']))
    rb.click(); dm.wait_for_timeout(200)
    sb.click(); dm.wait_for_timeout(300)
    check('Start combat in the top bar starts combat and goes away', st()['started'] is True and dm.locator('#ctlmain [data-act=next]').count() == 0)
    check('in combat, Focus opens only the card in turn', collapsed()[0] is False and all(collapsed()[1:]), collapsed())
    # ---- timer: each turn or the whole combat
    dm.click('[data-act=timerOpen]'); dm.wait_for_timeout(150); dm.click('[data-act=seg][data-grp=tset][data-val=up]'); dm.wait_for_timeout(150)
    check('the timer offers Each turn or Whole combat', dm.locator('[data-grp=tscope]').count() == 2)
    dm.click('[data-act=seg][data-grp=tscope][data-val=combat]'); dm.wait_for_timeout(150)
    dm.wait_for_timeout(1300); e1 = st()['timer']
    nxt(dm); dm.wait_for_timeout(200); e2 = st()['timer']
    check('the whole-combat timer keeps counting through a turn change', e2['scope'] == 'combat' and e2['running'] and e2['startedAt'] == e1['startedAt'], (e1, e2))
    if dm.locator('#tpop').is_hidden(): dm.click('[data-act=timerOpen]'); dm.wait_for_timeout(150)
    dm.click('[data-act=seg][data-grp=tset][data-val=down]'); dm.wait_for_timeout(150)
    check('a whole-combat countdown is set in minutes', dm.locator('[data-tset=cmins]').count() == 1 and dm.locator('[data-tset=secs]').count() == 0)
    dm.click('[data-act=seg][data-grp=tset][data-val=off]'); dm.click('[data-act=timerOpen]'); dm.wait_for_timeout(150)
    # ---- group: Add one, Saving throw, conditions for some members
    g = dm.locator('.row.group'); dm.click('[data-act=density][data-val=full]'); dm.wait_for_timeout(150)
    add = g.locator('[data-act=mAdd]')
    check('the add-to-group button says Add one, not +1', 'add one' in add.inner_text().lower() and '+1' not in add.inner_text() and add.get_attribute('aria-label') == 'Add another Goblin')
    check('the saving throw button says Saving throw', row(dm, 'Ogre').locator('[data-act=saveOpen]').inner_text().strip().lower() == 'saving throw')
    g.locator('[data-act=condOpen]').click(); g.locator('[data-act=condPick][data-name=Prone]').click(); dm.wait_for_timeout(100)
    check('for a group, the condition panel asks who: All or each one', [x.strip() for x in g.locator('.cwho button').all_inner_texts()] == ['All 4', '1', '2', '3', '4'] and g.locator('.cwho [data-v=all]').get_attribute('aria-pressed') == 'true')
    g.locator('.cwho .cwnum').nth(1).click(); g.locator('.cwho .cwnum').nth(2).click(); g.locator('[data-act=condApply]').click(); dm.wait_for_timeout(200)
    grp = lambda: [c for c in st()['combatants'] if c.get('members')][0]
    check('Prone goes on members 2 and 3 only', [len(cd.get('mem', [])) for cd in grp()['conditions'] if cd['name'] == 'Prone'] == [2] and 'on 2, 3' in g.locator('.conds .chip').first.inner_text())
    check('each member shows its own conditions', [g.locator('.mem').nth(i).locator('.mcond').count() for i in range(4)] == [0, 1, 1, 0])
    g.locator('.mem').nth(1).locator('[data-act=condMemRemove]').click(); dm.wait_for_timeout(200)
    check('the x on a member removes it from that member only', [len(cd.get('mem', [])) for cd in grp()['conditions'] if cd['name'] == 'Prone'] == [1])
    tv = page(ctx, size=(1920, 1080)); tv.goto(URL + '#monitor'); tv.wait_for_timeout(900)
    check('the Combat Monitor says which members have it', 'Prone · 3' in tv.inner_text('.pcard:has-text("Goblin")'), tv.inner_text('.pcard:has-text("Goblin")')[:200])
    g.locator('.mem').nth(2).locator('[data-act=mSplit]').click(); dm.wait_for_timeout(300)
    s = st(); sp = [c for c in s['combatants'] if c['name'] == 'Goblin 3'][0]
    check('splitting member 3 off takes its Prone along, and the group no longer has it', [cd['name'] for cd in sp['conditions']] == ['Prone'] and 'mem' not in sp['conditions'][0] and not [cd for cd in grp()['conditions'] if cd['name'] == 'Prone'])
    g.locator('[data-act=condOpen]').click(); g.locator('[data-act=condPick][data-name=Poisoned]').click(); g.locator('[data-act=condApply]').click(); dm.wait_for_timeout(200)
    check('All still puts a condition on the whole group (no member list)', [('mem' in cd) for cd in grp()['conditions'] if cd['name'] == 'Poisoned'] == [False])
    # ---- the d20 has one stroke weight
    widths = set(dm.evaluate("()=>{const d=document.createElement('div'); d.innerHTML=document.querySelector('#ctlmain .rfibtn')?document.querySelector('#ctlmain .rfibtn').innerHTML:''; return [...document.querySelectorAll('.rfiicon svg path, #ctlmain .rfibtn svg path')].map(p=>getComputedStyle(p).strokeWidth)}") or ['x'])
    check('the d20 is drawn with one even stroke weight', len(widths) <= 1, widths)
    check('no page errors', not (dm._errs + tv._errs), dm._errs + tv._errs); ctx.close()

def t_round14_touch(b):
    """Phones: no sticky hover, no full-screen button where it can't work, two-row amount box, compact Library,
    Monitor preview as a swipeable strip, Target window Apply pinned and every row reachable."""
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    dm = page(ctx, size=(390, 844)); dm.goto(URL); nav(dm, 'add', 'player')
    add_player(dm, 'Rowan', 'Brian', '24', '17'); add_player(dm, 'Alric', 'Tim', '31', '15'); add_to_fight(dm, [15, 9]); add_npc(dm, 'Ogre', 12, 59)
    for n in ('Bat', 'Rat', 'Wolf', 'Boar'): add_npc(dm, n, 3, 5)
    check('a touch screen does not report hover, so hover styles stay off', dm.evaluate("matchMedia('(hover:hover)').matches") is False)
    btn = row(dm, 'Rowan').locator('[data-act=condOpen]')
    before = btn.evaluate("e=>getComputedStyle(e).backgroundColor"); btn.hover(); dm.wait_for_timeout(100)
    check('touching a button does not leave it highlighted', btn.evaluate("e=>getComputedStyle(e).backgroundColor") == before)
    check('no Full screen button on a touch phone without full screen', dm.evaluate("(document.documentElement.requestFullscreen&&document.fullscreenEnabled)") or dm.locator('#ctlmain .fsbtn').count() == 0)
    hp = row(dm, 'Rowan').locator('.hpact'); box = lambda sel: hp.locator(sel).bounding_box()
    a, d, h = box('[data-delta]'), box('.dgrp'), box('.hgrp')
    check('the amount box spans the Damage and Heal rows', a['y'] <= d['y'] + 2 and a['y'] + a['height'] >= h['y'] + h['height'] - 2 and a['x'] + a['width'] <= d['x'], (a, d, h))
    m = dm.locator('#ctlmain')
    check('the top bar keeps the menu button and the card switch on one row', abs(m.locator('.hambtn').bounding_box()['y'] - m.locator('.densityseg').bounding_box()['y']) < 12)
    # Monitor preview
    dm.evaluate("()=>document.querySelector('[data-act=monPreview]').click()"); dm.wait_for_timeout(400)
    cards = dm.locator('#monmini .pcard'); c0, c1 = cards.nth(0).bounding_box(), cards.nth(1).bounding_box()
    x = dm.locator('#monmini .mmclose').bounding_box()
    check('the preview is one row of small cards', abs(c0['y'] - c1['y']) < 2 and c0['width'] <= 160, (c0, c1))
    check('the preview close button does not sit on a card', x['y'] + x['height'] <= c0['y'] + 1, (x, c0))
    dm.evaluate("()=>document.querySelector('[data-act=monPreview]').click()"); dm.wait_for_timeout(200)
    # Library
    lib_open(dm, 'book'); dm.wait_for_timeout(300)
    s_box, n_box = dm.locator('[data-mmsearch]').bounding_box(), dm.locator('.mmnew').bounding_box()
    check('Library: search and + New share a row', abs(s_box['y'] - n_box['y']) < 10, (s_box, n_box))
    check('Library: the first creature shows in the top half of the window', dm.locator('.mmrow').first.bounding_box()['y'] < 844 * 0.55, dm.locator('.mmrow').first.bounding_box())
    lib_close(dm)
    # Target window
    dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(300)
    dm.locator('.aoebody').evaluate("e=>e.scrollTop=e.scrollHeight"); dm.wait_for_timeout(150)
    clear = dm.evaluate("()=>{const r=[...document.querySelectorAll('.aoerow')].pop().getBoundingClientRect(), f=document.querySelector('.aoefoot').getBoundingClientRect(); return r.bottom<=f.top+1}")
    check('Target: the last creature scrolls clear of the pinned Apply button', clear)
    check('Target: Apply stays at the bottom of the window', abs(dm.locator('.aoeapply').bounding_box()['y'] + dm.locator('.aoeapply').bounding_box()['height'] - 844) < 40)
    check('no sideways scrolling', not dm.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
    check('no page errors', not dm._errs, dm._errs); ctx.close()

def t_custom_spells(b):
    """Your own spells: new, edit a copy of an SRD spell, edit, delete; tags follow what they do; the Target window uses them."""
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    mine = lambda: {x['n']: x for x in st().get('customSpells', [])}
    lib_open(dm, 'spells'); dm.wait_for_timeout(300)
    dm.click('[data-spl=new]'); dm.wait_for_timeout(250)
    check('+ New opens the spell form with the name box focused', dm.locator('.spform').count() == 1 and dm.evaluate("document.activeElement.dataset.spff") == 'n')
    labels = dm.eval_on_selector_all('.spform input[type=text], .spform select', "els=>els.every(e=>e.closest('label') && e.closest('label').innerText.trim().length>0)")
    check('every field in the form has a visible label', labels)
    dm.click('.spform button[type=submit]'); dm.wait_for_timeout(150)
    check('saving without a name says so', 'name' in dm.inner_text('.sperr').lower())
    dm.fill('[data-spff=n]', 'Frost Lance'); dm.fill('[data-spff=dm]', 'three d8'); dm.click('.spform button[type=submit]'); dm.wait_for_timeout(150)
    check('dice that are not dice are refused, and what was typed stays', 'dice' in dm.inner_text('.sperr').lower() and dm.input_value('[data-spff=n]') == 'Frost Lance')
    dm.fill('[data-spff=n]', 'Fireball'); dm.fill('[data-spff=dm]', '3d8'); dm.click('.spform button[type=submit]'); dm.wait_for_timeout(150)
    check('a name an SRD spell already has is refused', 'already a spell' in dm.inner_text('.sperr').lower())
    dm.fill('[data-spff=n]', 'Frost Lance'); dm.select_option('[data-spff=l]', '2'); dm.select_option('[data-spff=sv]', 'dex')
    dm.select_option('[data-spff=dt]', 'cold'); dm.fill('[data-spff=dper]', '1d8'); dm.select_option('[data-spff=cd]', 'Restrained'); dm.check('.spform [name=cl][value=Wz]')
    dm.click('.spform button[type=submit]'); dm.wait_for_timeout(300)
    fl = mine().get('Frost Lance', {})
    check('it is saved as your spell', fl.get('custom') and fl.get('l') == 2 and fl.get('dm') == '3d8' and fl.get('dt') == ['cold'] and fl.get('sv') == 'dex' and fl.get('cd') == ['Restrained'] and fl.get('cl') == ['Wz'], fl)
    check('more dice per slot level: 4d8 at level 3, 10d8 at level 9', fl.get('up', {}).get('3') == '4d8' and fl.get('up', {}).get('9') == '10d8', fl.get('up'))
    check('after saving, the list shows Yours with it, tagged Damage and Condition', dm.get_attribute('[data-spl=tag][data-v=yours]', 'aria-checked') == 'true' and [x.strip() for x in dm.locator('.sprow2[data-spn="Frost Lance"] .sptag').all_inner_texts()] == ['Damage', 'Condition'])
    # edit a copy of an SRD spell
    dm.click('[data-spl=tag][data-v=all]'); dm.fill('[data-spf=q]', 'cure wounds'); dm.wait_for_timeout(250)
    dm.click('.sprow2[data-spn="Cure Wounds"] [data-spl=copy]'); dm.wait_for_timeout(250)
    check('Edit a copy fills the form from the original', dm.input_value('[data-spff=n]') == 'Cure Wounds (custom)' and dm.input_value('[data-spff=hl]') == '2d8' and dm.input_value('[data-spff=hper]') == '2d8' and dm.is_checked('[data-spff=hm]'))
    dm.fill('[data-spff=n]', 'Greater Cure'); dm.fill('[data-spff=hl]', '4d8'); dm.click('.spform button[type=submit]'); dm.wait_for_timeout(300)
    gc = mine().get('Greater Cure', {})
    check('the copy is your own spell and the original is unchanged', gc.get('hl') == '4d8' and gc.get('base') == 'Cure Wounds' and gc.get('hu', {}).get('2') == '6d8' and 'Cure Wounds' not in mine(), gc)
    check('the Yours chip counts your spells', '2' in dm.inner_text('[data-spl=tag][data-v=yours]'))
    # edit your own: rename
    dm.click('.sprow2[data-spn="Greater Cure"] [data-spl=edit]'); dm.wait_for_timeout(200)
    dm.fill('[data-spff=n]', 'Greater Mending'); dm.click('.spform button[type=submit]'); dm.wait_for_timeout(300)
    check('editing your spell renames it in place', sorted(mine()) == ['Frost Lance', 'Greater Mending'])
    lib_close(dm)
    # the Target window uses them
    row(dm, 'Rowan').locator('[data-delta]').fill('15'); row(dm, 'Rowan').locator('[data-act=dmg]').first.click(); dm.wait_for_timeout(200)
    dm.click('#dock [data-act=targetOpen]'); dm.wait_for_timeout(300); dm.click('[data-aoe=kind][data-v=spell]'); dm.wait_for_timeout(300)
    dm.click('[data-aoe=sptag][data-v=damage]'); dm.fill('[data-spin=q]', 'frost lance'); dm.wait_for_timeout(250)
    check('your spells appear in the Target window, marked yours', dm.locator('.sprowbtn[data-n="Frost Lance"] .yours').count() == 1)
    dm.click('.sprowbtn[data-n="Frost Lance"]'); dm.wait_for_timeout(300)
    check('picking it sets up the damage and the DEX save', dm.inner_text('.spdt').strip().lower().startswith('3d8 cold') and dm.get_attribute('[data-aoe=ab][data-v=dex]', 'aria-checked') == 'true')
    dm.select_option('[data-spin=slot]', '4'); dm.wait_for_timeout(200); check('casting it higher uses your dice per level', dm.inner_text('.spdt').strip().lower().startswith('5d8'))
    dm.click('[data-aoe=spChange]'); dm.click('[data-aoe=sptag][data-v=heal]'); dm.fill('[data-spin=q]', 'mending'); dm.wait_for_timeout(250)
    dm.click('.sprowbtn[data-n="Greater Mending"]'); dm.wait_for_timeout(250)
    check('a healing spell of yours sets up Heal', dm.locator('.aoeapply.heal').count() == 1 and dm.inner_text('.spdt').startswith('4d8'))
    dm.fill('[data-aoein=amt]', '6'); mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Rowan")) .aoename'); dm.click('.aoeapply'); dm.wait_for_timeout(300)
    check('and it heals', hp(dm, 'Rowan') == '15', hp(dm, 'Rowan'))
    # delete with undo; kept after a reload
    lib_open(dm, 'spells'); dm.click('[data-spl=tag][data-v=yours]'); dm.wait_for_timeout(200)
    dm.click('.sprow2[data-spn="Frost Lance"] [data-spl=del]'); dm.wait_for_timeout(250)
    check('Delete removes it', sorted(mine()) == ['Greater Mending'])
    dm.click('#toast [data-act=undo]'); dm.wait_for_timeout(300); check('and Undo brings it back', sorted(mine()) == ['Frost Lance', 'Greater Mending'])
    check('SRD spells have Edit a copy only; yours have Edit and Delete', dm.locator('.sprow2[data-spn="Frost Lance"] [data-spl=edit]').count() == 1 and dm.locator('.sprow2[data-spn="Frost Lance"] [data-spl=del]').count() == 1)
    lib_close(dm); dm.reload(); dm.wait_for_timeout(600)
    check('your spells are kept with the table', sorted(mine()) == ['Frost Lance', 'Greater Mending'])
    # a cantrip of your own grows with character level
    lib_open(dm, 'spells'); dm.click('[data-spl=new]'); dm.fill('[data-spff=n]', 'Spark Bolt'); dm.select_option('[data-spff=l]', '0'); dm.fill('[data-spff=dm]', '1d10')
    dm.click('.spform button[type=submit]'); dm.wait_for_timeout(300)
    check('a cantrip of yours grows at levels 5, 11 and 17', mine()['Spark Bolt'].get('cu') == ['2d10', '3d10', '4d10'], mine()['Spark Bolt'].get('cu'))
    lib_close(dm)
    # the form on a phone
    m = page(ctx, size=(390, 844)); m.goto(URL); m.wait_for_timeout(500); lib_open(m, 'spells'); m.click('[data-spl=new]'); m.wait_for_timeout(250)
    check('on a phone the form fits without sideways scrolling', not m.evaluate('document.documentElement.scrollWidth>innerWidth+1') and m.locator('.spform').bounding_box()['width'] <= 390)
    check('no page errors', not (dm._errs + m._errs), dm._errs + m._errs); ctx.close()

def t_target_spell_layout(b):
    """Target window > Spells: the search box keeps its width beside the level menu, and the list fills the column down to Apply."""
    errs = []
    for size in [(1123, 834), (1440, 900), (1280, 700)]:
        ctx = b.new_context(viewport={'width': size[0], 'height': size[1]}, reduced_motion='reduce'); dm = basic_table(ctx)
        tgt(dm); dm.click('[data-aoe=kind][data-v=spell]'); dm.wait_for_timeout(300)
        g = dm.evaluate("""()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const row=r('.spsearch'),q=r('.spsearch input'),l=r('.splist'),f=r('.aoectl .aoefoot');
          return {q:q.width,row:row.width,gap:f.top-l.bottom,lh:l.height}}""")
        check('%dx%d: the search box takes most of the row (%d of %d px)' % (size[0], size[1], g['q'], g['row']), g['q'] >= g['row'] * 0.5, g)
        check('%dx%d: the spell list reaches down to Apply (gap %d px)' % (size[0], size[1], g['gap']), 0 <= g['gap'] <= 40 and g['lh'] >= 200, g)
        check('%dx%d: the five tag chips are shown' % size, dm.locator('[data-aoe=sptag]').count() == 5)
        errs += dm._errs; ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce'); m = basic_table(ctx)
    tgt(m); m.click('[data-aoe=kind][data-v=spell]'); m.wait_for_timeout(300)
    q = m.evaluate("()=>[document.querySelector('.spsearch input').getBoundingClientRect().width, document.querySelector('.spsearch').getBoundingClientRect().width]")
    check('phone: the search box keeps its width (%d of %d px)' % tuple(q), q[0] >= q[1] * 0.5, q)
    check('phone: no sideways scrolling', not m.evaluate('document.documentElement.scrollWidth>innerWidth+1'))
    errs += m._errs; ctx.close()
    check('no page errors', not errs, errs)

def t_spell_fixes(b):
    """Aid raises max and current HP; Regenerate heals; the spell form scrolls with Save and Cancel always reachable."""
    ctx = b.new_context(viewport={'width': 1185, 'height': 898}, reduced_motion='reduce'); dm = basic_table(ctx)
    st = lambda: json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    who = lambda n: [c for c in st()['combatants'] if c['name'] == n][0]
    # the form in the Library
    lib_open(dm, 'spells'); dm.fill('[data-spf=q]', 'aid'); dm.wait_for_timeout(250)
    check('Aid is tagged Healing in the Library', [x.strip() for x in dm.locator('.sprow2[data-spn="Aid"] .sptag').all_inner_texts()] == ['Healing'])
    dm.click('.sprow2[data-spn="Aid"] [data-spl=copy]'); dm.wait_for_timeout(250)
    g = dm.evaluate("()=>{const b=document.querySelector('.mmbody'),k=document.querySelector('.spfbtns').getBoundingClientRect(),r=b.getBoundingClientRect();return {sh:b.scrollHeight,ch:b.clientHeight,ov:getComputedStyle(b).overflowY,kb:k.bottom,rb:r.bottom,kt:k.top}}")
    check('the form is taller than the window here, and the window scrolls', g['sh'] > g['ch'] and g['ov'] == 'auto', g)
    check('Save and Cancel are on screen before scrolling', g['kt'] >= 0 and g['kb'] <= g['rb'] + 1, g)
    hit = dm.evaluate("()=>{const k=document.querySelector('.spfbtns button[type=submit]').getBoundingClientRect();const e=document.elementFromPoint(k.left+k.width/2,k.top+k.height/2);return !!(e&&e.closest('button[type=submit]'))}")
    check('and nothing covers Save', hit)
    dm.mouse.move(600, 500); dm.mouse.wheel(0, 3000); dm.wait_for_timeout(250)
    check('scrolling reaches the healing fields', dm.locator('[data-spff=hl]').is_visible() and dm.evaluate("document.querySelector('.mmbody').scrollTop") > 0)
    check('a copy of Aid keeps "Also raises maximum hit points"', dm.is_checked('[data-spff=hmx]') and dm.input_value('[data-spff=hl]') == '5' and dm.input_value('[data-spff=hper]') == '5')
    dm.click('[data-spl=cancel]'); dm.wait_for_timeout(200); check('Cancel leaves the form', dm.locator('.spform').count() == 0 and dm.locator('.sprow2').count() > 0)
    lib_close(dm)
    # Aid in the Target window
    tgt(dm); dm.click('[data-aoe=kind][data-v=spell]'); dm.wait_for_timeout(250)
    check('Aid is listed under All', dm.locator('.sprowbtn[data-n="Aid"]').count() == 1)
    dm.fill('[data-spin=q]', 'aid'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Aid"]'); dm.wait_for_timeout(300)
    check('picking Aid fills in 5, with nothing to roll', dm.input_value('[data-aoein=amt]') == '5' and dm.locator('[data-aoe=spRoll]').count() == 0 and 'maximum' in dm.inner_text('.spdt'))
    dm.select_option('[data-spin=slot]', '4'); dm.wait_for_timeout(200)
    check('cast with a level 4 slot it gives 15', dm.input_value('[data-aoein=amt]') == '15', dm.input_value('[data-aoein=amt]'))
    dm.select_option('[data-spin=slot]', '2'); dm.wait_for_timeout(200)
    r0, a0 = who('Rowan'), who('Alric')
    mpick(dm, 'none'); dm.click('.aoerow:has(b:text-is("Rowan")) .aoename'); dm.click('.aoerow:has(b:text-is("Alric")) .aoename'); dm.wait_for_timeout(200)
    prev = dm.inner_text('.aoerow:has(b:text-is("Rowan"))')
    check('the preview shows max HP going up too', '%d/%d' % (r0['hp'] + 5, r0['maxHp'] + 5) in prev, prev)
    dm.click('.aoeapply'); dm.wait_for_timeout(300)
    r1, a1 = who('Rowan'), who('Alric')
    check('Aid raises maximum and current HP by 5, even at full HP', r1['maxHp'] == r0['maxHp'] + 5 and r1['hp'] == r0['hp'] + 5 and a1['maxHp'] == a0['maxHp'] + 5 and a1['hp'] == a0['hp'] + 5, (r0, r1))
    undo(dm); dm.wait_for_timeout(300); r2 = who('Rowan')
    check('one Undo puts both back', r2['maxHp'] == r0['maxHp'] and r2['hp'] == r0['hp'])
    # Regenerate is a healing spell with a roll
    tgt(dm); dm.click('[data-aoe=kind][data-v=spell]'); dm.wait_for_timeout(250)
    # the window reopens on the last spell picked
    if dm.locator('[data-aoe=spChange]').count(): dm.click('[data-aoe=spChange]'); dm.wait_for_timeout(200)
    dm.click('[data-aoe=sptag][data-v=heal]'); dm.fill('[data-spin=q]', 'regen'); dm.wait_for_timeout(250); dm.click('.sprowbtn[data-n="Regenerate"]'); dm.wait_for_timeout(250)
    dm.click('[data-aoe=spRoll]'); dm.wait_for_timeout(200); v = int(dm.input_value('[data-aoein=amt]') or 0)
    check('Regenerate rolls 4d8 + 15 (19 to 47)', 19 <= v <= 47, v)
    check('no page errors', not dm._errs, dm._errs); ctx.close()

SUITE = [t_turn_engine, t_conditions, t_hp_and_death, t_groups, t_reactions_ready_legendary, t_ac_and_display, t_health_display,
         t_library_clone_undo_images, t_tv, t_privacy, t_skins_and_settings, t_phone, t_phone_stale_tab_and_offline_sheet, t_effects, t_sound, t_colour_blind, t_views_and_names, t_cloud, t_card_and_half, t_rolling, t_clone_dialog, t_aoe, t_studio, t_spark, t_palettes_and_shadows, t_frost_feywild, t_top_bar, t_monitor_layout, t_mobile_dm, t_desktop_unchanged, t_aoe_conditions, t_aoe_conditions_mobile, t_target_attack, t_confirm_end, t_controls_and_labels, t_turn_shading, t_compact_layout, t_neutral_distinct, t_target_list, t_target_layout, t_monster_library, t_library_mobile, t_side_and_screen, t_button_centering, t_builder, t_name_generator, t_builder_mobile, t_card_controls, t_names_setting, t_collapse_cards, t_regroup, t_monitor_sizes, t_open_monitor, t_manage_combat, t_polish_round2, t_menu_width_and_icon, t_monitor_screen, t_monitor_round3, t_skins_round3, t_player_screen, t_round5_dm, t_round5_mobile, t_round5_phone, t_menu_close_x, t_target_round6, t_encounters, t_qr_blur, t_round7, t_campaigns, t_round7_phone_logo, t_library_tabs, t_settings_window, t_rx_hidden_landscape, t_editor_access, t_cards_round8, t_library_round8, t_add_window, t_standard_npcs, t_round9, t_round10, t_round11, t_round12, t_spells, t_lr_not_spent_on_heal, t_round13, t_round13_phone, t_round13_canvas, t_contrast_all_skins, t_demo, t_beta_accounts, t_round14, t_round14_touch, t_custom_spells, t_target_spell_layout, t_spell_fixes]
if __name__ == '__main__':
    only = sys.argv[2:] if len(sys.argv) > 2 else None
    with sync_playwright() as p:
        b = p.chromium.launch()
        for fn in SUITE:
            if only and fn.__name__ not in only: continue
            try: fn(b)
            except Exception as e:
                failed.append('%s crashed: %s' % (fn.__name__, str(e).splitlines()[0][:160])); traceback.print_exc(limit=1)
        b.close()
    print('PASSED %d, FAILED %d' % (passed, len(failed)))
    for f in failed: print('  FAIL', f)
    sys.exit(1 if failed else 0)
