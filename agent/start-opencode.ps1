# agent/start-opencode.ps1 -- the OpenCode Remote Control agent engine.
# Loads .env.opencode, starts opencode + cloudflared, registers the session with
# the platform, maintains a resilient control WSS (presence + acks), and prints
# the public URL. Foreground is the opencode TUI; the WSS + cloudflared run in
# the background and are cleaned up on exit.
#
# Usage (via the thin wrapper opencode-remote.ps1):
#   .\opencode-remote.ps1 [-c] [-s <session-id>] [--port <n>] [extra opencode args]

param(
    [int]$Port = 0,
    [switch]$Continue,
    [string]$Session = '',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

# --- Helpers (defined before use; PowerShell does not hoist functions) ---

# Control WSS loop: connect, ping every 30s, reconnect with exponential backoff.
# Runs as a background job so the opencode TUI can run in the foreground.
function Start-ControlWss {
    param([string]$WssUrl)
    return Start-Job -ScriptBlock {
        param($url)
        Add-Type -AssemblyName System.Net.WebSockets | Out-Null
        $backoff = 2
        while ($true) {
            $ws = $null
            try {
                $ws = New-Object System.Net.WebSockets.ClientWebSocket
                $cts = New-Object System.Threading.CancellationTokenSource
                $cts.CancelAfter([TimeSpan]::FromSeconds(20))
                $ws.ConnectAsync($url, $cts.Token).Wait()
                if ($ws.State -ne 'Open') { throw "WebSocket not open after ConnectAsync" }
                $backoff = 2  # connected; reset backoff
                while ($ws.State -eq 'Open') {
                    $ping = [Text.Encoding]::UTF8.GetBytes("ping")
                    $sendCts = New-Object System.Threading.CancellationTokenSource
                    $sendCts.CancelAfter([TimeSpan]::FromSeconds(10))
                    $ws.SendAsync($ping, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $sendCts.Token).Wait()
                    Start-Sleep -Seconds 30
                }
            } catch {
                # drop or failure -- retry below
            } finally {
                if ($ws) { $ws.Dispose() }
            }
            Start-Sleep -Seconds $backoff
            $backoff = [Math]::Min($backoff * 2, 60)
        }
    } -ArgumentList $WssUrl
}

# --- 1. Load .env.opencode ---
$envFile = Join-Path (Get-Location).Path ".env.opencode"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { return }
        $name = $matches[1]; $val = $matches[2].Trim().Trim('"').Trim("'")
        if ($val) { Set-Item "Env:$name" $val }
    }
    Write-Host "Loaded .env.opencode"
} else {
    Write-Warning ".env.opencode not found in current directory -- platform/tunnel env vars must already be set."
}

$platformUrl = $env:OPENCODE_REMOTE_URL   # e.g. https://opencode.beneverk.com
$tunnelToken = $env:OPENCODE_TUNNEL_TOKEN
$tunnelUrl   = $env:OPENCODE_TUNNEL_URL   # e.g. https://desktop-tunnel.beneverk.com
$sessionPwd  = $env:OPENCODE_SESSION_PASSWORD

if (-not $platformUrl) { throw "OPENCODE_REMOTE_URL not set (in .env.opencode or env)." }
if (-not $tunnelToken) { throw "OPENCODE_TUNNEL_TOKEN not set (in .env.opencode or env)." }

# --- 2. Pick port ---
if ($Port -le 0) {
    if ($env:OPENCODE_PORT -and $env:OPENCODE_PORT -ne '0') {
        $Port = [int]$env:OPENCODE_PORT
    } else {
        # Auto-pick a free port in the dynamic range.
        $Port = 49152
        while (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $Port++ }
        Write-Host "Auto-picked port: $Port"
    }
}

# --- 3. Start cloudflared tunnel (background) ---
Write-Host "Starting cloudflared tunnel..."
$cf = Start-Process -FilePath "cloudflared" `
    -ArgumentList @("tunnel", "--no-autoupdate", "run", "--token", $tunnelToken) `
    -NoNewWindow -PassThru -RedirectStandardOutput "cf.log" -RedirectStandardError "cf.err"
Start-Sleep -Seconds 3  # let cloudflared connect

# The backend URL the Worker/DO proxies to: the tunnel's public hostname
# (configured in CF dashboard to route to http://localhost:$Port), or localhost
# when running everything on one machine for dev.
$backend = if ($tunnelUrl) { $tunnelUrl } else { "http://localhost:$Port" }

# --- 4. Determine session info ---
$projPath = (Get-Location).Path
# URL-safe base64 of the project path (the /<seg>/session/<id> URL segment).
$projB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($projPath)).Replace('+', '-').Replace('/', '_').TrimEnd('=')
$machine = $env:COMPUTERNAME
if ($Session) {
    $sid = $Session
} elseif ($Continue) {
    $sid = $null
    try {
        $sj = ((opencode session list -n 1 --format json 2>$null) -join "`n" | ConvertFrom-Json)
        if ($sj) { $sid = @($sj)[0].id }
    } catch { $sid = $null }
} else {
    $sid = $null
}

# --- 5. Register with the platform (Worker -> DO) ---
$controlJob = $null
if (-not $sid) {
    # No session id yet -- opencode will create one on start. Use -c (continue) or
    # -s <id> to register an existing session; new sessions register on next launch.
    Write-Warning "No sessionId resolved (use -c or -s <id>). Skipping register; dashboard won't list this session until registered."
} else {
    $regBody = @{
        sessionId = $sid
        machine   = $machine
        backend   = $backend
        project   = $projPath
        title     = (Split-Path $projPath -Leaf)
    }
    if ($sessionPwd) { $regBody.password = $sessionPwd }

    Write-Host "Registering session with platform..."
    try {
        $regResp = Invoke-WebRequest -Uri "$platformUrl/register" -Method POST `
            -Body ($regBody | ConvertTo-Json) -ContentType "application/json" `
            -UseBasicParsing -TimeoutSec 10
        $regJson = $regResp.Content | ConvertFrom-Json
        if ($regJson.ack -eq "registered") {
            Write-Host "Registered. Session: $($regJson.sessionId)"
        } else {
            Write-Warning "Registration response: $($regResp.Content)"
        }
    } catch {
        Write-Warning "Registration failed: $($_.Exception.Message)"
    }

    # --- 6. Control WSS (presence + acks) ---
    $wssUrl = $platformUrl.Replace('https://', 'wss://').Replace('http://', 'ws://') + "/$projB64/session/$sid`?role=machine"
    $controlJob = Start-ControlWss -WssUrl $wssUrl
    Write-Host "Control WSS connected: $wssUrl"

    # --- 7. Print the public URL ---
    Write-Host ""
    Write-Host "Web URL: $platformUrl/$projB64/session/$sid"
    Write-Host ""
}

# --- 8. Start opencode TUI (foreground -- blocks until exit) ---
$resumeArgs = @()
if ($Continue) { $resumeArgs += '--continue' }
if ($Session)  { $resumeArgs += @('--session', $Session) }
$cliArgs = @('--hostname', '127.0.0.1', '--port', $Port) + $resumeArgs + $RemainingArgs

Write-Host "Starting opencode..."
try {
    & opencode @cliArgs
} finally {
    # --- 9. Cleanup: stop control WSS + cloudflared ---
    if ($controlJob) { Stop-Job -Job $controlJob -ErrorAction SilentlyContinue; Remove-Job -Job $controlJob -Force -ErrorAction SilentlyContinue }
    if ($cf -and -not $cf.HasExited) { Stop-Process -Id $cf.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "Agent stopped."
}
