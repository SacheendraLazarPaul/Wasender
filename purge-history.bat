@echo off
cd /d "%~dp0"
echo ============================================================
echo   Purge phone number from WaSender git HISTORY
echo ------------------------------------------------------------
echo   This rewrites the GitHub repo into ONE clean commit
echo   (your current, redacted files) so your phone number is
echo   gone from every old commit. This is a one-time rewrite.
echo   Your local .env (real key) is untouched and ignored.
echo ============================================================
echo.
set /p ok="Type YES and press Enter to proceed (anything else cancels): "
if /i not "%ok%"=="YES" ( echo Cancelled - nothing changed. & pause & exit /b )
echo.
echo Rewriting history...
git checkout --orphan _clean
git add -A
git commit -m "WaSender - self-hosted React WhatsApp sender dashboard (OpenWA)"
git branch -D main
git branch -m _clean main
git push --force origin main
echo.
echo ============================================================
echo   Done. Your number is no longer in any commit.
echo   Refresh: https://github.com/SacheendraLazarPaul/Wasender
echo ============================================================
pause
