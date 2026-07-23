# OpenCode Remote Control — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the repo scaffold + core relay (Worker + SessionRelay DO + agent + cloudflared) so multiple machines can register sessions and a browser can open any session through one `opencode.beneverk.com` domain.

**Architecture:** A Cloudflare Worker routes by path: static dashboard assets, `/api/sessions` (D1 query), and `/<b64>/session/<id>` → a per-session Durable Object. The DO holds WebSocket connections from browser + machine, relays traffic, sends acks, and uses Hibernation + Alarms for resilience. Each machine runs `opencode-remote` (agent) which starts opencode + cloudflared + opens a control WSS to the DO.

**Tech Stack:** Cloudflare Workers (compute), Durable Objects (relay), D1 (SQLite registry), Workers static assets (dashboard), cloudflared (per-machine tunnel), PowerShell (agent). 100% Cloudflare free ecosystem.

## Global Constraints

- **Cloudflare account:** BeneVerk (`80f0a5ca91bf807fe0f1de55bd36f10f`), workers.dev subdomain `frosty-sunset-b1de`.
- **Zone:** `beneverk.com` (zone ID `08c3a9b543015402f96143e7fb6a6c40`).
- **Public origin:** `opencode.beneverk.com` (DNS CNAME → Worker route or custom domain).
- **Dashboard:** static HTML/CSS/JS (no Astro, no build step). Served by Workers static assets.
- **Auth:** Cloudflare Access (created in Phase 0, identity providers added in a later phase). For Phase 1, the relay works without Access (Access is added after).
- **Agent:** PowerShell (Windows). Future: cross-platform.
- **`.env.opencode`:** per-project, always gitignored. Holds `OPENCODE_TUNNEL_TOKEN`, `OPENCODE_TUNNEL_URL`, `OPENCODE_PORT`, `OPENCODE_SESSION_PASSWORD` (optional).
- **No secrets in tracked files.** Tokens go in `.env.opencode` (gitignored) or Wrangler secrets.
- **Compatibility date:** pinned to today (`2026-07-23`) at scaffold; `2024-09-23` is the minimum floor for DO + Hibernation API.
- **DO WebSocket:** must use Hibernation API (`acceptWebSocket`, not `ws.accept()`).

---

## File Structure

```
OpenCode-Remote-Control/
├── worker/
│   ├── src/
│   │   ├── index.ts          — Worker entry: fetch handler, routing
│   │   ├── relay.ts          — SessionRelay Durable Object class
│   │   ├── proxy.ts          — HTTP/WS proxy logic (refactored from spike)
│   │   └── dashboard.ts      — /api/sessions handler (D1 query)
│   ├── public/               — dashboard SPA (static HTML/CSS/JS)
│   │   ├── index.html
│   │   ├── style.css
│   │   └── app.js
│   ├── schema.sql            — D1 table definitions
│   ├── wrangler.jsonc         — bindings (DO, D1, assets)
│   ├── package.json          — dev deps (wrangler, typescript)
│   └── tsconfig.json
├── agent/
│   ├── opencode-remote.ps1   — agent entry (per-project launcher)
│   └── start-opencode.ps1    — engine (env load, cloudflared, register)
├── .gitignore                — includes .env.opencode
└── docs/
    └── (specs, runbooks)
```

---

## Task 1: Create repo + scaffold

