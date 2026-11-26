"""Serve a local page over http while the tests run.

Why: with the claude.ai stand-in (mockroom.js) loaded, Chromium sometimes drops the saved table from
localStorage across a quick reload when the page is opened as a file:// URL. Over http that never
happens (checked over many reload loops), and http is how people load the app (GitHub Pages, claude.ai).
So the runners turn a file:// URL into an http:// one served from 127.0.0.1.
"""
import os, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class _Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def http_url(url):
    """Return (url, server). A file:// URL becomes http://127.0.0.1:<port>/<file>; anything else is returned as is."""
    if not url.startswith('file://'):
        return url, None
    path = url[len('file://'):]
    folder, name = os.path.dirname(path), os.path.basename(path)
    srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_Quiet, directory=folder))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:%d/%s' % (srv.server_address[1], name), srv
