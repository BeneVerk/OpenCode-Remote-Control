# OpenCode Remote Control — Design Spec (all-Cloudflare)

> Status: draft for review · 2026-07-22 · Brainstorming output (pre-implementation-plan)
> Repo (to be created): **`BeneVerk/OpenCode-Remote-Control`** (public)
> Stack: **100% Cloudflare free ecosystem** — Workers + Durable Objects + D1 + Access + cloudflared. No Astro, no Supabase, no external dependencies.

## 1. Vision
A Claude-Code-"Remote Control"-style platform for opencode: **one public domain** (`opencode.beneverk.com`) that lets you open/drive opencode sessions running on **any of your machines** from any browser. Each machine runs an agent that connects **outbound** to the cloud (no inbound ports); the cloud relays the browser to the right session, with auth, presence, resilience, and per-session access control. **Everything runs on Cloudflare's free tier** — no external services.

Reference model (verified): Claude Code `claude remote-control` — local process → outbound to claude.ai → one domain lists/relays many machine sessions; execution stays local.

## 2. Goals / Non-goals
**Goals**
- One public subdomain serving sessions from multiple machines, each at its own URL path.
- Resilient: connection-success **ack** to the originator; auto-reconnect on drops; presence/online status.
- Auth via **Cloudflare Access** (email OTP + Google/GitHub) — zero auth code to write or maintain.
- Per-session **password** set by the originator.
- Lightweight **dashboard SPA** (static HTML/CSS/JS served by Workers) — active sessions + history.
- Per-project tunnel config in `.env.opencode` (always gitignored).
- **100% Cloudflare free ecosystem** — Workers, DO, D1, Access, cloudflared. No Astro, no Supabase.
- Spike-validated: a Cloudflare Worker can proxy the opencode web UI (HTML + API + WS/SSE) — **proven** (zero console errors, session + messages + live state loaded through the proxy).

**Non-goals (this version)**
- No mobile native app (web only; responsive).
- No multi-user/team tenancy (single user, multiple machines; Access free = 50 users).
- No execution in the cloud (execution stays on the originating machine).
- No SSR framework (dashboard is a lightweight SPA; no SEO need for a logged-in tool).

## 3. Architecture (all-Cloudflare, research-grounded)

```
Browser (any device)
  │  HTTPS / WSS
  ▼
┌──────────────────────────────────────────────────────────┐
│  opencode.beneverk.com  (ONE Cloudflare origin)          │
│                                                          │
│  Cloudflare Access (edge)                                │
│    ├─ intercepts all requests                           │
│    ├─ email OTP / Google / GitHub login (CF-hosted)     │
│    └─ sets JWT cookie → Worker reads identity            │
│                                                          │
│  Worker (compute)                                        │
│    ├─ /              → dashboard SPA (static assets)     │
│    ├─ /api/sessions → D1 query (active + history)        │
│    └─ /<b64>/session/<id> → SessionRelay DO              │
│                                                          │
│  SessionRelay DO (per session)                           │
│    ├─ presence + ack + WS hibernation + alarms           │
│    └─ proxies to machine's cloudflared backend           │
│                                                          │
│  D1 (SQLite) — session registry + history                │
│  KV (optional) — fast presence index                     │
└────────────────────────┬─────────────────────────────────┘
  │  outbound WSS (control + ack + reconnect)
  ▼
Machine A (desktop)           Machine B (laptop)
  ├─ opencode (:4192)           ├─ opencode (:5273)
  ├─ cloudflared tunnel          ├─ cloudflared tunnel
  └─ opencode-remote agent       └─ opencode-remote agent
      .env.opencode (gitignored)    .env.opencode (gitignored)
```