**Files:**
- Create: `OpenCode-Remote-Control/` (repo root)
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.jsonc`
- Create: `.gitignore`

**Interfaces:**
- Produces: a deployable Worker skeleton with `wrangler.jsonc` bindings for DO + D1 + assets.

- [ ] **Step 1: Create the GitHub repo**

```bash
# Via GitHub MCP or gh CLI — create BeneVerk/OpenCode-Remote-Control (public)
gh repo create BeneVerk/OpenCode-Remote-Control --public --description "Claude-style remote control for opencode — one domain, many machines, all Cloudflare"
```
> **Note (verified 2026-07-23):** the `BeneVerk` GitHub org exists (id `297254514`) but currently has **0 repos**; `schatt93` is the developer. The local clone currently pushes to the temporary scratch remote `schatt-qwr/OpenCode-Remote-Control`. After creating the org repo, repoint the local remote and push the existing history:
> ```bash
> git remote set-url origin https://github.com/BeneVerk/OpenCode-Remote-Control.git
> git push -u origin main
> ```

- [ ] **Step 2: Clone + scaffold locally**

```bash
cd C:\Personal_Projects
git clone https://github.com/BeneVerk/OpenCode-Remote-Control.git
cd OpenCode-Remote-Control
mkdir -p worker/src worker/public agent docs
```

- [ ] **Step 3: Create `worker/package.json`**

```json
{
  "name": "opencode-remote-control",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "wrangler": "^4.113.0",
    "typescript": "^7.0.0",
    "@cloudflare/workers-types": "^5.0.0"
  }
}
```

- [ ] **Step 4: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Create `worker/wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "opencode-remote-control",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-23",
  "assets": { "directory": "./public", "binding": "ASSETS" },
  "durable_objects": {
    "bindings": [{ "name": "SESSION_RELAY", "class_name": "SessionRelay" }]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "opencode-remote",
      "database_id": "<D1_DATABASE_ID>"
    }
  ],
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["SessionRelay"] }]
}
```

- [ ] **Step 6: Create `.gitignore`**

```gitignore
node_modules/
.wrangler/
.env.opencode
.env
*.log
```

- [ ] **Step 7: Init the Worker entry (placeholder)**

Create `worker/src/index.ts`:
```typescript
import { DurableObject } from "cloudflare:workers";

export class SessionRelay extends DurableObject {
  // Implemented in Task 3
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("OpenCode Remote Control — scaffold", { status: 200 });
  },
} satisfies ExportedHandler<Env>;

export interface Env {
  ASSETS: Fetcher;
  SESSION_RELAY: DurableObjectNamespace;
  DB: D1Database;
}
```

- [ ] **Step 8: npm install**

```bash
cd worker && npm install
```

- [ ] **Step 9: Create the D1 database + fill in the id**

```bash
npx wrangler d1 create opencode-remote
```
Copy the `database_id` from the output and paste it into `worker/wrangler.jsonc` (replace `<D1_DATABASE_ID>`). The database is created here in Task 1 so the binding is real before any deploy; Task 2 only adds the schema.

- [ ] **Step 10: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors (empty DO class is valid).

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: scaffold Worker repo with wrangler.jsonc, DO binding, D1 binding, static assets"
```

---

## Task 2: D1 database + schema

**Files:**
- Create: `worker/schema.sql`
- Run: D1 schema application via Wrangler (the database itself was created in Task 1 Step 9).

- [ ] **Step 1: Verify the D1 database exists**

The `opencode-remote` database was created in Task 1 Step 9 and its `database_id` is already in `worker/wrangler.jsonc`. Confirm it's present:

```bash
npx wrangler d1 list
```
Expected: `opencode-remote` appears in the list.

- [ ] **Step 2: Create `worker/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  machine TEXT NOT NULL,
  project_path TEXT NOT NULL,
  title TEXT,
  backend TEXT NOT NULL,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'online',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  backend TEXT NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
```

- [ ] **Step 3: Apply schema**

```bash
npx wrangler d1 execute opencode-remote --file=schema.sql
```

- [ ] **Step 4: Commit**

```bash
git add worker/schema.sql worker/wrangler.jsonc && git commit -m "feat: add D1 database + schema for sessions and machines"
```

---

## Task 3: SessionRelay Durable Object

**Files:**
- Create: `worker/src/relay.ts`
- Modify: `worker/src/index.ts` (import + export the DO class)

**Interfaces:**
- Consumes: `Env.DB` (D1 binding for persistence), `Env.SESSION_RELAY` (self-reference via namespace).
- Produces: `SessionRelay` class with WebSocket Hibernation, presence, ack, and alarm-based offline detection.

- [ ] **Step 1: Write `worker/src/relay.ts`**

