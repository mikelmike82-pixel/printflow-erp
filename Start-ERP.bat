@echo off
REM Starts the Axe Printing ERP's local server (with cache-busting so
REM updates always show up on the next reload — see serve.py) and opens
REM it in the default browser. Leave this window open while using the ERP.
cd /d "%~dp0"
start "" http://localhost:8000
python serve.py 8000
