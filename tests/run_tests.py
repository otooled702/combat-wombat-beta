#!/usr/bin/env python3
"""Run the Battlemaster tests, in parallel, against dist/initiative-tracker.html.

    python3 tests/run_tests.py                    everything (about 14 minutes on one core)
    python3 tests/run_tests.py --jobs 6           everything, six browsers at once
    python3 tests/run_tests.py --quick            only 3 skins in the skin loops
    python3 tests/run_tests.py --area target      one area (see --list), or any word in a test name
    python3 tests/run_tests.py t_spells t_aoe     named tests
    python3 tests/run_tests.py --list             show areas and test names
    python3 tests/run_tests.py --url file:///path/to/page.html

Each worker is a separate process with its own browser, so --jobs N uses N cores.
Logs for every worker go to tests/.last-run/. The exit code is 1 if anything failed.
"""
import os, sys, re, subprocess, argparse, threading, time, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_URL = 'file://' + os.path.join(os.path.dirname(HERE), 'dist', 'initiative-tracker.html')

AREAS = {
    'smoke':   ['t_turn_engine', 't_aoe', 't_round12', 't_spells', 't_library_tabs', 't_round11', 't_spark'],
    'target':  ['t_aoe', 't_aoe_conditions', 't_aoe_conditions_mobile', 't_target_attack', 't_target_list', 't_target_layout', 't_target_round6', 't_round9', 't_round12', 't_spells', 't_lr_not_spent_on_heal'],
    'library': ['t_monster_library', 't_library_mobile', 't_library_tabs', 't_library_round8', 't_standard_npcs', 't_add_window', 't_spells', 't_library_clone_undo_images'],
    'cards':   ['t_cards_round8', 't_compact_layout', 't_card_and_half', 't_card_controls', 't_collapse_cards', 't_round10', 't_round11', 't_controls_and_labels', 't_regroup', 't_groups'],
    'skins':   ['t_spark', 't_skins_and_settings', 't_skins_round3', 't_palettes_and_shadows', 't_frost_feywild', 't_neutral_distinct', 't_turn_shading', 't_button_centering', 't_studio'],
    'combat':  ['t_turn_engine', 't_conditions', 't_hp_and_death', 't_groups', 't_reactions_ready_legendary', 't_ac_and_display', 't_manage_combat', 't_confirm_end'],
    'screens': ['t_tv', 't_phone', 't_player_screen', 't_monitor_layout', 't_monitor_sizes', 't_monitor_screen', 't_monitor_round3', 't_open_monitor', 't_round5_phone', 't_mobile_dm'],
}

def all_names(url):
    sys.argv = ['x', url]; sys.path.insert(0, HERE)
    import battlemaster_tests as T
    return [f.__name__ for f in T.SUITE]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*'); ap.add_argument('--url', default=DEFAULT_URL)
    ap.add_argument('--jobs', type=int, default=max(1, min(6, (os.cpu_count() or 2) - 1)))
    ap.add_argument('--quick', action='store_true'); ap.add_argument('--area'); ap.add_argument('--list', action='store_true')
    ap.add_argument('--chunk', type=int, default=3, help='tests per browser launch')
    a = ap.parse_args()
    names_all = all_names(a.url)
    if a.list:
        print('areas:'); [print('  %-8s %s' % (k, ' '.join(v))) for k, v in AREAS.items()]
        print('\nall tests (%d):\n  %s' % (len(names_all), ' '.join(names_all))); return 0
    names = list(a.names)
    if a.area:
        names += AREAS.get(a.area) or [n for n in names_all if a.area in n]
        if not names: print('no tests match "%s"' % a.area); return 2
    if not names: names = names_all
    bad = [n for n in names if n not in names_all]
    if bad: print('unknown test(s):', ' '.join(bad)); return 2
    names = list(dict.fromkeys(names))
    path = a.url.replace('file://', '')
    if a.url.startswith('file://') and not os.path.exists(path):
        print('Page not found: %s\nRun  python3 build.py  first.' % path); return 2
    env = dict(os.environ); env['BM_QUICK'] = '1' if a.quick else ''
    logs = os.path.join(HERE, '.last-run'); os.makedirs(logs, exist_ok=True)
    chunks = [names[i:i + a.chunk] for i in range(0, len(names), a.chunk)]
    print('%d tests in %d groups, %d at a time%s' % (len(names), len(chunks), a.jobs, ' (quick: 3 skins)' if a.quick else ''), flush=True)
    t0 = time.time(); lock = threading.Lock(); done = [0]
    def work(i, ch):
        r = subprocess.run([sys.executable, os.path.join(HERE, 'battlemaster_tests.py'), a.url] + ch, capture_output=True, text=True, env=env)
        out = r.stdout + (('\n[stderr]\n' + r.stderr) if r.stderr.strip() else '')
        open(os.path.join(logs, 'group-%02d.log' % i), 'w').write('tests: %s\n\n%s' % (' '.join(ch), out))
        m = re.findall(r'^PASSED (\d+), FAILED (\d+)', r.stdout, flags=re.M)
        fails = re.findall(r'^  FAIL (.*)$', r.stdout, flags=re.M)
        if not m:
            fails = ['worker crashed (%s): see tests/.last-run/group-%02d.log' % (' '.join(ch), i)]; p = 0
        else: p = int(m[-1][0])
        with lock:
            done[0] += 1; print('  [%d/%d] %s  %d passed%s' % (done[0], len(chunks), ' '.join(ch), p, ('  FAILED: %d' % len(fails)) if fails else ''), flush=True)
        return p, fails
    P = 0; F = []
    with cf.ThreadPoolExecutor(max_workers=a.jobs) as ex:
        for p, f in ex.map(lambda x: work(*x), list(enumerate(chunks))): P += p; F += f
    print('\nPASSED %d, FAILED %d  (%.0f s)' % (P, len(F), time.time() - t0))
    for f in F: print('  FAIL', f)
    return 1 if F else 0

if __name__ == '__main__':
    sys.exit(main())
