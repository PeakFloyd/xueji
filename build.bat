@echo off
REM ============================================================
REM  XueJi Management System - build script
REM  Compile all Java sources into out directory (JDK17)
REM ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "JAVAC=C:\Program Files\Microsoft\jdk-17.0.9.8-hotspot\bin\javac.exe"
if not exist "%JAVAC%" set "JAVAC=javac.exe"

if not exist out mkdir out

dir /s /b src\*.java > .sources.txt
"%JAVAC%" -encoding UTF-8 -cp "lib\sqlite-jdbc.jar" -d out @.sources.txt
if errorlevel 1 (
    echo [BUILD FAILED]
    del .sources.txt >nul 2>&1
    exit /b 1
)
del .sources.txt >nul 2>&1
echo [BUILD OK]
endlocal
