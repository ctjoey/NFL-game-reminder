@echo off
title NFL Game Reminder
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page - install the LTS version, then double-click Run App.bat again.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist node_modules\express (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
node launch.js
pause