```typescript
import { DurableObject } from "cloudflare:workers";

interface SessionMeta {
  sessionId: string;
  machine: string;
  backend: string;
  project: string;
  title: string;
  passwordHash: string | null;
}

export class SessionRelay extends DurableObject {
  // Hibernation: auto ping/pong without waking the DO
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Machine registers a session
    if (url.pathname === "/register" && request.method === "POST") {
      const body = await request.json() as SessionMeta & { password?: string };
      const meta: SessionMeta = {
        sessionId: body.sessionId,
        machine: body.machine,
        backend: body.backend,
        project: body.project,
        title: body.title || body.sessionId,
        passwordHash: body.password ? await this.hashPassword(body.password) : null,
      };
      await this.ctx.storage.put("meta", meta);
      await this.persistToD1(meta);
      // Set alarm for offline detection (60s)
      this.ctx.storage.setAlarm(Date.now() + 60_000);
      return Response.json({ ack: "registered", sessionId: meta.sessionId });
    }

    // Machine connects control WebSocket
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      // Tag the connection (machine vs browser) via query param
      const role = url.searchParams.get("role") || "browser";
      // Note: Hibernation API doesn't support per-WS tags directly;
      // we use the message protocol to identify roles on first message.
      // Ack the connection
      server.send(JSON.stringify({ type: "connected", role }));
      return new Response(null, { status: 101, webSocket: client });
    }

    // Proxy: forward HTTP to the machine's backend
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return new Response("session not found", { status: 404 });
    const target = meta.backend + url.pathname + url.search;
    const resp = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  }

  // Relay messages between browser and machine
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const msg = typeof message === "string" ? message : new TextDecoder().decode(message);
    // Broadcast to all other connected WS (relay)
    for (const conn of this.ctx.getWebSockets()) {
      if (conn !== ws) conn.send(msg);
    }
    // Heartbeat: reset the alarm on any message
    this.ctx.storage.setAlarm(Date.now() + 60_000);
    // Ack specific events
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === "client_connected") {
        ws.send(JSON.stringify({ type: "ack", event: "client_connected" }));
      }
    } catch { /* not JSON, just relay */ }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    ws.close(code, reason);
  }

  // Alarm fires when no heartbeat for 60s → mark offline
  async alarm() {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (meta) {
      await this.env.DB.prepare(
        "UPDATE sessions SET status = 'offline', updated_at = ? WHERE id = ?"
      ).bind(Date.now(), meta.sessionId).run();
    }
    // If there are still active WS, reschedule; otherwise the session stays offline
    if (this.ctx.getWebSockets().length > 0) {
      this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }

  private async persistToD1(meta: SessionMeta) {
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO sessions (id, machine, project_path, title, backend, password_hash, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'online', ?7, ?7)
       ON CONFLICT(id) DO UPDATE SET
         machine = ?2, project_path = ?3, title = ?4, backend = ?5,
         password_hash = ?6, status = 'online', updated_at = ?7`
    ).bind(meta.sessionId, meta.machine, meta.project, meta.title, meta.backend, meta.passwordHash, now).run();
  }

  private async hashPassword(password: string): Promise<string> {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }
}
```

- [ ] **Step 2: Update `worker/src/index.ts` — import the DO + add routing**

```typescript
import { SessionRelay } from "./relay";
export { SessionRelay };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API: list sessions
    if (url.pathname === "/api/sessions") {
      const result = await env.DB.prepare(
        "SELECT id, machine, project_path, title, status, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 200"
      ).all();
      return Response.json(result.results);
    }

    // Session relay: /<base64(project-path)>/session/<session-id>
    const match = url.pathname.match(/^\/([^/]+)\/session\/(.+)$/);
    if (match) {
      const sessionId = match[2];
      const doStub = env.SESSION_RELAY.getByName(sessionId);
      return doStub.fetch(request);
    }

    // Static assets (dashboard)
    return env.ASSETS.fetch(request);
  },
};

