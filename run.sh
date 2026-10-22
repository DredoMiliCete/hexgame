#!/bin/sh
# Serves the game at http://localhost:8000 (needs Python 3). Press Ctrl+C to stop.
cd "$(dirname "$0")"
echo "Open http://localhost:8000 in your browser"
python3 -m http.server 8000
