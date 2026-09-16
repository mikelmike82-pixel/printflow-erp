# Testing Axe Printing ERP with a real printer

The link you were sent (the one that opens in any browser) is great for clicking around the ERP — billing, inventory, invoicing, and so on. But it **can't test an actual printer**, because a printer is physically plugged into your computer, and the online link has no way to reach it. Real printer testing needs a few extra minutes of one-time setup, done directly on your computer.

## What you need

- A Windows computer with the printer you want to test already installed (the one you normally print to)
- [Python](https://www.python.org/downloads/) installed (if it's not already — during install, tick "Add Python to PATH")

## Steps

1. **Get the project folder onto your computer.** You'll be sent either a link to download it or a ZIP file — extract it if it's a ZIP, so you have a normal folder on your Desktop or in Documents.

2. **Open that folder and double-click `Test-With-Your-Printer.bat`.**

3. The first time you run it, a new window will pop up asking for **Administrator permission** — click Yes. This is needed to pause the printer so held jobs can wait for your confirmation.

4. That window will show a list of your printers. **Tick the one you want to test with**, then continue through the setup. When it says the Print Bridge is installed, close that window.

5. Go back to the first window and **press any key** — it will now start the ERP and open it in your browser automatically.

6. **Log in** with one of the demo accounts shown on the login screen (password `demo123` for all).

7. Go to **Print Counter** in the sidebar, then **print anything to the printer you picked** — from Word, Excel, a browser, or any other program, the normal way (Ctrl+P → pick that printer → Print).

8. The ERP should immediately pop up a **New Print Job** screen showing your document. Fill in the customer/material details and click **Confirm & Print** — the job will actually print for real, or click **Discard** if you just wanted to test without wasting paper.

## After the first time

You don't need to repeat the setup — just double-click `Test-With-Your-Printer.bat` again any time you want to test. It'll skip straight to opening the ERP.

## If something doesn't work

- Nothing pops up when you print → make sure you printed to the printer you ticked during setup, not a different one.
- The setup window closes immediately / nothing happens → try right-clicking `Test-With-Your-Printer.bat` and choosing "Run as administrator."
- Anything else → note what you did and what you saw on screen, and send that back — it's much easier to fix with those details.