**Key decision — Durable Objects as the relay.** Cloudflare Durable Objects are built for "coordination among multiple clients" (chat, collaboration, real-time) with globally-unique named objects, in-memory state, **WebSocket Hibernation**, and **Alarms** (ref: developers.cloudflare.com/durable-objects). This gives us, natively:
- **Presence**: a DO per session knows who (browser/machine) is connected.
- **Ack**: the DO sends a "connection successful" frame to the machine on browser join.
- **Resilience**: Hibernation (`this.ctx.acceptWebSocket(ws)` + `setWebSocketAutoResponse("ping","pong")`) keeps WS open across eviction; the runtime recreates the DO on message. Alarms handle offline-timeout cleanup.
- **Reconnect**: clients auto-reconnect (WS); the DO reattaches via its stable name (`getByName(sessionId)`).

**Key decision — Cloudflare Access for auth (replaces Supabase).** Access provides email OTP + Google/GitHub at the edge. No login UI to build — Access hosts the login page. The Worker reads the `cf-access-jwt-assertion` header for user identity. Free for up to 50 users.

**Data path** — the opencode traffic (SPA HTML, REST API, real-time SSE/WS) flows Browser → Worker → SessionRelay DO → the machine's **cloudflared** backend (`<tunnel>.cfargotunnel.com`). The spike proved this end-to-end (zero console errors).

## 4. Components

### 4.1 Front — Cloudflare Worker (on `opencode.beneverk.com`)
- **Worker entry**: routes `/` → static dashboard assets; `/api/*` → D1 queries; `/<b64>/session/<id>` → resolve SessionRelay DO → relay.
- **Static assets**: the dashboard is a lightweight HTML/CSS/JS SPA served directly by the Worker via Workers static assets (no Astro, no build step).
- **Access JWT**: the Worker reads `cf-access-jwt-assertion` header (set by Access at the edge) to identify the user — no middleware, no cookie parsing.

### 4.2 SessionRelay Durable Object (per session)
- Named by session id (`env.SESSION_RELAY.getByName(sessionId)`).
- Holds: browser WS(s), machine WS (control), session metadata.
- `webSocketMessage` relays between browser ↔ machine; `webSocketClose` updates presence; **alarm** marks offline after N seconds of no heartbeat.
- On machine connect: persists presence; on browser connect: **acks** to machine (`{type:"client_connected"}`) and to browser (`{type:"ready"}`).
- WebSocket Hibernation for scale (`acceptWebSocket`, `setWebSocketAutoResponse`).

### 4.3 Registry — D1 (SQLite) + optional KV index
- **D1 database**: authoritative session registry. Tables: `sessions(id, machine, project_path, title, password_hash, backend, status, created_at, updated_at)`, `machines(id, hostname, backend, last_seen)`.
- **KV** (optional, for fast dashboard lookups): `session:<id> → {status}` with TTL; refreshed by DO writes.
- D1 is Cloudflare's native serverless SQLite — free tier: 5M reads/day, 100K writes/day.

### 4.4 Per-machine agent — `opencode-remote`
- Runs **opencode** on an auto-picked, fixed port (per project; stored in `.env.opencode`).
- Runs **cloudflared** (its tunnel) → backend `<tunnel>.cfargotunnel.com`.
- Opens an outbound **control WSS** to its SessionRelay DO(s); heartbeats; receives acks.
- **Registers** the session (id, project path, title, optional **session password**) with the DO.
- **Resilience**: reconnects WSS on drop (exponential backoff); re-registers; on exit, deregisters (DO alarm covers crashes).
- Prints the public URL: `https://opencode.beneverk.com/<b64(cwd)>/session/<id>`.

### 4.5 Auth — Cloudflare Access (Zero Trust)
- **Access application** on `opencode.beneverk.com` (created in CF dashboard → Zero Trust → Access → Applications).
- **Identity providers** (Zero Trust → Settings → Authentication):
  - **Email OTP** (built-in, one-time PIN) — enabled by default.
  - **Google** (OIDC) — add client ID/secret.
  - **GitHub** (OIDC) — add client ID/secret.
