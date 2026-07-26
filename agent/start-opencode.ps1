# agent/start-opencode.ps1 -- the OpenCode Remote Control agent engine.
# Loads .env.opencode, starts opencode + cloudflared, registers the session with
# the platform, maintains a resilient control WSS (presence + acks), and prints
# the public URL. Foreground is the opencode TUI; the WSS + cloudflared run in
# the background and are cleaned up on exit.
#
# Authenticates to Cloudflare Access with a service token (CF-Access-Client-Id /
# CF-Access-Client-Secret) so the machine can reach /register and the WSS behind
# Access. Browser users authenticate via email OTP separately.
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
# Sends the Access service-token headers on the upgrade so Access admits the machine.
function Start-ControlWss {
    param([string]$WssUrl, [string]$AccessClientId, [string]$AccessClientSecret)
    return Start-Job -ScriptBlock {
        param($url, $clientId, $clientSecret)
        Add-Type -AssemblyName System.Net.WebSockets | Out-Null
        $backoff = 2
        while ($true) {
            $ws = $null
            try {
                $ws = New-Object System.Net.WebSockets.ClientWebSocket
                if ($clientId) {
                    $ws.Options.SetRequestHeader("CF-Access-Client-Id", $clientId)
                    $ws.Options.SetRequestHeader("CF-Access-Client-Secret", $clientSecret)
                }
                $cts = New-Object System.Threading.CancellationTokenSource
                $cts.CancelAfter([TimeSpan]::FromSeconds(20))
                $ws.ConnectAsync($url, $cts.Token).Wait()
                if ($ws.State -ne 'Open') { throw "WebSocket not open after ConnectAsync" }
                $backoff = 2
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
    } -ArgumentList $WssUrl, $AccessClientId, $AccessClientSecret
}

# R7: write the tunnel token to an ACL-restricted config file (user-only) and run
# cloudflared with --config, keeping the secret off the visible process command line.
function Start-Cloudflared {
    param([string]$Token, [string]$CfErrPath)
    $cfgDir = Join-Path $env:LOCALAPPDATA "opencode-remote"
    New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null
    $cfgPath = Join-Path $cfgDir ("tunnel-{0}.yml" -f ([guid]::NewGuid().ToString('n')))
    "token: $Token" | Set-Content -Path $cfgPath -Encoding UTF8
    try {
        $acl = Get-Acl $cfgPath
        $acl.SetAccessRuleProtection($true, $false)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($env:USERNAME, 'FullControl', 'None')
        $acl.AddAccessRule($rule)
        Set-Acl -Path $cfgPath -AclObject $acl -ErrorAction SilentlyContinue
    } catch { /* best-effort hardening */ }
    $p = Start-Process -FilePath "cloudflared" `
        -ArgumentList @("tunnel", "--no-autoupdate", "--config", $cfgPath, "run") `
        -NoNewWindow -PassThru -RedirectStandardOutput "cf.log" -RedirectStandardError $CfErrPath
    return @{ Process = $p; ConfigPath = $cfgPath }
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

$platformUrl       = $env:OPENCODE_REMOTE_URL       # e.g. https://opencode.beneverk.com
$tunnelToken       = $env:OPENCODE_TUNNEL_TOKEN
$tunnelUrl         = $env:OPENCODE_TUNNEL_URL       # e.g. https://desktop-tunnel.beneverk.com
$sessionPwd        = $env:OPENCODE_SESSION_PASSWORD
$accessClientId    = $env:OPENCODE_ACCESS_CLIENT_ID      # Cloudflare Access service token (machine auth)
$accessClientSecret = $env:OPENCODE_ACCESS_CLIENT_SECRET

if (-not $platformUrl) { throw "OPENCODE_REMOTE_URL not set (in .env.opencode or env)." }
if (-not $tunnelToken) { throw "OPENCODE_TUNNEL_TOKEN not set (in .env.opencode or env)." }
if (-not $accessClientId -or -not $accessClientSecret) {
    Write-Warning "OPENCODE_ACCESS_CLIENT_ID / OPENCODE_ACCESS_CLIENT_SECRET not set -- Access will block registration and the control WSS."
}

# Headers the agent sends on every platform request so Access admits it.
$accessHeaders = @{}
if ($accessClientId -and $accessClientSecret) {
    $accessHeaders["CF-Access-Client-Id"] = $accessClientId
    $accessHeaders["CF-Access-Client-Secret"] = $accessClientSecret
}

# --- 2. Pick port ---
if ($Port -le 0) {
    if ($env:OPENCODE_PORT -and $env:OPENCODE_PORT -ne '0') {
        $Port = [int]$env:OPENCODE_PORT
    } else {
        $Port = 49152
        while (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $Port++ }
        Write-Host "Auto-picked port: $Port"
    }
}

# --- 3. Start cloudflared tunnel (background, token via config file) ---
Write-Host "Starting cloudflared tunnel..."
$cfErr = Join-Path (Get-Location).Path "cf.err"
$cfInfo = Start-Cloudflared -Token $tunnelToken -CfErrPath $cfErr
$cf = $cfInfo.Process
Start-Sleep -Seconds 3

if ($cf.HasExited) {
    $detail = if (Test-Path $cfErr) { (Get-Content $cfErr -Raw -ErrorAction SilentlyContinue) } else { "(no stderr)" }
    if ($cfInfo.ConfigPath -and (Test-Path $cfInfo.ConfigPath)) { Remove-Item $cfInfo.ConfigPath -Force -ErrorAction SilentlyContinue }
    throw "cloudflared exited immediately (code $($cf.ExitCode)). stderr: $detail"
}

$backend = if ($tunnelUrl) { $tunnelUrl } else { "http://localhost:$Port" }

# --- 4. Determine session info ---
$projPath = (Get-Location).Path
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

# --- 5. Register + control WSS ---
$controlJob = $null
if (-not $sid) {
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
            -Headers $accessHeaders `
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

    $encB64 = [uri]::EscapeDataString($projB64)
    $encSid = [uri]::EscapeDataString($sid)
    $wssUrl = $platformUrl.Replace('https://', 'wss://').Replace('http://', 'ws://') + "/$encB64/session/$encSid`?role=machine"
    $controlJob = Start-ControlWss -WssUrl $wssUrl -AccessClientId $accessClientId -AccessClientSecret $accessClientSecret
    Write-Host "Control WSS connected: $wssUrl"

    Write-Host ""
    Write-Host "Web URL: $platformUrl/$projB64/session/$sid"
    Write-Host ""
}

# --- 6. Start opencode TUI (foreground -- blocks until exit) ---
$resumeArgs = @()
if ($Continue) { $resumeArgs += '--continue' }
if ($Session)  { $resumeArgs += @('--session', $Session) }
$cliArgs = @('--hostname', '127.0.0.1', '--port', $Port) + $resumeArgs + $RemainingArgs

Write-Host "Starting opencode..."
try {
    & opencode @cliArgs
} finally {
    if ($controlJob) { Stop-Job -Job $controlJob -ErrorAction SilentlyContinue; Remove-Job -Job $controlJob -Force -ErrorAction SilentlyContinue }
    if ($cf -and -not $cf.HasExited) { Stop-Process -Id $cf.Id -Force -ErrorAction SilentlyContinue }
    if ($cfInfo.ConfigPath -and (Test-Path $cfInfo.ConfigPath)) { Remove-Item $cfInfo.ConfigPath -Force -ErrorAction SilentlyContinue }
    Write-Host "Agent stopped."
}
