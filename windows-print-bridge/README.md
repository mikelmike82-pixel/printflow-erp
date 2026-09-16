# Axe Printing ERP — Print Bridge

The small Windows-side helper that makes the ERP open automatically —
and actually print for real — whenever someone prints from CorelDRAW,
Adobe Illustrator, Adobe Photoshop, or any other application on this
computer.

## How it actually works (no fakery)

1. `install-axe-print-bridge.ps1` lets you pick which of this computer's
   **real, already-installed printers** should go through the ERP (the
   same ones that already show up in CorelDRAW's/Word's/any app's normal
   Print dialog — nothing new is added to that list).
2. It pauses those printers using a built-in Windows feature
   (`Win32_Printer.Pause`) — the same thing as right-clicking a printer
   and choosing "Pause Printing". A paused printer still *accepts* jobs
   from any application; they just sit held in the queue instead of
   printing immediately.
3. The background agent (`print-agent.ps1`) watches those queues. The
   instant a new held job shows up, it opens the ERP's **New Print Job**
   screen with that exact printer + job pre-identified, and brings the
   browser window to the front.
4. Once the operator fills in the customer/billing details and clicks
   **Confirm & Print**, the ERP calls the agent (a small local connection
   on this same computer only) to release *that one job* —
   `Resume-PrintJob` — so it prints for real, using the printer's own
   real driver. Full fidelity: no PDF conversion, no re-rendering step.
5. It also takes a best-effort guess at which application the job came
   from (from the print job's document name) and pre-selects it in the
   ERP — a convenience, not a certainty; the operator can always correct
   it.

**Known limitation, stated plainly:** whether releasing one held job
prints only that job — versus resuming the whole paused queue and
letting anything else waiting also print — isn't something Microsoft
documents either way. It needs to be confirmed empirically on this
machine (print two things to a gated printer, hold one, release the
other, see what happens) rather than assumed. Until confirmed, treat a
gated printer as "one held job at a time."

**Discarding a held job you don't want to bill.** Clicking Cancel on the
New Print Job popup only closes that ERP screen — it does *not* touch the
real held job, which stays paused in Windows' own queue either way. If a
held job is a test page, a duplicate, or something sent by mistake and
you don't want it printed at all, use the **"Discard — Don't Print"**
button on that popup instead of Cancel — that tells the agent to actually
remove it from the real print queue (`Remove-PrintJob`), same as
right-clicking the document in Windows and choosing Cancel yourself.

**Already have documents stuck "Paused" from before this button
existed?** A code update doesn't retroactively touch jobs already sitting
in a real Windows print queue — clear those out once, by hand: open
**Settings > Bluetooth & devices > Printers & scanners** (or the classic
Devices and Printers), open the gated printer's queue, select the stuck
document(s), and Cancel them (or right-click the printer itself and
"Cancel All Documents"). Do this once per gated printer and they won't
come back on their own.

**No physical printer on this computer yet?** The installer only
offers *real* printers to gate by default — it deliberately skips
"Microsoft Print to PDF", "Microsoft XPS Document Writer", and "Fax"
since gating those wouldn't make sense day-to-day. If it finds no real
printer at all (common on a computer/VM with no printer hardware
plugged in), it says so and offers to gate "Microsoft Print to PDF" as
a stand-in instead. That lets you test the entire flow right now —
hold → popup → confirm & bill → release → the paused "printer" produces
a PDF instead of ink on paper, but the pause/detect/release plumbing is
exactly what a real printer will use. Re-run the installer and pick
the real printer once one is connected — nothing else needs to change.

## The ERP now starts itself too

The installer doesn't just set up the printer side — its last step also
registers the ERP's own local server (`serve.py`) as a second scheduled
task, `AxeErpLocalServer`, running hidden in the background and starting
at every login (needs Python on this computer; the installer says so and
skips this step if it can't find it). Combined with the print-agent, that
means after running the installer once, **nothing needs to be manually
started ever again** — log in, print from any application, and the ERP's
New Print Job screen pops up on its own, exactly as if someone had it open
already. A "Axe Printing ERP" shortcut is also dropped on the Desktop for
opening it by hand anytime (checking the dashboard, billing, etc.).

If you'd rather test it the old manual way (one foreground window you can
watch the output of), `Test-With-Your-Printer.bat` in the project root
still works — it runs the installer for you the first time, then falls
back to running `serve.py` in a visible window only if the background
task isn't there for some reason.

## Files

- `Install.bat` — double-click to install/reconfigure. Asks for admin
  permission once (needed to pause printers), then walks through setup,
  including registering the ERP's own auto-start (see above).
- `install-axe-print-bridge.ps1` — the actual installer (safe to re-run
  to change the ERP address or which printers are gated).
- `print-agent.ps1` — the background agent: polls gated printers for new
  held jobs, opens the ERP, and runs a small local listener
  (`127.0.0.1:8899`) the ERP calls to release a confirmed job (or discard
  one it shouldn't print). Copied into `C:\AxePrintBridge` and started
  automatically at every login as the `AxePrintBridgeAgent` scheduled
  task. Remembers which jobs it's already notified you about in
  `C:\AxePrintBridge\seen-jobs.json`, so a held job you haven't dealt
  with yet doesn't re-pop-up the ERP screen every time the agent restarts
  (a reboot, or re-running `Install.bat`) — only once per job, until it's
  confirmed, discarded, or removed by hand.
- `Uninstall.bat` — resumes (un-pauses) the gated printers, and removes
  both scheduled tasks (`AxePrintBridgeAgent` and `AxeErpLocalServer`)
  along with the Desktop shortcut.

## After installing

- In the ERP itself, open **Printers / Plotters** and set each printer's
  **Windows Printer Name** field to match the real Windows name exactly
  — that's how an incoming real job gets matched back to the right ERP
  printer record and preselected in the wizard.
- `C:\AxePrintBridge\config.json` — holds the ERP address and the list of
  gated printer names. Edit directly, or just re-run `Install.bat`.
- `C:\AxePrintBridge\agent.log` — a plain text log of every held job
  noticed and every resume request handled — the first place to look if
  something doesn't fire.
- A printer you gate should be one dedicated to this workflow — anyone
  else printing to it for unrelated things will also get held pending an
  ERP confirmation.
