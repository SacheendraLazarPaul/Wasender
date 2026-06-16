@echo off
setlocal
title WaSender
set "APP=%~dp0"
set "COMPOSE=%~dp0..\OpenWA\docker-compose.dev.yml"

echo ============================================
echo    Starting WaSender
echo ============================================
echo.

REM 1) Make sure Docker Desktop is running
docker info >nul 2>&1
if errorlevel 1 (
  echo [1/4] Starting Docker Desktop...
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  echo       waiting for the Docker engine ^(can take ~30-60s^)...
  :waitdocker
  timeout /t 5 >nul
  docker info >nul 2>&1
  if errorlevel 1 goto waitdocker
)
echo [1/4] Docker engine: OK

REM 2) Start the OpenWA containers
echo [2/4] Starting OpenWA...
docker compose -f "%COMPOSE%" up -d >nul

REM 3) Wait until the OpenWA API answers
echo [3/4] Waiting for OpenWA API...
:waitapi
timeout /t 3 >nul
curl -s -o nul "http://localhost:2785/api/health"
if errorlevel 1 goto waitapi
echo       OpenWA API: OK
REM clear any stale Chromium lock left by an unclean shutdown
docker exec openwa-api sh -c "rm -f /app/data/sessions/session-test1/Singleton* 2>/dev/null"

REM 4) Build the React UI on first run, then start WaSender (auto-reconnects) and open it
echo [4/4] Starting WaSender...
cd /d "%APP%"
if not exist "dist\index.html" (
  echo       building UI for the first time...
  call npm install
  call npm run build
)
start "WaSender" /min cmd /c "node server.js"
timeout /t 2 >nul
start "" "http://localhost:3000"

echo.
echo ============================================
echo    WaSender is up:  http://localhost:3000
echo    (Browser opened. You can close this window.)
echo ============================================
timeout /t 6 >nul
