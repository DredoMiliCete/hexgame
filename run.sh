#!/bin/sh
# Starts the game at http://localhost:8000 and the online-play server (needs Node.js 18+, https://nodejs.org).
# Without Node it falls back to a plain Python server: hotseat only, no online play. Press Ctrl+C to stop.
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then exec node server/server.js "$@"; fi
echo "Node.js was not found: starting the hotseat-only server (no online play)."
echo "Install Node.js from https://nodejs.org to play online."
echo "Open http://localhost:8000 in your browser"
exec python3 -m http.server 8000
