# AGENTS.md — guidance for AI agents working in this repo (OpenCode)

## Working principles (read first — apply every turn)
- **Ask, don't assume.** If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements.
- **Flag uncertainty explicitly.** If you are not confident about an approach or technical detail, say so before proceeding. Confidence without certainty causes more damage than admitting a gap.
- **Don't trust stale training knowledge.** Do not rely on trained-in information for libraries, APIs, or tooling — always consult the correct, current documentation from the web (or Context7) before implementing. (If docs conflict with config or scripts, trust the executable source.)
- **Never give up on failure — retry.** If any tool, workflow, or sub-agent fails, try it again. Do not silently abandon a failed step. Retry, and if it still fails, ask the user for help to fix it, then try again.
- **Never settle.** Do not settle on failed task output, or on work of poorer quality than the task demands. Do not settle on stale or outdated knowledge or context. Push for the correct, complete, high-quality result every time.
- **Model check before coding.** State which model you're running on and confirm it fits the work: strongest (Opus-class) for novel / security-sensitive / compliance / prompt-authoring work and any "review what I built" or audit pass; faster (Sonnet-class) for well-specified, mechanical work (ports, scaffolds, wiring, tests). Planning / design / brainstorm → strongest. If the running model doesn't fit, say so and switch before proceeding. Selecting the strongest model does **not** auto-downgrade sub-agents — set a per-agent model override for the strong-coordinator + faster-implementer split.
- **Update propagation (no orphaned references).** When you change anything that is referenced elsewhere — an architecture decision, a contract/type/symbol name, a file path, an env var, a value duplicated across docs, a package export — **propagate it to every place that references it, in the same change, and grep-prove zero residual of the old pattern before you call it done.** "I updated the canonical spot" is not done; zero old-pattern hits across `docs/`, `worker/`, `agent/`, plans/specs, `README`, and `opencode.json` is done.
- **Audit & verify every turn (Universal Audit Skill).** Use the Universal Audit Skill — **v10.2** at `C:\Personal_Projects\universal-audit-skill\universal-audit-skill-v10.2.md` (external single source; no `.claude/skills/` copy) — as a standing quality gate: **after each task/phase, run an audit + the toolchain on what changed**, and a **whole-platform audit before launch** (Deep depth, Reasonable assurance). For this repo's AI-agent / proxy work the applicable modules are **AQ, K, Q, O, J** (+ **Stage-R** currency + the **Stage-D** per-finding skeptic gate). Persist records to `audits/AUDIT-RUN-<NNN>` (next = **023**) + append `audits/AUDIT-INDEX.md`; queue human calls in `audits/HUMAN_DECISIONS.md`. A **failed audit/verify agent MUST be re-run** before claiming coverage — "covered by another lens" is not coverage. (Toolchain here: once `worker/` is scaffolded → `cd worker && npx tsc --noEmit`; deploy → `npx wrangler deploy`. Add e2e checks as they land.)

## What this is
OpenCode Remote Control: a Claude-Code-"Remote Control"-style platform for **opencode** — one public domain serves browser access to opencode TUI sessions running on any of your machines. **100% Cloudflare free tier**: Workers + Durable Objects + D1 + Cloudflare Access + cloudflared. Execution stays on the originating machine; the cloud only relays.

## Status — Phase 0+1 built and deployed
Phase 0+1 is **implemented and live**. `worker/` (Worker entry + `SessionRelay` DO + D1 `opencode-remote` + dashboard SPA) and `agent/` (`opencode-remote.ps1` + `start-opencode.ps1`) all exist. The Worker is deployed to **`opencode.beneverk.com`** (custom domain) under the BeneVerk account; the DO migration `v1` (`new_sqlite_classes: SessionRelay`) is applied; D1 schema (`sessions` + `machines`) is applied. Verified live: register → DO → D1 → `/api/sessions` → dashboard, plus alarm-driven presence (offline after 60s w/o heartbeat). **Cloudflare Access is enabled** (org `weathered-limit-db1c.cloudflareaccess.com`) with a self-hosted app on `opencode.beneverk.com`, an `@beneverk.com` email-OTP policy (browser), and a `non_identity` service-token policy (agent); the agent authenticates via `CF-Access-Client-Id`/`-Secret` headers. AUDIT-RUN-023→024→025: 20 findings, all resolved. **Remaining:** full live E2E with a real machine + cloudflared tunnel (Task 7 manual). Two docs remain the source of truth for *intended* structure:
- `docs/2026-07-22-opencode-remote-control.md` — full design spec (architecture, data flows, open questions).
- `docs/superpowers/plans/2026-07-22-opencode-remote-control-phase-0-1.md` — task-by-task plan with exact file contents.

