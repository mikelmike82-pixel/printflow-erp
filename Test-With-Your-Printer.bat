@echo off
REM One-click local test flow for a client/tester who has a real printer.
REM
REM Why this exists: the hosted GitHub Pages link is great for exploring the
REM ERP's screens and workflow from any device, but it CANNOT test real
REM printing. Two separate reasons:
REM   1. Browsers block a secure (https) page from calling a plain (http)
REM      address on this computer - and the Print Bridge's local listener
REM      is plain http, by design (it never leaves this PC).
REM   2. A printer is physically plugged into ONE computer. The ERP has to
REM      be open in a browser ON THAT SAME COMPUTER for it to see it - no
REM      hosted link changes where the printer is.
REM So real print testing always happens locally, from this folder.
REM
REM What this script does: the FIRST time you run it, it sets up the Print
REM Bridge (asking which printer to test with) - that same one-time setup
REM also registers the ERP's own local server to start automatically in the
REM background from now on, at every login, with no window to keep open.
REM Every time after that, this script just opens the ERP - it's already
REM running quietly in the background, same as after a restart.
title Axe Printing ERP - Test With Your Printer
cd /d "%~dp0"

echo ============================================================
echo   Axe Printing ERP - Test With a Real Printer
echo ============================================================
echo.

schtasks /query /tn "AxePrintBridgeAgent" >nul 2>&1
if %errorlevel% neq 0 (
    echo Step 1 of 2: Setting up the Print Bridge for your printer.
    echo   A new window will ask you to allow Administrator access, then
    echo   show you a list of your printers to pick from. This also sets
    echo   the ERP to start automatically in the background from now on -
    echo   you won't need to run this setup again.
    echo.
    start "" "%~dp0windows-print-bridge\Install.bat"
    echo Finish the setup in that new window - pick your printer^(s^) when
    echo asked. Once it says "Done!", come back to THIS window and press
    echo any key to continue.
    echo.
    pause >nul
) else (
    echo Step 1 of 2: Print Bridge is already set up on this computer - skipping.
)

echo.
echo Step 2 of 2: Opening the ERP...
echo   Log in with one of the demo accounts shown on the login screen, go to
echo   Print Counter, then print something from Word/Excel/etc. to the
echo   printer you picked - the ERP should pop up asking you to confirm it.
echo.

schtasks /query /tn "AxeErpLocalServer" >nul 2>&1
if %errorlevel% equ 0 (
    REM The installer already registered the ERP's server to run hidden in
    REM the background - just make sure it's up, then open the browser.
    schtasks /run /tn "AxeErpLocalServer" >nul 2>&1
    timeout /t 2 /nobreak >nul
    start "" http://localhost:8000
    echo The ERP runs quietly in the background now - you can close this
    echo window. It'll keep running, even after you restart this computer.
) else (
    REM Fallback for an older setup, or if Python wasn't found during
    REM install - run it in this window the old way instead.
    echo Running it in this window instead - leave this open while testing.
    start "" http://localhost:8000
    python serve.py 8000
)
