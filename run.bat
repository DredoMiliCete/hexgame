@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start /b cmd /c "timeout /t 2 >nul & start http://localhost:8000"
  node server\server.js %*
  goto :eof
)
echo Node.js was not found: starting the hotseat-only server (no online play).
echo Install Node.js from https://nodejs.org to play online.
start "" http://localhost:8000
python -m http.server 8000
