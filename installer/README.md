# Building the Windows installer

`AxePrintingERP-Setup.exe` is a normal double-click installer, built from
`axe-printing-erp.nsi` with [NSIS](https://nsis.sourceforge.io/) (free,
open source). Running it gives whoever downloads it a real installed app:
Start Menu entry, Desktop icon, listed in "Apps & Features", proper
uninstaller — the same experience as installing any other small Windows
program, just without a fee for a code-signing certificate (see the
SmartScreen note below).

## What it actually does

1. Installs the whole ERP (everything in this repo except the `installer/`
   folder itself) into `%LOCALAPPDATA%\AxePrintingERP` — no admin needed
   for this part, since it's a per-user install location.
2. Creates a Desktop shortcut and Start Menu entry, "Axe Printing ERP",
   that opens the ERP in the browser (`http://localhost:8000`) — like
   opening any other app.
3. On the last page of setup, offers to immediately run
   `windows-print-bridge\Install.bat` (checked by default) — that's the
   one part that needs admin (to pause a real printer), so Windows will
   show its own "Do you want to allow this app to make changes?" prompt
   at that point, same as running it by hand.
4. Registers a proper uninstaller (`Uninstall.exe`, also listed in Apps &
   Features) that resumes any paused printer, removes the two background
   scheduled tasks, and deletes the installed files and shortcuts.

## Rebuilding after a code change

Whenever anything in the project changes and you want a new installer:

```
cd installer
makensis axe-printing-erp.nsi
```

That's it — it re-packages everything under the project root (again,
excluding `installer/` itself) into a fresh `AxePrintingERP-Setup.exe`.
Bump `PRODUCT_VERSION` at the top of `axe-printing-erp.nsi` first if you
want the new version number to show up in Apps & Features.

`makensis` runs on Windows, macOS, and Linux (it doesn't need Wine to
*build* a Windows .exe — only to *run* one, which obviously needs a real
Windows machine or VM to actually test).

## Getting it to your client

The `.exe` itself isn't committed to this repo (see `.gitignore`) —
binaries don't belong in git history, and there's a cleaner home for it:

1. On GitHub, go to your repo → **Releases** (right sidebar) → **Create a
   new release**.
2. Tag it (e.g. `v1.0.0`), give it a title, and drag
   `AxePrintingERP-Setup.exe` into the "Attach binaries" area.
3. Publish it — GitHub gives you a permanent download link like
   `https://github.com/YOUR-USERNAME/printflow-erp/releases/download/v1.0.0/AxePrintingERP-Setup.exe`.
4. Send your client that link (or a page that links to it). Clicking it
   downloads the installer; running it is the same as installing any
   other small Windows app.

## The one thing to be upfront with your client about

This installer isn't code-signed (a signing certificate costs money and
needs a registered business identity to obtain), so Windows SmartScreen
will show a blue "Windows protected your PC" screen the first time it's
run. The client clicks **"More info"** → **"Run anyway"** to continue —
this is normal for small/independent software, not a sign anything is
wrong, but it's much less alarming if you mention it before they see it
rather than after.
