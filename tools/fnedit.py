"""Safe, function-scoped edits to tests/battlemaster_tests.py.

Why: a find-and-replace on a phrase that appears in two tests once deleted a whole stretch of the
test file. These helpers only touch ONE test function, insist the text matches exactly once there,
and refuse to save if the number of tests went down.

    import sys; sys.path.insert(0, 'tools')
    from fnedit import Tests
    t = Tests()
    t.sub('t_round12', "old text", "new text")                 # exact text, once, inside that test
    t.line('t_round12', "    check('starts with'", "    check('new line', ...)")   # replace the whole line
    t.add('t_new_thing', "def t_new_thing(b):\\n    ...")      # add a test and register it in SUITE
    t.save()
"""
import os, re

PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'battlemaster_tests.py')

class Tests:
    def __init__(self, path=PATH):
        self.path = path; self.s = open(path, encoding='utf-8').read(); self.before = len(re.findall(r'^def t_', self.s, flags=re.M))

    def _range(self, name):
        a = self.s.index('def %s(' % name); b = self.s.find('\ndef ', a + 5)
        return a, (len(self.s) if b < 0 else b + 1)

    def sub(self, name, old, new):
        a, b = self._range(name); body = self.s[a:b]
        if body.count(old) != 1: raise SystemExit('%s: expected 1 match, found %d for: %s' % (name, body.count(old), old[:70]))
        self.s = self.s[:a] + body.replace(old, new) + self.s[b:]

    def line(self, name, starts_with, new):
        a, b = self._range(name); body = self.s[a:b]
        if body.count(starts_with) != 1: raise SystemExit('%s: expected 1 line starting with %r, found %d' % (name, starts_with[:60], body.count(starts_with)))
        i = body.index(starts_with); j = body.index('\n', i); self.s = self.s[:a] + body[:i] + new + body[j:] + self.s[b:]

    def add(self, name, code):
        marker = '\nSUITE = ['
        if self.s.count(marker) != 1: raise SystemExit('could not find SUITE')
        self.s = self.s.replace(marker, '\n' + code.rstrip() + '\n' + marker)
        i = self.s.index('SUITE = ['); j = self.s.index(']\nif __name__', i)
        self.s = self.s[:j] + ', ' + name + self.s[j:]

    def save(self, allow_fewer=False):
        now = len(re.findall(r'^def t_', self.s, flags=re.M))
        if now < self.before and not allow_fewer: raise SystemExit('refusing to save: tests went from %d to %d' % (self.before, now))
        compile(self.s, self.path, 'exec')
        open(self.path, 'w', encoding='utf-8').write(self.s); print('saved (%d tests)' % now)
