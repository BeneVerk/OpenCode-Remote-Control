# agent/opencode-remote.ps1 -- thin per-project launcher.
# Parses flags and delegates to start-opencode.ps1 (the engine).
#
# Usage:
#   .\opencode-remote.ps1 [-c] [-s <session-id>] [--port <n>] [extra opencode args]
param()
$all = @($args)
$Port = 0; $Continue = $false; $Session = ''; $pass = @()
$i = 0
while ($i -lt $all.Count) {
    $tok = [string]$all[$i]
    switch -Regex ($tok.ToLower()) {
        '^(-c|--?continue)$' { $Continue = $true; $i++ }
        '^(-s|--?session)$'  { if ($i + 1 -lt $all.Count) { $Session = $all[$i + 1]; $i += 2 } else { $i++ } }
        '^--?port$'          { if ($i + 1 -lt $all.Count) { $Port = [int]$all[$i + 1]; $i += 2 } else { $i++ } }
        default              { $pass += $tok; $i++ }
    }
}
& "$PSScriptRoot\start-opencode.ps1" -Port $Port -Continue:$Continue -Session $Session -RemainingArgs $pass
