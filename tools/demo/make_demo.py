#!/usr/bin/env python3
"""Build src/data/demo.json: the sample table the demo opens with.

Drives the real app (dist/initiative-tracker.html, so build first) to add the party and the creatures
from the Library, then fixes the details by hand: initiatives, ability scores and two saved encounters.

    .venv/bin/python tools/demo/make_demo.py
"""
import json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tests'))
sys.argv = sys.argv[:1]                      # the test module reads argv[1] as the page URL
import battlemaster_tests as T
from playwright.sync_api import sync_playwright

PARTY = [  # name, player, max HP, AC, initiative, ability scores
    ('Rowan', 'Brian', 44, 18, 17, {'str': 16, 'dex': 12, 'con': 15, 'int': 10, 'wis': 12, 'cha': 8}),
    ('Mira', 'Jo', 24, 12, 15, {'str': 8, 'dex': 14, 'con': 13, 'int': 17, 'wis': 12, 'cha': 10}),
    ('Alric', 'Tim', 38, 16, 9, {'str': 14, 'dex': 10, 'con': 14, 'int': 10, 'wis': 16, 'cha': 12}),
    ('Thorn', 'Sam', 31, 15, 6, {'str': 10, 'dex': 17, 'con': 12, 'int': 13, 'wis': 10, 'cha': 14}),
]
FIGHT = [('Goblin Boss', 1, False, 14), ('Goblin Warrior', 4, True, 12), ('Worg', 1, False, 8)]   # name, qty, group, initiative
OTHER = [('Ogre', 1, False, 10)]                                                                   # for the second saved encounter
STARS = ['Ogre', 'Goblin Boss', 'Worg', 'Bugbear Warrior']
CAMPAIGN = 'Wombat Hollow'

def lib_add(dm, name, qty, group):
    T.lib_open(dm, 'book'); dm.fill('[data-mmsearch]', name); dm.wait_for_timeout(300)
    row = '.mmrow:has(b:text-is("%s")) ' % name
    want = 'true' if group else 'false'
    if dm.get_attribute('[data-mm=group]', 'aria-pressed') != want: dm.click('[data-mm=group]')
    if qty > 1: dm.fill(row + '[data-mmq]', str(qty))
    dm.click(row + '[data-mm=add]'); dm.wait_for_timeout(400)

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    dm = T.page(ctx); dm.goto(T.URL); dm.wait_for_timeout(500)
    for n, pl, hp, ac, *_ in PARTY: T.add_player(dm, n, pl, str(hp), str(ac))
    T.add_to_fight(dm, [x[4] for x in PARTY])
    for n, q, g, _ in FIGHT + OTHER: lib_add(dm, n, q, g)
    for n in STARS:
        dm.fill('[data-mmsearch]', n); dm.wait_for_timeout(250)
        st = dm.locator('.mmrow:has(b:text-is("%s")) [data-mm=star]' % n)
        if st.get_attribute('aria-pressed') != 'true': st.click(); dm.wait_for_timeout(200)
    T.lib_close(dm)
    s = json.loads(dm.evaluate("localStorage.getItem('initiative-tracker-v1')"))
    b.close()

inits = {n: i for n, *_, i in [(x[0], x[4]) for x in PARTY] + [(f[0], f[3]) for f in FIGHT + OTHER]}
def base(name):
    for k in inits:
        if name == k or name.startswith(k + ' '): return k
    return None
for c in s['combatants']:
    c['init'] = inits[base(c['name'])]
for c in s['combatants']:
    if c.get('members'): c['name'] = 'Goblins'          # the Library names a group "Goblin Warrior 1"; a plain name reads better
abil = {x[0]: x[5] for x in PARTY}
for c in s['combatants'] + s['party']:
    if c['name'] in abil:
        c.setdefault('sheet', {}); c['sheet'].setdefault('ab', {})
        for k, v in abil[c['name']].items(): c['sheet']['ab'][k] = {'score': str(v), 'save': ''}
ogre = [c for c in s['combatants'] if base(c['name']) == 'Ogre']
main = [c for c in s['combatants'] if base(c['name']) != 'Ogre']
order = lambda L: sorted(L, key=lambda c: -c['init'])
s['combatants'] = order(main)
party = [c for c in main if c.get('kind') == 'pc']
now = int(time.time() * 1000)
s['encounters'] = [
    {'id': 'demo-enc-1', 'name': 'Goblin ambush', 'campaign': CAMPAIGN, 'at': now, 'round': 0, 'started': False, 'turnId': None, 'seq': s.get('seq', 0), 'combatants': s['combatants']},
    {'id': 'demo-enc-2', 'name': 'The ogre’s bridge', 'campaign': CAMPAIGN, 'at': now, 'round': 0, 'started': False, 'turnId': None, 'seq': s.get('seq', 0), 'combatants': order(party + ogre)},
]
s['encName'], s['encCamp'] = 'Goblin ambush', CAMPAIGN
s['round'], s['started'], s['turnId'], s['rfi'] = 0, False, None, False
out = os.path.join(ROOT, 'src', 'data', 'demo.json')
json.dump(s, open(out, 'w'), separators=(',', ':'))
print('wrote', out, len(json.dumps(s)), 'bytes:', [c['name'] for c in s['combatants']])
