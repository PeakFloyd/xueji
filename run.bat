@echo off
REM ============================================================
REM  XueJi Management System - run script
REM  Run the compiled GUI application (run build.bat first)
REM ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "JAVA=C:\Program Files\Microsoft\jdk-17.0.9.8-hotspot\bin\java.exe"
if not exist "%JAVA%" set "JAVA=java.exe"

REM include project root in classpath so db\schema.sql is loadable
"%JAVA%" -cp ".;out;lib\sqlite-jdbc.jar" xueji.Main
if errorlevel 1 (
    echo [RUN FAILED - please run build.bat first]
    pause
)
endlocal
