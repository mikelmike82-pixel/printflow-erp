#!/usr/bin/env python3
"""
Local static file server for the Axe Printing ERP — a drop-in replacement
for `python -m http.server` that adds one thing: every response tells the
browser "always check back with me before using a cached copy"
(Cache-Control: no-cache). Plain http.server sends no caching headers at
all, which lets the browser guess how long it's safe to reuse a file —
and on a machine that's had this app open before, that guess can be
"quite a while," so an update pushed to a JS file doesn't actually show
up until the tab is hard-refreshed (Ctrl+Shift+R) or the cache is cleared
by hand. That's confusing on a tool that gets updated while people are
actively using it, so this server closes the gap: the browser still
caches for speed, but always revalidates first, so a real edit always
shows up on the very next normal reload.

Usage (same as the plain http.server it replaces):
    python3 serve.py            # serves the current directory on :8000
    python3 serve.py 8080       # or a different port
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = HTTPServer(("", port), NoCacheHandler)
    print(f"Axe Printing ERP — serving this folder at http://localhost:{port}")
    print("Every file is served with Cache-Control: no-cache, so updates always show up on the next reload — no hard refresh needed.")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
