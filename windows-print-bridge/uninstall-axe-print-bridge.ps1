# Axe Printing ERP - Print Bridge Uninstaller (v2)
#
# Removes the scheduled task and stops the agent, resumes (un-pauses) any
# printers config.json says were gated, and cleans up the older v1 virtual
# printer if it's still around. Leaves C:\AxePrintBridge itself (config.json
# and agent.log) in place in case you want to look at the log or reinstall
# later - delete that folder by hand afterwards if you don't want it.

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
$OldTaskName    = "AxePrintBridgeWatcher"
$OldPrinterName = "Axe Printing ERP"
$OldPortFile    = Join-Path $BridgeDir "incoming.prn"

Write-Host "Removing the Print Bridge..."

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $OldTaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "[1/4] Scheduled task removed."

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*print-agent.ps1*" -or $_.CommandLine -like "*watch-print-bridge.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "[2/4] Agent stopped."

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
Write-Host "[3/4] Resumed printer(s): $(if ($resumed.Count -gt 0) { $resumed -join ', ' } else { 'none' })"

if (Get-Printer -Name $OldPrinterName -ErrorAction SilentlyContinue) {
    Remove-Printer -Name $OldPrinterName -ErrorAction SilentlyContinue
}
if (Get-PrinterPort -Name $OldPortFile -ErrorAction SilentlyContinue) {
    Remove-PrinterPort -Name $OldPortFile -ErrorAction SilentlyContinue
}
Write-Host "[4/4] Cleaned up the old v1 virtual printer (if it was there)."

Write-Host ""
Write-Host "Done. ($BridgeDir was left in place - delete it by hand if you don't need the logs.)"
Write-Host ""
Read-Host "Press Enter to close this window"