Always `git ls-files` / glob the disk before "editing" files that only exist in the plan.

## Intended structure (from the plan)
```
worker/   CF Worker: routing, /api/sessions (D1), /<b64>/session/<id> → SessionRelay DO; static dashboard.
          Verify (once scaffolded): cd worker && npx tsc --noEmit   ·   Deploy: npx wrangler deploy
agent/    opencode-remote (PowerShell): per-machine launcher — loads .env.opencode, starts opencode + cloudflared, registers with DO, keeps resilient control WSS.
docs/     specs + plans.
```

## Dev-machine vs. platform — don't confuse them
- **Root `opencode-remote.ps1`** is a *dev launcher for the opencode TUI on this machine* (copied from another project). It delegates to `scripts\start-opencode.ps1`, which **does not exist in this repo** — it is stale, not the platform's agent.
- **Root `.env.opencode`** is the *opencode MCP-secrets file for this dev machine* (gitignored; contains **real tokens — never echo or commit**). The platform's per-project tunnel config (a separate concept) also uses a `.env.opencode` (design §4.7).
- **The platform's agent belongs in `agent/opencode-remote.ps1` + `agent/start-opencode.ps1`** per the plan. Do not treat the root launcher as the platform entrypoint.

## Hard architecture constraints (non-negotiable)
- **Durable Objects must use the Hibernation API**: `this.ctx.acceptWebSocket(ws)` + `setWebSocketAutoResponse(...)`. Never `ws.accept()`.
- **`compatibility_date` ≥ `2024-09-23`** (required for DO Hibernation).
- **Static dashboard = hand-written HTML/CSS/JS.** No build step, no Astro/SSR/framework. Served via Workers static assets. Fetch live each load (no persistent client cache — "volatile only").
- **No secrets in tracked files.** Tokens go in `.env.opencode` (gitignored) or Wrangler secrets.
- **Auth = Cloudflare Access** (edge JWT via `cf-access-jwt-assertion` header) — don't hand-roll auth. Optional per-session passwords are a separate, additional layer stored hashed in the DO.

## Deployment targets
- Git remote (current, temporary): `github.com/schatt-qwr/OpenCode-Remote-Control` (scratch remote). **Canonical home: `github.com/BeneVerk/OpenCode-Remote-Control`** — the `BeneVerk` org exists (id `297254514`, 0 repos currently); developer `schatt93`. Task 1 Step 1 creates the repo under `BeneVerk`, pushes existing history, and repoints the local remote from `schatt-qwr` → `BeneVerk`.
- Cloudflare account: **BeneVerk** — account id `80f0a5ca91bf807fe0f1de55bd36f10f`; workers.dev subdomain `frosty-sunset-b1de` (workers_dev disabled — canonical-only). Zone: **beneverk.com** (zone id `08c3a9b543015402f96143e7fb6a6c40`). Origin (live): `opencode.beneverk.com` (Workers custom domain). D1 name: `opencode-remote` (uuid `8fb093dd-ec92-42d0-a25b-6f48f10b5114`). *(Confirmed in CF dashboard + via successful deploy.)*

## MCP servers (opencode.json)
GitHub and DigitalOcean need **token auth via env** (`PROJECT_GITHUB_TOKEN`, `PROJECT_DO_TOKEN`, set in `.env.opencode`); supabase/sentry/context7/cloudflare use **browser OAuth cached once** in `~/.local/share/opencode/mcp-auth.json` (`opencode mcp auth <name>`). See the `.env.opencode` header comment for one-time auth steps.
