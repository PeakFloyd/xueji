@echo off
REM ============================================================
REM  XueJi - reset the demo database to its pristine state
REM  (deterministic rebuild from seed_data.sql; auto-backup first)
REM
REM  Use this after manual testing via webui.py / CLI, because those
REM  write to the REAL database.
REM ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

echo Rebuilding demo database (a backup will be created first)...
python db\init_db.py --fresh
if errorlevel 1 (
    echo [RESET FAILED]
    pause
    exit /b 1
)
echo.
echo [RESET DONE] database restored to pristine demo data.
endlocal
