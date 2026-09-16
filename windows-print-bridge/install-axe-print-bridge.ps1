# Axe Printing ERP - Print Bridge Installer (v2)
#
# What this does, in order:
#   1. Asks where your ERP opens in the browser (saved to config.json).
#   2. Shows your computer's real printers and lets you pick which ones
#      should go through the ERP - print to any picked printer, and it'll
#      hold there until confirmed/billed in the ERP, then print for real.
#   3. Pauses those printers (Win32_Printer.Pause) so jobs sent to them
#      sit held instead of printing immediately - a built-in Windows
#      feature, not a custom driver.
#   4. Installs the background agent (print-agent.ps1) that watches those
#      printers' queues and releases a job once you confirm it in the ERP.
#   5. Registers a scheduled task so the agent starts automatically every
#      time you log in, and starts it immediately.
#
# Safe to re-run - it removes and recreates its own scheduled task each
# time, and cleans up the older v1 "Axe Printing ERP" virtual printer if
# you'd installed that first (this version doesn't need it).

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "Administrator access is needed to pause printers - requesting it now..."
    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
        -Verb RunAs
    exit
}

$BridgeDir     = "C:\AxePrintBridge"
$ConfigFile    = Join-Path $BridgeDir "config.json"
$AgentSrc      = Join-Path $PSScriptRoot "print-agent.ps1"
$AgentDst      = Join-Path $BridgeDir "print-agent.ps1"
$TaskName      = "AxePrintBridgeAgent"
$OldTaskName   = "AxePrintBridgeWatcher"
$OldPrinterName = "Axe Printing ERP"
$OldPortFile   = Join-Path $BridgeDir "incoming.prn"

# Names Windows installs itself, plus our own old v1 printer - never
# offered as something to gate for real production use, since gating them
# wouldn't make sense there (no ink, no paper). OneNote's virtual printer
# is deliberately NOT in this list: unlike "Microsoft Print to PDF" (which
# pops up an interactive "Save As" dialog on every single release - no
# good for testing unattended), OneNote silently accepts the job with no
# dialog, which makes it a genuinely convenient stand-in for testing this
# whole flow on a computer with no physical printer attached yet.
$ExcludedNames = @("Microsoft Print to PDF", "Microsoft XPS Document Writer", "Fax", $OldPrinterName)

Write-Host "======================================================="
Write-Host " Axe Printing ERP - Print Bridge Installer"
Write-Host "======================================================="
Write-Host ""

New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null

# --- Clean up the old v1 virtual printer, if present ------------------------
if (Get-Printer -Name $OldPrinterName -ErrorAction SilentlyContinue) {
    Write-Host "Removing the older 'Axe Printing ERP' virtual printer (this version gates your real printers directly instead)..."
    Remove-Printer -Name $OldPrinterName -ErrorAction SilentlyContinue
    if (Get-PrinterPort -Name $OldPortFile -ErrorAction SilentlyContinue) {
        Remove-PrinterPort -Name $OldPortFile -ErrorAction SilentlyContinue
    }
}
Unregister-ScheduledTask -TaskName $OldTaskName -Confirm:$false -ErrorAction SilentlyContinue

# --- 1. ERP address ----------------------------------------------------------
$defaultUrl = "http://localhost:8000"
Write-Host "Where does the Axe Printing ERP normally open in your browser?"
Write-Host "(This is the address from the README - e.g. http://localhost:8000)"
$typed = Read-Host "ERP address [$defaultUrl]"
if ([string]::IsNullOrWhiteSpace($typed)) { $typed = $defaultUrl }
$erpUrl = $typed.TrimEnd("/")
Write-Host "[1/5] ERP address: $erpUrl"

# --- 2. Pick which real printers to gate ------------------------------------
Write-Host ""
Write-Host "[2/5] Looking at the printers on this computer..."

# NOTE: every list below is forced into an array with @(...). Without that,
# PowerShell turns a zero-match Where-Object result into a plain $null instead
# of an empty array, $null.Count silently comes back as $null (not 0, no
# error), and "$null -eq 0" is $false - so a check like "if ($x.Count -eq 0)"
# never fires and the script sails past a genuinely empty list. @(...) makes
# .Count a real integer (0 for empty) every time, so the checks below work
# whether there are 0, 1, or many printers.
$allPrinters = @(Get-Printer | Sort-Object Name)

if ($allPrinters.Count -eq 0) {
    Write-Host "No printers at all were found on this computer - not even a virtual one like 'Microsoft Print to PDF'."
    Write-Host "Add a printer in Windows first (Settings -> Printers & scanners), then re-run this installer."
    Read-Host "Press Enter to close this window"
    exit 1
}

$candidates = @($allPrinters | Where-Object { $ExcludedNames -notcontains $_.Name })

