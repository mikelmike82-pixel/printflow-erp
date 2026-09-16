# Axe Printing ERP - Print Bridge Uninstaller (v2)
#
# Removes both scheduled tasks (the print-agent and the ERP's own local
# server) and stops both processes, resumes (un-pauses) any printers
# config.json says were gated, removes the Desktop shortcut, and cleans up
# the older v1 virtual printer if it's still around. Leaves C:\AxePrintBridge
# itself (config.json and agent.log) in place in case you want to look at
# the log or reinstall later - delete that folder by hand afterwards if you
# don't want it.

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "Administrator access is needed to resume printers - requesting it now..."
    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
        -Verb RunAs
    exit
}

$BridgeDir      = "C:\AxePrintBridge"
$ConfigFile     = Join-Path $BridgeDir "config.json"
$TaskName       = "AxePrintBridgeAgent"
$ServerTaskName = "AxeErpLocalServer"
$OldTaskName    = "AxePrintBridgeWatcher"
$OldPrinterName = "Axe Printing ERP"
$OldPortFile    = Join-Path $BridgeDir "incoming.prn"

Write-Host "Removing the Print Bridge..."

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $ServerTaskName -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $OldTaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "[1/5] Scheduled tasks removed."

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*print-agent.ps1*" -or $_.CommandLine -like "*watch-print-bridge.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*serve.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "[2/5] Agent and local server stopped."

$resumed = @()
if (Test-Path $ConfigFile) {
    try {
        $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        foreach ($name in @($cfg.GatedPrinters)) {
            $wmiPrinter = Get-CimInstance Win32_Printer -Filter "Name='$($name -replace "'", "''")'" -ErrorAction SilentlyContinue
            if ($wmiPrinter) {
                Invoke-CimMethod -InputObject $wmiPrinter -MethodName Resume -ErrorAction SilentlyContinue | Out-Null
                $resumed += $name
            }
        }
    } catch {}
}
Write-Host "[3/5] Resumed printer(s): $(if ($resumed.Count -gt 0) { $resumed -join ', ' } else { 'none' })"

if (Get-Printer -Name $OldPrinterName -ErrorAction SilentlyContinue) {
    Remove-Printer -Name $OldPrinterName -ErrorAction SilentlyContinue
}
if (Get-PrinterPort -Name $OldPortFile -ErrorAction SilentlyContinue) {
    Remove-PrinterPort -Name $OldPortFile -ErrorAction SilentlyContinue
}
Write-Host "[4/5] Cleaned up the old v1 virtual printer (if it was there)."

try {
    $shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Axe Printing ERP.url"
    if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue }
} catch {}
Write-Host "[5/5] Removed the Desktop shortcut (if it was there)."

Write-Host ""
Write-Host "Done. ($BridgeDir was left in place - delete it by hand if you don't need the logs.)"
Write-Host ""
Read-Host "Press Enter to close this window"
