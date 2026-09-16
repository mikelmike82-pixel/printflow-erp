# Testing Axe Printing ERP with a real printer

The link you were sent (the one that opens in any browser) is great for clicking around the ERP — billing, inventory, invoicing, and so on. But it **can't test an actual printer**, because a printer is physically plugged into your computer, and the online link has no way to reach it. Real printer testing needs a one-time setup, done directly on your computer — but it's just installing an app, like installing anything else.

## What you need

- A Windows computer with the printer you want to test already installed (the one you normally print to)

## Steps

1. **Download `AxePrintingERP-Setup.exe`** from the link you were sent.

2. **Open it from your Downloads folder and run it.** Windows will likely show a blue "Windows protected your PC" screen first — this is normal for smaller/independent software that hasn't paid for a certificate; click **More info**, then **Run anyway**.

3. Click through the setup wizard (**Next** → **Next** → **Install**) — no need to change anything.

4. On the last page, leave **"Set up the Print Bridge now"** ticked and click **Finish**. A new window will pop up asking for **Administrator permission** — click Yes. This is needed to pause the printer so held jobs can wait for your confirmation.

5. That window will show a list of your printers. **Tick the one you want to test with**, then continue through the setup. When it says **"Done!"**, close that window.

6. You'll now have an **"Axe Printing ERP"** icon on your Desktop and in your Start Menu — just like any other installed app. Double-click it to open the ERP in your browser.

7. **Log in** with one of the demo accounts shown on the login screen (password `demo123` for all).

8. From here on, you don't even need the browser tab open — **just go about your normal work.** Print anything to the printer you picked, from Word, Excel, a browser, or any other program, the normal way (Ctrl+P → pick that printer → Print).

9. The ERP should pop up on its own with a **New Print Job** screen showing your document. Fill in the customer/material details and click **Confirm & Print** — the job will actually print for real, or click **Discard** if you just wanted to test without wasting paper.

## After the first time

That setup really is one-time: the ERP and the Print Bridge both start automatically every time you log into this computer, even after a restart — nothing to double-click, nothing to leave running. Just print to the printer you picked, from any program, whenever you want to test. Use the **"Axe Printing ERP"** icon any time you want to open the app directly (dashboard, billing, etc.), separately from a print job popping it up.

If you ever want to remove it, it's a normal uninstall — Windows Settings → Apps → **Axe Printing ERP** → Uninstall.

## If something doesn't work

- Nothing pops up when you print → make sure you printed to the printer you ticked during setup, not a different one.
- The SmartScreen warning won't let you continue → click the small "More info" link first — the "Run anyway" button only appears after that.
- Nothing pops up even right after restarting your computer → open the **"Axe Printing ERP"** shortcut once by hand — the background pieces should already be running, but this confirms it.
- Anything else → note what you did and what you saw on screen, and send that back — it's much easier to fix with those details.
