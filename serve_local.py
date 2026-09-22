#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os, webbrowser
from pathlib import Path
root=Path(__file__).resolve().parent
os.chdir(root)
url='http://127.0.0.1:8765/'
print('TERYAQ Master Tool running at', url)
print('Press Ctrl+C to stop.')
try: webbrowser.open(url)
except Exception: pass
ThreadingHTTPServer(('127.0.0.1',8765),SimpleHTTPRequestHandler).serve_forever()
