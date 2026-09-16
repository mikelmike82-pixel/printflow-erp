# Axe Printing ERP - Print Bridge Watcher
#
# Runs quietly in the background (started by the "AxePrintBridgeWatcher"
# scheduled task at logon). It watches the local port file that the
# "Axe Printing ERP" Windows printer writes to every time ANY application
# (CorelDRAW, Adobe Illustrator, Adobe Photoshop, Word, etc.) prints to it,
# and the moment that happens it opens the ERP's New Print Job screen in
# the default browser so the operator can pick the customer, confirm the
# material, and take payment right away.
#
# This does NOT read or use the actual print data (the PostScript/PCL
# bytes written to the port file) - it only reacts to the file being
# touched. Nothing about the design/document content is inspected or sent
# anywhere.

$ErrorActionPreference = "SilentlyContinue"

$BridgeDir    = "C:\AxePrintBridge"
$PortFileName = "incoming.prn"
$PortFile     = Join-Path $BridgeDir $PortFileName
$ConfigFile   = Join-Path $BridgeDir "config.json"
$LogFile      = Join-Path $BridgeDir "watcher.log"
$PrinterName  = "Axe Printing ERP"
$DebounceSeconds = 3

function Write-Log {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
}

function Get-ErpUrl {
    if (Test-Path $ConfigFile) {
        try {
            $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            if ($cfg.ErpUrl) { return ([string]$cfg.ErpUrl).TrimEnd("/") }
        } catch {
            Write-Log "Could not read config.json, falling back to default URL. $_"
        }
    }
    return "http://localhost:8000"
}

function Get-LikelySourceApp {
    # Best-effort only. The Windows print spooler exposes a "document
    # name" for each job, which for many apps includes (or is) the source
    # file/app name (e.g. "MyBanner.cdr - CorelDRAW"). This is a
    # convenience guess to pre-fill the New Print Job form's Source
    # Application field - it is never assumed to be certain, and the
    # operator can always change it by hand in the wizard if it's wrong
    # or the guess falls back to "Other".
    try {
        $job = Get-PrintJob -PrinterName $PrinterName -ErrorAction Stop |
               Sort-Object -Property SubmittedTime -Descending |
               Select-Object -First 1
        $doc = [string]$job.DocumentName
        if ($doc -match "CorelDRAW|\.cdr\b")           { return "CorelDRAW" }
        if ($doc -match "Illustrator|\.ai\b")           { return "Adobe Illustrator" }
        if ($doc -match "Photoshop|\.psd\b")            { return "Adobe Photoshop" }
    } catch {
        # Get-PrintJob can fail if the job already cleared the queue by
        # the time we look, or the PrintManagement module isn't present.
        # That's fine - we just fall back below.
    }
    return "Other"
}

function Open-NewPrintJob {
    $erpUrl = Get-ErpUrl
    $source = Get-LikelySourceApp
    $url = "$erpUrl/#/print-counter?new=1&source=$([uri]::EscapeDataString($source))"
    Write-Log "Print job detected on '$PrinterName' (guessed source: $source) -> opening $url"
    Start-Process $url
}

# Make sure the folder + an (empty, harmless) port file exist so the
# FileSystemWatcher has something to attach to even before the very first
# print job ever arrives.
New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null

Write-Log "Watcher started. Watching '$PortFile' for print jobs."

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $BridgeDir
$watcher.Filter = $PortFileName
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor `
                         [System.IO.NotifyFilters]::Size -bor `
                         [System.IO.NotifyFilters]::FileName
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

$lastTrigger = Get-Date "2000-01-01"

# A simple blocking wait-loop - deliberately not event/Register-ObjectEvent
# based, so this script can just be left running under the scheduled task
# with nothing else to wire up or clean up.
while ($true) {
    $result = $watcher.WaitForChanged(
        [System.IO.WatcherChangeTypes]::Changed -bor [System.IO.WatcherChangeTypes]::Created,
        5000
    )
    if ($result.TimedOut) { continue }

    $now = Get-Date
    if (($now - $lastTrigger).TotalSeconds -lt $DebounceSeconds) {
        # The spooler can touch the port file more than once per job;
        # collapse anything within a few seconds into a single trigger.
        continue
    }
    $lastTrigger = $now

    # Give the spooler a moment to finish writing before we react.
    Start-Sleep -Milliseconds 500
    Open-NewPrintJob
}
