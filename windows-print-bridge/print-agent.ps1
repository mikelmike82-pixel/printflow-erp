# Axe Printing ERP - Print Bridge Agent (v2)
#
# Replaces the old virtual-printer-and-watch-a-file approach entirely.
# This version gates the shop's REAL Windows printers directly:
#
#   1. On startup, makes sure every printer listed in config.json's
#      GatedPrinters is PAUSED (Win32_Printer.Pause()). A paused printer
#      still accepts jobs from any application - they just sit held in
#      the queue instead of printing immediately.
#   2. Polls each gated printer's queue (Get-PrintJob) for jobs it hasn't
#      seen yet. The instant one shows up, it opens the ERP's New Print
#      Job screen with that printer + job id in the URL, and forces the
#      browser window to the foreground (Windows blocks background
#      processes from stealing focus by default, which is why earlier
#      versions of this script could open the page "silently" behind
#      whatever app - e.g. CorelDRAW - was in front).
#   3. Runs a small local HTTP listener (127.0.0.1:8899) that the ERP
#      page calls when the operator clicks "Confirm & Print". A request
#      there is dropped as a small file in resume-requests\ rather than
#      acted on directly from the listener thread, and the same polling
#      loop below picks it up and calls Resume-PrintJob on exactly that
#      one job id - releasing it to actually print, using the printer's
#      own real driver (no PDF conversion, no re-rendering, full
#      fidelity).
#
# Nothing here reads or alters the actual print content - jobs are only
# ever paused, matched by id, and resumed.

$ErrorActionPreference = "SilentlyContinue"

$BridgeDir       = "C:\AxePrintBridge"
$ConfigFile      = Join-Path $BridgeDir "config.json"
$LogFile         = Join-Path $BridgeDir "agent.log"
$ResumeQueueDir  = Join-Path $BridgeDir "resume-requests"
$SeenJobsFile    = Join-Path $BridgeDir "seen-jobs.json"
$PendingJobsDir  = Join-Path $BridgeDir "pending-jobs"
$LastPollFile    = Join-Path $BridgeDir "last-poll.txt"
$AgentPort       = 8899
$PollSeconds     = 2
$TabWatchWindowSeconds = 5   # how fresh a poll has to be to count as "a tab is open and watching"

New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null
New-Item -ItemType Directory -Path $ResumeQueueDir -Force | Out-Null
New-Item -ItemType Directory -Path $PendingJobsDir -Force | Out-Null

function Write-Log {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
}

function Get-Config {
    if (Test-Path $ConfigFile) {
        try { return Get-Content $ConfigFile -Raw | ConvertFrom-Json } catch {
            Write-Log "Could not parse config.json: $_"
        }
    }
    return $null
}

function Get-ErpUrl {
    $cfg = Get-Config
    if ($cfg -and $cfg.ErpUrl) { return ([string]$cfg.ErpUrl).TrimEnd("/") }
    return "http://localhost:8000"
}

function Get-GatedPrinters {
    $cfg = Get-Config
    if ($cfg -and $cfg.GatedPrinters) { return @($cfg.GatedPrinters) }
    return @()
}

# --- Persisted "already notified" job tracking ------------------------------
# Without this, "have I already popped this job up?" only lived in this
# process's RAM. Every restart of the agent (a reboot, a re-run of
# Install.bat, Windows restarting the scheduled task) forgot everything it
# had seen — so any job still sitting held (nobody confirmed or discarded
# it in the ERP yet) looked brand new again and reopened the New Print Job
# popup for it, every single time. Saving the seen set to disk, and
# re-loading it at startup, is what makes "seen" mean "seen, ever" instead
# of "seen, this run."
function Load-SeenJobs {
    $result = @{}
    if (Test-Path $SeenJobsFile) {
        try {
            $keys = Get-Content $SeenJobsFile -Raw | ConvertFrom-Json
            foreach ($k in @($keys)) { if ($k) { $result[$k] = $true } }
        } catch { Write-Log "Could not parse seen-jobs.json: $_" }
    }
    return $result
}

