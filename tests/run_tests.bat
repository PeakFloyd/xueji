@echo off
REM ============================================================
REM XueJi - Python JSON bridge regression tests (no model service required).
REM Every test uses a temporary COPY of the database.
REM ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

echo === Python bridge tests (offline) ===
python -m unittest discover -s tests -p "test_bridge.py" -v
if errorlevel 1 (
    echo [BRIDGE TESTS FAILED]
    exit /b 1
)

echo [ALL TESTS PASSED]
endlocal
