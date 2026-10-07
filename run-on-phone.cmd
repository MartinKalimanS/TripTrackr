@echo off
rem Starts the dev stack and opens TripTrackr on a USB-connected Android phone.
rem Double-click it, or run it from a terminal. Options pass through, for example:
rem   run-on-phone.cmd -Check          report what would happen, change nothing
rem   run-on-phone.cmd -RebuildApp     force a native rebuild of the dev client
rem   run-on-phone.cmd -Stop           stop the Docker stack
rem Everything it does is explained in scripts\run-on-phone.ps1.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-on-phone.ps1" %*
set "code=%errorlevel%"
echo %cmdcmdline% | find /i "%~0" >nul
if not errorlevel 1 (
  echo.
  pause
)
exit /b %code%