function Save-SeenJobs {
    param($SeenJobs)
    try { @($SeenJobs.Keys) | ConvertTo-Json | Set-Content -Path $SeenJobsFile -Encoding UTF8 } catch {
        Write-Log "Could not save seen-jobs.json: $_"
    }
}

# --- Foreground-forcing -----------------------------------------------------
# Windows deliberately blocks a background process (like this one, started
# by a scheduled task with no window of its own) from stealing focus from
# whatever app the user is actively using (e.g. CorelDRAW). The standard,
# well-known workaround: a harmless synthetic Alt keypress resets that
# lock, then SetForegroundWindow works normally straight after.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AxeWin32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue

function Show-BrowserWindow {
    # Best-effort: find a likely browser window and force it to the front.
    # Tries a short list of common browser process names in turn - the
    # first one found running wins. Not foolproof with several browser
    # windows open at once, but solves the common single-window case.
    $names = @("chrome", "msedge", "firefox", "iexplore")
    foreach ($n in $names) {
        $proc = Get-Process -Name $n -ErrorAction SilentlyContinue |
                Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
                Select-Object -First 1
        if ($proc) {
            try { [System.Windows.Forms.SendKeys]::SendWait("%") } catch {}
            Start-Sleep -Milliseconds 150
            if ([AxeWin32]::IsIconic($proc.MainWindowHandle)) {
                [AxeWin32]::ShowWindowAsync($proc.MainWindowHandle, 9) | Out-Null   # SW_RESTORE
            }
            [AxeWin32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
            return $true
        }
    }
    return $false
}

function Get-LikelySourceApp {
    param([string]$DocumentName)
    if ($DocumentName -match "CorelDRAW|\.cdr\b")     { return "CorelDRAW" }
    if ($DocumentName -match "Illustrator|\.ai\b")     { return "Adobe Illustrator" }
    if ($DocumentName -match "Photoshop|\.psd\b")      { return "Adobe Photoshop" }
    if ($DocumentName -match "Word|\.docx?\b")         { return "Microsoft Word" }
    return "Other"
}

function Test-TabIsWatching {
    # True when an ERP tab has polled /pending-jobs recently (see the
    # listener's handler below) - in practice, an Operator's Print Counter
    # screen, which is the one this whole "walk-up printing" flow is
    # actually for. When one is open and watching, a newly-held job is
    # just dropped in $PendingJobsDir for it to pick up in place; a brand
    # new browser tab (Open-NewPrintJob, below) is only launched as a
    # fallback for when nothing is watching yet - the very first job of
    # the day, or a computer where only an Admin (who doesn't poll - see
    # main.js) is logged in.
    if (-not (Test-Path $LastPollFile)) { return $false }
    try {
        $lastPoll = [datetime]::Parse((Get-Content $LastPollFile -Raw))
        return ((Get-Date) - $lastPoll).TotalSeconds -le $TabWatchWindowSeconds
    } catch {
        return $false
    }
}

function Open-NewPrintJob {
    param([string]$PrinterName, [int]$JobId, [string]$DocumentName)
    $erpUrl = Get-ErpUrl
    $source = Get-LikelySourceApp -DocumentName $DocumentName
    $url = "$erpUrl/#/print-counter?new=1&source=$([uri]::EscapeDataString($source))" +
           "&realPrinter=$([uri]::EscapeDataString($PrinterName))&realJobId=$JobId"
    Write-Log "New held job #$JobId on '$PrinterName' (doc: '$DocumentName', guessed source: $source) -> $url"
    Start-Process $url
    Start-Sleep -Milliseconds 900
    $focused = Show-BrowserWindow
    if (-not $focused) { Write-Log "Could not locate a browser window to bring to the front (opened in background)." }
}

# --- Ensure gated printers are actually paused ------------------------------
function Sync-PausedPrinters {
    foreach ($name in (Get-GatedPrinters)) {
        $wmiPrinter = Get-CimInstance Win32_Printer -Filter "Name='$($name -replace "'", "''")'" -ErrorAction SilentlyContinue
        if (-not $wmiPrinter) { Write-Log "Gated printer '$name' not found on this system - check the spelling in config.json."; continue }
        # Pausing an already-paused printer is a harmless no-op, so we
        # just always (re)issue it rather than trying to detect the
        # current state first.
        try {
            Invoke-CimMethod -InputObject $wmiPrinter -MethodName Pause -ErrorAction Stop | Out-Null
        } catch {
            Write-Log "Could not pause '$name': $_"
        }
    }
}

# --- Local HTTP listener (runs in its own background job) ------------------
# Deliberately does the absolute minimum itself: accept the POST, validate
# it, drop it as a file, respond. The actual Resume-PrintJob call happens
# in the main loop below, not here - keeps this listener simple and avoids
# any cross-thread/runspace state sharing.
$listenerScript = {
    param($Port, $QueueDir, $LogFile, $ConfigFile, $PendingJobsDir, $LastPollFile)
    function Log($m) { try { Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  [listener] $m" -Encoding UTF8 } catch {} }
    # Runs as its own background job (a separate process), so it can't see
    # functions/variables from the main script - config has to be re-read
    # from disk here rather than shared in memory.
    # OneNote's virtual printer is deliberately not excluded here - see
    # install-axe-print-bridge.ps1's comment on $ExcludedNames. It's a
    # legitimate no-physical-printer testing stand-in, so "Detect from
    # This Computer" in the ERP should show it too, consistent with what
    # the installer offers.
    $ExcludedPrinterNames = @("Microsoft Print to PDF", "Microsoft XPS Document Writer", "Fax")
    function Get-GatedPrintersLocal {
        if (Test-Path $ConfigFile) {
            try {
                $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
                if ($cfg -and $cfg.GatedPrinters) { return @($cfg.GatedPrinters) }
            } catch {}
        }
        return @()
    }
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
    try { $listener.Start() } catch { Log "Failed to start listener on port $Port : $_"; return }
    Log "Listening on 127.0.0.1:$Port"
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 204
                $response.Close()
                continue
            }
            if ($request.Url.AbsolutePath -eq "/ping") {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("ok")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
                continue
            }
            if ($request.HttpMethod -eq "GET" -and $request.Url.AbsolutePath -eq "/printers") {
                # Real printer discovery for the ERP's "Detect from This
                # Computer" button - lists every printer this computer
                # actually has installed (skipping virtual ones nobody
                # would want to gate) so the operator doesn't have to type
                # each name in by hand and risk a typo that breaks matching.
                try {
                    $gated = @(Get-GatedPrintersLocal)
                    $printers = @(
                        Get-Printer -ErrorAction SilentlyContinue |
                        Where-Object { $ExcludedPrinterNames -notcontains $_.Name } |
                        Sort-Object Name |
                        ForEach-Object { @{ name = $_.Name; driverName = $_.DriverName; portName = $_.PortName; gated = ($gated -contains $_.Name) } }
                    )
                    # Deliberately NOT "ConvertTo-Json -InputObject $printers"
                    # on the whole array at once: whether that collapses a
                    # 0- or 1-item array into something other than a real
                    # JSON array isn't consistent to rely on (it differs by
                    # PowerShell version, and guessing wrong here silently
                    # sent the ERP a JSON array of ARRAYS instead of
                    # objects, which read back as printers with no name at
                    # all). Converting each item on its own and joining them
                    # by hand always produces a real "[...]" array, for 0,
                    # 1, or many printers, on any PowerShell version.
                    $itemsJson = @($printers | ForEach-Object { ConvertTo-Json -InputObject $_ -Depth 3 -Compress })
                    $json = "[" + ($itemsJson -join ",") + "]"
                    $response.ContentType = "application/json"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    Log "Failed to list printers: $_"
                    $response.StatusCode = 500
                }
                $response.Close()
                continue
            }
            if ($request.HttpMethod -eq "GET" -and $request.Url.AbsolutePath -eq "/pending-jobs") {
                # An already-open ERP tab (an Operator's Print Counter
                # screen, specifically - see main.js) calls this every
                # couple of seconds. Two jobs in one: it's a heartbeat that
                # tells the main loop "a tab is open and watching, so don't
                # bother launching a brand new one for the next held job" -
                # and it hands over the oldest job still waiting to be
                # shown, if any, so that tab can open it right where it is
                # instead of a new tab ever needing to appear at all.
                try {
                    Get-Date -Format "o" | Set-Content -Path $LastPollFile -Encoding UTF8
                    $pending = @(Get-ChildItem -Path $PendingJobsDir -Filter "*.json" -ErrorAction SilentlyContinue | Sort-Object CreationTime)
                    if ($pending.Count -gt 0) {
                        $oldest = $pending[0]
                        $job = $null
                        try { $job = Get-Content $oldest.FullName -Raw | ConvertFrom-Json } catch {}
                        Remove-Item $oldest.FullName -Force -ErrorAction SilentlyContinue
                        $json = if ($job) { ConvertTo-Json -InputObject $job -Depth 3 -Compress } else { "{}" }
                    } else {
                        $json = "{}"
                    }
                    $response.ContentType = "application/json"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    Log "Failed to serve pending job: $_"
                    $response.StatusCode = 500
                }
                $response.Close()
                continue
            }
            if ($request.HttpMethod -eq "POST" -and ($request.Url.AbsolutePath -eq "/resume-job" -or $request.Url.AbsolutePath -eq "/cancel-job")) {
                $action = if ($request.Url.AbsolutePath -eq "/cancel-job") { "cancel" } else { "resume" }
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                $reader.Close()
                try {
                    $data = $body | ConvertFrom-Json
                    $ticket = @{ action = $action; printer = $data.printer; jobId = $data.jobId; receivedAt = (Get-Date).ToString("o") }
                    $fileName = "$action-$([guid]::NewGuid().ToString('N')).json"
                    $ticket | ConvertTo-Json | Set-Content -Path (Join-Path $QueueDir $fileName) -Encoding UTF8
                    Log "Queued $action request for job $($data.jobId) on '$($data.printer)'"
                    $response.StatusCode = 200
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    Log "Bad $action-job request: $_"
                    $response.StatusCode = 400
                }
                $response.Close()
                continue
            }
            $response.StatusCode = 404
            $response.Close()
        } catch {
            Log "Listener loop error: $_"
        }
    }
}
# --- Clear a stale listener before starting our own --------------------------
# Start-Job runs the listener in its OWN child process, separate from this
# script's process. When a previous agent instance is killed forcibly
# (Stop-Process during a reinstall, a crashed session, Task Scheduler
# stopping it) that child process - and its grip on port 8899 - can be
# left running with nothing else pointing at it, since nothing that kills
# THIS script's process reaches it. The next agent then fails to bind the
# same port ("conflicts with an existing registration") and the ERP can
# never reach it until that orphan is found and killed by hand. Doing that
# automatically here, every time, before starting our own listener, makes
# a restart self-healing instead of a manual troubleshooting step.
try {
    $stalePort = Get-NetTCPConnection -LocalPort $AgentPort -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $stalePort) {
        if ($conn.OwningProcess -and $conn.OwningProcess -ne $PID) {
            Write-Log "Port $AgentPort was already held by process $($conn.OwningProcess) - stopping it before starting our own listener."
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
    if ($stalePort) { Start-Sleep -Milliseconds 500 }
} catch {
    Write-Log "Could not check/clear port $AgentPort before starting listener: $_"
}

Start-Job -ScriptBlock $listenerScript -ArgumentList $AgentPort, $ResumeQueueDir, $LogFile, $ConfigFile, $PendingJobsDir, $LastPollFile -Name "AxePrintBridgeListener" | Out-Null
Write-Log "Agent started. Gated printers: $((Get-GatedPrinters) -join ', ')"

# --- Main loop: pause-sync, poll for new jobs, process resume requests -----
# $seenJobs persists to disk (see Load-/Save-SeenJobs above) - starting a
# new agent process picks up where the last one left off instead of
# forgetting every job it already showed a popup for.
$seenJobs = Load-SeenJobs   # key: "<printer>|<jobId>" -> $true
Write-Log "Loaded $($seenJobs.Count) previously-seen job key(s) from disk."

while ($true) {
    Sync-PausedPrinters

    $seenJobsChanged = $false
    $liveKeys = @{}   # every "<printer>|<jobId>" that actually exists right now, across all gated printers

    foreach ($name in (Get-GatedPrinters)) {
        $jobs = Get-PrintJob -PrinterName $name -ErrorAction SilentlyContinue
        foreach ($job in $jobs) {
            $key = "$name|$($job.Id)"
            $liveKeys[$key] = $true
            if (-not $seenJobs.ContainsKey($key)) {
                $seenJobs[$key] = $true
                $seenJobsChanged = $true

                # Always queue it - a tab that starts watching moments
                # from now (rather than right now) still picks it up on
                # its next poll, a couple of seconds later at worst.
                $pendingTicket = @{
                    printer = $name; jobId = $job.Id; documentName = $job.DocumentName
                    source = (Get-LikelySourceApp -DocumentName $job.DocumentName)
                }
                $pendingFile = Join-Path $PendingJobsDir "job-$([guid]::NewGuid().ToString('N')).json"
                $pendingTicket | ConvertTo-Json | Set-Content -Path $pendingFile -Encoding UTF8

                if (Test-TabIsWatching) {
                    Write-Log "New held job #$($job.Id) on '$name' queued for the open ERP tab - no new tab needed."
                } else {
                    Open-NewPrintJob -PrinterName $name -JobId $job.Id -DocumentName $job.DocumentName
                }
            }
        }
    }

    # Forget any previously-seen job that's no longer actually in a gated
    # queue (it was released, discarded, or cleared by hand in Windows) -
    # keeps seen-jobs.json from growing forever and lets a reused job id
    # be treated as new again.
    foreach ($key in @($seenJobs.Keys)) {
        if (-not $liveKeys.ContainsKey($key)) {
            $seenJobs.Remove($key)
            $seenJobsChanged = $true
        }
    }
    if ($seenJobsChanged) { Save-SeenJobs -SeenJobs $seenJobs }

    # Process any resume/cancel requests the listener has queued.
    Get-ChildItem -Path $ResumeQueueDir -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
        $ticket = $null
        try { $ticket = Get-Content $_.FullName -Raw | ConvertFrom-Json } catch {}
        if ($ticket) {
            $action = if ($ticket.action) { $ticket.action } else { "resume" }
            try {
                if ($action -eq "cancel") {
                    Remove-PrintJob -PrinterName $ticket.printer -ID ([int]$ticket.jobId) -ErrorAction Stop
                    Write-Log "Discarded (removed) job $($ticket.jobId) on '$($ticket.printer)' - will not print."
                } else {
                    Resume-PrintJob -PrinterName $ticket.printer -ID ([int]$ticket.jobId) -ErrorAction Stop
                    Write-Log "Resumed job $($ticket.jobId) on '$($ticket.printer)' - should print now."
                }
            } catch {
                Write-Log "Failed to $action job $($ticket.jobId) on '$($ticket.printer)': $_"
            }
        }
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds $PollSeconds
}
