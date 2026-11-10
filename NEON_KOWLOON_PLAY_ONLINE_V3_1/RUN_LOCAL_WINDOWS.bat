@echo off
cd /d "%~dp0"
echo NEON KOWLOON 97 - MULTIPLAYER LOCAL SERVER
echo.
where py >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_RUN=py -3"
  goto found
)
where python >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_RUN=python"
  goto found
)
echo No usable Python executable found on this computer.
echo To play on your phone or with distant friends, deploy online instead.
echo See README.md for free Render hosting instructions.
pause
exit /b 1
:found
%PYTHON_RUN% -m pip install -r requirements.txt
if errorlevel 1 (
  echo Could not install dependencies. Check that Python 3.11 or newer is installed.
  pause
  exit /b 1
)
echo.
echo Open http://localhost:3000/ in your browser.
echo Other players on the internet need an ONLINE deployment. See README.md.
echo.
%PYTHON_RUN% server.py
pause