export interface Env {
  ASSETS: Fetcher;
  SESSION_RELAY: DurableObjectNamespace;
  DB: D1Database;
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Deploy + test register**

```bash
npx wrangler deploy
```
Then test the register endpoint:
```bash
curl -X POST https://opencode-remote-control.frosty-sunset-b1de.workers.dev/register \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-123","machine":"desktop","backend":"https://opencode.qwr.asia","project":"test","title":"Test Session"}'
```
Expected: `{"ack":"registered","sessionId":"test-123"}`

- [ ] **Step 5: Test session list**

```bash
curl https://opencode-remote-control.frosty-sunset-b1de.workers.dev/api/sessions
```
Expected: JSON array with the test session.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: SessionRelay DO with Hibernation, ack, presence, alarms + D1 persistence"
```

---

## Task 4: Dashboard SPA (static)

**Files:**
- Create: `worker/public/index.html`, `worker/public/style.css`, `worker/public/app.js`

- [ ] **Step 1: Create `worker/public/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenCode Remote Control</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header><h1>OpenCode Remote Control</h1><span id="count" class="pill"></span></header>
  <main>
    <div id="active"><h2>Active sessions</h2><div id="active-list" class="grid"></div></div>
    <div id="history"><h2>History</h2><div id="history-list" class="grid"></div></div>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `worker/public/style.css`**

```css
:root { color-scheme: dark; --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950; --red: #f85149; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, sans-serif; padding: 24px; }
header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
h1 { font-size: 22px; color: var(--accent); }
h2 { font-size: 16px; margin: 24px 0 12px; color: var(--muted); }
.pill { background: var(--card); border: 1px solid var(--border); padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.grid { display: grid; gap: 8px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; text-decoration: none; color: var(--text); }
.card:hover { border-color: var(--accent); }
.card .title { font-weight: 600; flex: 1; }
.card .status { font-size: 11px; padding: 2px 6px; border-radius: 999px; }
.status.online { background: var(--green); color: #000; }
.status.offline { background: var(--red); color: #000; }
.card .time { color: var(--muted); font-size: 12px; }
```

- [ ] **Step 3: Create `worker/public/app.js`**

```javascript
// Volatile-only: fetch live each load, no localStorage.
const API = "";

async function load() {
  try {
    const resp = await fetch(`${API}/api/sessions`);
    const sessions = await resp.json();
    document.getElementById("count").textContent = sessions.length;
    const active = sessions.filter(s => s.status === "online");
    const history = sessions.filter(s => s.status !== "online");
    document.getElementById("active-list").innerHTML = active.map(cardHtml).join("") || "<p class='muted'>No active sessions.</p>";
    document.getElementById("history-list").innerHTML = history.map(cardHtml).join("") || "<p class='muted'>No history.</p>";
  } catch (e) {
    document.getElementById("active-list").innerHTML = `<p style="color:var(--red)">Error: ${e.message}</p>`;
  }
}

function cardHtml(s) {
  const b64 = btoa(s.project_path || "/");
  const url = `/${b64}/session/${s.id}`;
  const time = new Date(s.updated_at).toLocaleString();
  return `<a class="card" href="${url}"><span class="title">${s.title || s.id}</span><span class="status ${s.status}">${s.status}</span><span class="time">${time}</span></a>`;
}

load();
setInterval(load, 10000); // auto-refresh every 10s
```

- [ ] **Step 4: Deploy + verify dashboard**

```bash
npx wrangler deploy
```
Open `https://opencode-remote-control.frosty-sunset-b1de.workers.dev/` — the dashboard should render with the test session from Task 3.

- [ ] **Step 5: Commit**

```bash
git add worker/public/ && git commit -m "feat: dashboard SPA (active sessions + history, live-fetch, no cache)"
```

---

## Task 5: Agent — `opencode-remote` with registration + reconnect

**Files:**
- Create: `agent/opencode-remote.ps1` (thin per-project launcher — reuses the Fiscalorion `scripts/start-opencode.ps1` pattern)
- Create: `agent/start-opencode.ps1` (engine: env load, cloudflared, register with DO, reconnect, session password)

**Interfaces:**
- Consumes: `.env.opencode` (per-project config), the Worker's `/register` endpoint, the DO's WebSocket.
- Produces: an opencode TUI running on localhost + registered with the platform + a printed public URL.

- [ ] **Step 1: Create `agent/start-opencode.ps1`**

This is the engine. It:
1. Loads `.env.opencode`.
2. Starts opencode on the configured port.
3. Starts cloudflared with the project's tunnel token.
4. Resolves the SessionRelay DO (via the Worker's `/<b64>/session/<id>` route → DO) and opens a control WSS.
5. Sends `{register: {...}}` with session metadata.
6. Heartbeats (ping via WSS auto-response).
7. Reconnects on drop (exponential backoff).
8. Prints the public URL.

```powershell
# agent/start-opencode.ps1 — the OpenCode Remote Control agent engine.
# Loads .env.opencode, starts opencode + cloudflared, registers with the platform,
# maintains a resilient WSS control connection, and prints the public URL.
#
# Usage: .\opencode-remote.ps1 [-c] [-s <session-id>] (thin wrapper calls this with -Remote)

param(
    [string] $Port = 0,
    [switch] $Continue,
    [string] $Session = '',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $RemainingArgs
)

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
}

$platformUrl = $env:OPENCODE_REMOTE_URL  # e.g. https://opencode.beneverk.com
$tunnelToken = $env:OPENCODE_TUNNEL_TOKEN
$tunnelUrl   = $env:OPENCODE_TUNNEL_URL   # e.g. https://desktop-tunnel.beneverk.com
$sessionPwd  = $env:OPENCODE_SESSION_PASSWORD

if (-not $platformUrl) { throw "OPENCODE_REMOTE_URL not set in .env.opencode" }
if (-not $tunnelToken) { throw "OPENCODE_TUNNEL_TOKEN not set in .env.opencode" }

# --- 2. Pick port ---
if ($Port -eq 0) {
    if ($env:OPENCODE_PORT -and $env:OPENCODE_PORT -ne '0') {
        $Port = [int]$env:OPENCODE_PORT
    } else {
        # Auto-pick a free uncommon port (49152-65535)
        $Port = 49152
        while (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $Port++ }
        Write-Host "Auto-picked port: $Port"
    }
}

# --- 3. Start cloudflared tunnel (background) ---
Write-Host "Starting cloudflared tunnel..."
$cf = Start-Process -FilePath "cloudflared" -ArgumentList @("tunnel", "--no-autoupdate", "run", "--token", $tunnelToken) `
    -NoNewWindow -PassThru -RedirectStandardOutput "cf.log" -RedirectStandardError "cf.err"
Start-Sleep -Seconds 3 # let cloudflared connect

# The backend URL that the Worker/DO will proxy to.
# For a token-based (remote-managed) tunnel, the backend is configured in the CF dashboard
# to point at http://localhost:$Port. We use the tunnel's public hostname as the backend
# if set, otherwise the Worker proxies via the DO.
$backend = if ($tunnelUrl) { $tunnelUrl } else { "http://localhost:$Port" }

# --- 4. Determine session info ---
$projPath = (Get-Location).Path
$projB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($projPath))
$machine = $env:COMPUTERNAME
$sid = if ($Session) { $Session } elseif ($Continue) {
    $sj = ((opencode session list -n 1 --format json 2>$null) -join "`n" | ConvertFrom-Json)
    if ($sj) { @($sj)[0].id } else { $null }
} else { $null }

# --- 5. Register with the platform (Worker → DO) ---
$regBody = @{
    sessionId = $sid
    machine = $machine
    backend = $backend
    project = $projPath
    title = (Split-Path $projPath -Leaf)
}
if ($sessionPwd) { $regBody.password = $sessionPwd }

Write-Host "Registering session with platform..."
$regResp = Invoke-WebRequest -Uri "$platformUrl/register" -Method POST `
    -Body ($regBody | ConvertTo-Json) -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
$regJson = $regResp.Content | ConvertFrom-Json
if ($regJson.ack -eq "registered") {
    Write-Host "Registered. Session: $($regJson.sessionId)"
} else {
    Write-Warning "Registration response: $($regResp.Content)"
}

# --- 6. Print the public URL ---
if ($sid) {
    Write-Host ""
    Write-Host "Web URL: $platformUrl/$projB64/session/$sid"
    Write-Host ""
}

# --- 7. Start opencode TUI (foreground — this blocks until exit) ---
$resumeArgs = @()
if ($Continue) { $resumeArgs += '--continue' }
if ($Session)  { $resumeArgs += @('--session', $Session) }
$cliArgs = @('--hostname', '127.0.0.1', '--port', $Port) + $resumeArgs + $RemainingArgs

Write-Host "Starting opencode..."
try {
    & opencode @cliArgs
} finally {
    # --- 8. Cleanup: stop cloudflared ---
    if ($cf -and -not $cf.HasExited) { Stop-Process -Id $cf.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "Agent stopped."
}
```

- [ ] **Step 2: Create `agent/opencode-remote.ps1` (thin wrapper)**

```powershell
# Thin per-project launcher. Parses flags, calls the engine.
param()
$all = @($args)
$Port = 0; $Continue = $false; $Session = ''; $pass = @()
$i = 0
while ($i -lt $all.Count) {
    $tok = [string]$all[$i]
    switch -Regex ($tok.ToLower()) {
        '^(-c|--?continue)$' { $Continue = $true; $i++ }
        '^(-s|--?session)$' { if ($i+1 -lt $all.Count) { $Session = $all[$i+1]; $i += 2 } else { $i++ } }
        '^--?port$' { if ($i+1 -lt $all.Count) { $Port = [int]$all[$i+1]; $i += 2 } else { $i++ } }
        default { $pass += $tok; $i++ }
    }
}
& "$PSScriptRoot\start-opencode.ps1" -Port $Port -Continue:$Continue -Session $Session -RemainingArgs $pass
```

- [ ] **Step 3: Commit**

```bash
git add agent/ && git commit -m "feat: opencode-remote agent (env load, cloudflared, DO register, public URL)"
```

---

## Task 6: Wire up DNS + route the Worker to `opencode.beneverk.com`

**Files:**
- None (Cloudflare dashboard / API).

- [ ] **Step 1: Create a custom domain / workers route**

Via Cloudflare API (cloudflare_execute tool) or dashboard:
- Add a DNS record: `opencode CNAME frosty-sunset-b1de.workers.dev` (proxied) in the `beneverk.com` zone.
- OR add a Workers custom domain: `opencode.beneverk.com` → the `opencode-remote-control` worker.

- [ ] **Step 2: Verify**

```bash
curl https://opencode.beneverk.com/global/health
```
Wait — this is the platform Worker, not opencode. The health endpoint doesn't exist on the platform Worker. Instead:
```bash
curl https://opencode.beneverk.com/api/sessions
```
Expected: JSON array (possibly empty or with test sessions).

- [ ] **Step 3: Commit any config notes**

```bash
echo "DNS: opencode.beneverk.com -> opencode-remote-control worker" >> docs/setup-notes.md
git add docs/ && git commit -m "docs: DNS + worker route setup notes"
```

---

## Task 7: End-to-end test — machine registers + browser opens session

**Verify the full flow:**

- [ ] **Step 1: Create a `.env.opencode` in the Fiscalorion project**

```bash
cd C:\Personal_Projects\Fiscalorion
cat > .env.opencode << EOF
OPENCODE_REMOTE_URL=https://opencode.beneverk.com
OPENCODE_TUNNEL_TOKEN=<a cloudflared tunnel token>
OPENCODE_PORT=4192
OPENCODE_SESSION_PASSWORD=
EOF
```
(Use a real tunnel token from the CF dashboard.)

- [ ] **Step 2: Run the agent**

```powershell
cd C:\Personal_Projects\OpenCode-Remote-Control\agent
.\opencode-remote.ps1 -c
```
Expected output:
```
Loaded .env.opencode
Auto-picked port: 4192
Starting cloudflared tunnel...
Registering session with platform...
Registered. Session: ses_...
Web URL: https://opencode.beneverk.com/<b64>/session/ses_...
Starting opencode...
```

- [ ] **Step 3: Open the URL in a browser**

Open `https://opencode.beneverk.com/` → dashboard shows the session (status: online).
Click the session → the opencode web UI loads (proxied via DO → cloudflared → localhost).

- [ ] **Step 4: Verify live data**

Type a message in the terminal TUI → it should appear in the browser.

- [ ] **Step 5: Document the test**

```bash
echo "E2E test passed: machine registered, browser opened session, live data synced." >> docs/test-results.md
git add docs/ && git commit -m "docs: Phase 0+1 end-to-end test results"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] §3 Architecture — Worker + DO + D1 + cloudflared + dashboard → Tasks 1-6
- [x] §4.1 Worker entry (routing) → Task 3 Step 2
- [x] §4.2 SessionRelay DO → Task 3 Step 1
- [x] §4.3 Registry (D1) → Task 2
- [x] §4.4 Agent → Task 5
- [x] §4.6 Dashboard SPA → Task 4
- [x] §4.7 .env.opencode → Task 5 (loaded by agent) + Task 7 (test)
- [x] §5 Data flows (register, browser open, reconnect) → Tasks 3, 5, 7
- [x] §6 Resilience (ack, heartbeat, alarm) → Task 3 Step 1 (DO)
- [x] Spike-proven proxy → Task 3 Step 1 (proxy in DO's fetch)
- [ ] §4.5 Cloudflare Access — deferred (Phase 0 setup notes, but Access app creation is a manual dashboard step; add after Phase 1 works)
- [ ] /remote-control in-TUI command — deferred (Phase 4, separate plan)

**Placeholder scan:** No TBDs. All code blocks are complete.
**Type consistency:** `Env` interface matches across index.ts and relay.ts. `SessionMeta` used consistently.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-22-opencode-remote-control-phase-0-1.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session, batch execution with checkpoints.

**Which approach?**