if ($candidates.Count -eq 0) {
    Write-Host "This computer doesn't have a real (physical) printer installed - only these:"
    foreach ($p in $allPrinters) { Write-Host "  - $($p.Name)" }
    Write-Host ""
    Write-Host "That's normal for a computer or VM with no printer hardware plugged in yet."
    Write-Host "You can still set up and test the ERP's whole workflow (hold job -> pop up ->"
    Write-Host "confirm & bill -> release) right now using 'Microsoft Print to PDF' as a stand-in -"
    Write-Host "it saves a PDF instead of real ink on paper, but everything else behaves the same."
    Write-Host "Once a real printer is connected, just re-run this installer and pick it instead."
    Write-Host ""
    $useFallback = Read-Host "Use 'Microsoft Print to PDF' as a stand-in for testing now? (y/n)"
    if ($useFallback -match '^\s*y') {
        $candidates = @($allPrinters | Where-Object { $_.Name -eq "Microsoft Print to PDF" })
        if ($candidates.Count -eq 0) { $candidates = $allPrinters }
    } else {
        Write-Host ""
        Write-Host "OK - nothing will be gated. Connect a real printer (or re-run this installer and"
        Write-Host "say yes to the stand-in) whenever you're ready."
        Read-Host "Press Enter to close this window"
        exit 0
    }
}

Write-Host ""
Write-Host "Here are the printer(s) available to gate:"
for ($i = 0; $i -lt $candidates.Count; $i++) {
    Write-Host "  [$($i + 1)] $($candidates[$i].Name)"
}
Write-Host ""
Write-Host "Type the number(s) of every printer that should go through the ERP (comma-separated, e.g. 1,3)."
Write-Host "Every print job sent to a picked printer will be HELD until it's confirmed in the ERP - don't pick a printer other people use for unrelated everyday printing."
$picked = Read-Host "Printer number(s)"
$selectedNames = @()
foreach ($token in ($picked -split ",")) {
    $n = $token.Trim()
    if ($n -match '^\d+$') {
        $idx = [int]$n - 1
        if ($idx -ge 0 -and $idx -lt $candidates.Count) { $selectedNames += $candidates[$idx].Name }
    }
}
$selectedNames = @($selectedNames | Select-Object -Unique)
if ($selectedNames.Count -eq 0) {
    Write-Host "No valid printer selected - nothing will be gated. You can re-run this installer any time to set it up."
} else {
    Write-Host "Selected: $($selectedNames -join ', ')"
}

# --- 3. Pause the selected printers ------------------------------------------
Write-Host ""
Write-Host "[3/5] Pausing the selected printer(s) so jobs hold for the ERP..."
foreach ($name in $selectedNames) {
    $wmiPrinter = Get-CimInstance Win32_Printer -Filter "Name='$($name -replace "'", "''")'" -ErrorAction SilentlyContinue
    if ($wmiPrinter) {
        try {
            Invoke-CimMethod -InputObject $wmiPrinter -MethodName Pause -ErrorAction Stop | Out-Null
            Write-Host "      Paused: $name"
        } catch {
            Write-Host "      Could not pause '$name': $($_.Exception.Message)"
        }
    }
}

# --- Save config --------------------------------------------------------------
@{ ErpUrl = $erpUrl; GatedPrinters = $selectedNames } | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8

# --- 4. Install the agent -----------------------------------------------------
Write-Host ""
Write-Host "[4/5] Installing the background agent..."
Copy-Item -Path $AgentSrc -Destination $AgentDst -Force
Write-Host "      Copied to $AgentDst"

# --- 5. Scheduled task ---------------------------------------------------------
Write-Host ""
Write-Host "[5/5] Setting the agent to start automatically at logon..."
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentDst`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings | Out-Null

# Stop any already-running copy before starting a fresh one.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*print-agent.ps1*" -or $_.CommandLine -like "*watch-print-bridge.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-ScheduledTask -TaskName $TaskName
Write-Host "      Agent is running now - no need to log off or restart."

Write-Host ""
Write-Host "======================================================="
Write-Host " Done!"
if ($selectedNames.Count -gt 0) {
    Write-Host " Print to any of these from CorelDRAW, Illustrator,"
    Write-Host " Photoshop, Word - anywhere - and the ERP's New Print"
    Write-Host " Job screen will open automatically:"
    $selectedNames | ForEach-Object { Write-Host "   - $_" }
} else {
    Write-Host " No printers are gated yet - re-run this installer"
    Write-Host " and pick at least one to finish setup."
}
Write-Host ""
Write-Host " One more step in the ERP itself: open Printers / Plotters"
Write-Host " and set each printer's 'Windows Printer Name' field to"
Write-Host " match exactly, so a job matches back to the right record."
Write-Host "======================================================="
Write-Host ""
Read-Host "Press Enter to close this window"