- **Access policy**: allow your email (or a group).
- **How it works**: browser hits `opencode.beneverk.com` → Access intercepts → shows CF-hosted login page (email/Google/GitHub) → user authenticates → Access sets JWT cookie → forwards to Worker with `cf-access-jwt-assertion` header.
- **Worker reads identity**: parses the Access JWT header for the user's email — no auth code, no session management, no cookie handling.
- **Session passwords** (optional, per session): separate from Access auth — the DO challenges the browser for the session-specific password before attaching. Stored as a hash in the DO.

### 4.6 Dashboard — lightweight SPA (static HTML/CSS/JS)
- Served by the Worker as static assets (no Astro, no build step).
- **Home / dashboard**: lists **active connected sessions** (live, fetched from `/api/sessions`) + **session history** (from D1). Each row → click to open the session (deep-link to the relay path).
- **Login**: handled by Access (CF-hosted login page) — no login UI to build.
- Live data fetched fresh each load (no permanent client cache; aligns with the "always fetch from API, volatile only" rule).

### 4.7 Per-project config — `.env.opencode` (gitignored)
- Per-project file holding tunnel config: `OPENCODE_TUNNEL_TOKEN`, `OPENCODE_TUNNEL_URL`, `OPENCODE_PORT`, `OPENCODE_CORS_ORIGIN`, optional `OPENCODE_SESSION_PASSWORD`.
- Always gitignored (repo-level `.gitignore` entry). Loaded by the agent at startup.

## 5. Data flows

**Registration (machine start):**
1. `opencode-remote` picks/reads port from `.env.opencode`; starts opencode + cloudflared.
2. Resolves its SessionRelay DO (`getByName(sessionId)`); opens control WSS.
3. Sends `{register:{sessionId, machine, backend, project, title, password?}}`.
4. DO persists to D1 + KV index; **replies `{ack:"registered"}`**; agent prints the public URL.

**Browser open session:**
1. `GET /<b64>/session/<id>` → **Access checks JWT** (edge) → Worker → optional session-password prompt → DO.
2. DO attaches browser WS; **acks to machine** (`client_connected`) and browser (`ready`).
3. Browser's opencode UI loads via the spike-proven proxy path (HTML/API/SSE through the DO → cloudflared backend).

**Reconnect/drop:**
- WSS drops → agent retries with backoff; DO retains session (alarm-tolerant); on reconnect, DO re-acks.
- Browser WS drops → client auto-reconnects; DO reattaches.
- Machine offline > N seconds → DO alarm flips status to `offline`; dashboard reflects it; reappears on reconnect.

## 6. Resilience summary (the "resilience system")
- **Ack**: explicit `{ack}` frames both directions on connect/register.
- **Heartbeat**: `setWebSocketAutoResponse("ping","pong")` — cheap, no DO wake.
- **Reconnect**: clients use exponential backoff; DO is stateful & named so it reattaches seamlessly.
- **Presence/timeout**: DO alarms mark stale sessions offline.
- **Cloudflared** itself reconnects the data-path tunnel automatically.

## 7. Auth & access control
- **Cloudflare Access** gates the entire `opencode.beneverk.com` origin (email OTP + Google/GitHub). No unauthorized access reaches the Worker.
- The Worker reads the Access JWT for user identity — no separate auth code.
- **Session password** (optional, set by originator): DO challenges the browser (prompt) before attaching; stored as a hash in the DO. This is per-session, on top of Access.
- Per-machine tunnels (`*.cfargotunnel.com`) are **not** public — only the Worker/DO reaches them.

