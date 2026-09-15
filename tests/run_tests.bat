@echo off
REM ============================================================
REM  XueJi - run all AI-layer regression tests
REM  1) offline tests : no Ollama needed (security / numbers / templates)
REM  2) e2e tests     : needs local Ollama (auto-skipped if unavailable)
REM  Tests run against a COPY of the database, never the real one.
REM ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

echo === offline tests (no Ollama required) ===
python tests\test_offline.py
if errorlevel 1 (
    echo [OFFLINE TESTS FAILED]
    exit /b 1
)

echo.
echo === end-to-end tests (needs Ollama) ===
python tests\test_e2e.py
if errorlevel 1 (
    echo [E2E TESTS FAILED]
    exit /b 1
)

echo.
echo [ALL TESTS PASSED]
endlocal
