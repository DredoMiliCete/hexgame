@echo off
cd /d "%~dp0"
echo Open http://localhost:8000 in your browser
start "" http://localhost:8000
python -m http.server 8000
