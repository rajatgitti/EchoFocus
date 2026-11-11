@echo off
rem Double-click launcher for EchoFocus: runs run.sh through Git's bash.
rem Close this window (or press Ctrl+C) to stop the platform.
title EchoFocus
cd /d "%~dp0"

set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Git Bash not found. Install Git for Windows: https://git-scm.com/download/win
  pause
  exit /b 1
)

"%GITBASH%" run.sh %*
pause
