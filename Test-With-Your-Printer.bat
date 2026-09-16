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
REM So real print testing always happens locally, from this folder. This
REM script is the "just double-click it" way to do that: it sets up the
REM Print Bridge the first time (asking which printer to test with), then
REM starts the ERP and opens it at http://localhost - already same-origin
REM plain-http, so nothing gets blocked.
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
    echo   show you a list of your printers to pick from.
    echo.
    start "" "%~dp0windows-print-bridge\Install.bat"
    echo Finish the setup in that new window - pick your printer^(s^) when
    echo asked. Once it says the Print Bridge is installed, come back to
    echo THIS window and press any key to continue.
    echo.
    pause >nul
) else (
    echo Step 1 of 2: Print Bridge is already set up on this computer - skipping.
)

echo.
echo Step 2 of 2: Starting the ERP and opening it in your browser...
echo   (Leave this window open while you're testing. Log in with one of
echo    the demo accounts shown on the login screen, go to Print Counter,
echo    then print something from Word/Excel/etc. to the printer you
echo    picked - the ERP should pop up asking you to confirm it.)
echo.
start "" http://localhost:8000
python serve.py 8000