## 8. Project / repo
- **`BeneVerk/OpenCode-Remote-Control`** — **public** GitHub repo under the BeneVerk org (created via `schatt93`).
- Local folder: `C:\Personal_Projects\OpenCode-Remote-Control`.
- Monorepo sub-layout:
  ```
  worker/       — CF Worker (routing, API, DO class, static asset serving)
    src/
      index.ts       — Worker entry (fetch handler, routing)
      relay.ts       — SessionRelay Durable Object class
      proxy.ts       — proxy logic (spike-proven, refactored)
    public/          — dashboard SPA (static HTML/CSS/JS, no build)
    wrangler.jsonc    — bindings (DO, D1, KV, assets)
    schema.sql       — D1 table definitions
  agent/        — opencode-remote (PowerShell + future cross-platform)
    opencode-remote.ps1
    start-opencode.ps1
  docs/         — specs, runbooks
  ```

## 9. Phased delivery (simplified — no Astro/Supabase setup)
- **Phase 0** — repo + scaffold: create `BeneVerk/OpenCode-Remote-Control` (public), folder structure, `wrangler.jsonc` with D1 + DO + assets bindings, D1 schema, `.gitignore` with `.env.opencode`. Create the Access application on `opencode.beneverk.com` + configure email OTP. *(~1 hour)*
- **Phase 1** — Core relay: SessionRelay DO (ack/presence/alarms) + Worker routing + agent (`opencode-remote` with reconnect + session password) + cloudflared. Multi-machine behind one domain. (Builds on the proven spike.) *(~1 day)*
- **Phase 2** — Dashboard SPA: static HTML/CSS/JS dashboard listing active sessions + history (from D1). Wire `/api/sessions`. *(~half day)*
- **Phase 3** — Access identity providers: add Google + GitHub to the Access app. Session-password enforcement in the DO. *(~2 hours)*
- **Phase 4** — `/remote-control` in-TUI command + polish + hardening. *(~half day)*

## 10. Research grounding (2026)
- **Cloudflare Durable Objects** — Hibernation API (`acceptWebSocket`, `setWebSocketAutoResponse`), `webSocketMessage`/`webSocketClose`, Alarms — for stateful multi-client relay + presence (developers.cloudflare.com/durable-objects, /workers best-practices).
- **Cloudflare Access** — edge auth (email OTP, OIDC for Google/GitHub), JWT cookie, `cf-access-jwt-assertion` header for Worker identity (developers.cloudflare.com/cloudflare-one/identity/users).
- **Cloudflare D1** — serverless SQLite, free tier (developers.cloudflare.com/d1).
- **Cloudflare Workers static assets** — serve static HTML/CSS/JS directly from a Worker (developers.cloudflare.com/workers/static-assets/).
- **Claude Code Remote Control** — outbound-only local-to-cloud relay; one domain serves many machine sessions (docs.claude.com/claude-code/remote-control).
- **Spike (this session)** — CF Worker at `opencode-proxy-spike.frosty-sunset-b1de.workers.dev` proxied opencode's web UI (HTML + API + SSE) to a cloudflared backend with **zero console errors**. Session + full message history loaded. Data-path proxy is de-risked.

## 11. Open questions / risks
- **DO proxy vs WS relay for data path**: the spike proved the cloudflared-proxy path (Worker → cloudflared backend). Decide in Phase 1 whether the DO also proxies HTTP, or only handles the control/presence WS while the Worker proxies the data path. (Proxy is lower-risk; recommended.)
- **Live two-way sync** through the DO/proxy — spike showed no errors but didn't run an interactive type-in-TUI test; confirm first in Phase 1.
- **D1 from DO**: writing session registrations from a DO to D1 — confirm the binding works (DO → D1 binding in wrangler.jsonc). Alternative: DO writes to its own SQLite storage + a cron Worker syncs to D1.
- **Access + WS**: Access protects HTTP routes; confirm WebSocket upgrade requests also pass through Access (they should — Access operates at L7).
- **Cost/limits**: DO hibernation WS on free plan; D1 writes from DO; Access 50-user free limit.
- **GitHub**: create `BeneVerk/OpenCode-Remote-Control` under the org (confirm org-creation permissions for `schatt93`).
- **Workers static assets + DO co-hosting**: confirm a single Worker can serve static assets AND route to DOs on the same origin (should work via the assets binding + fetch handler).
