# OpenCode Remote Control

Claude-style remote control for opencode — one domain, many machines, all Cloudflare.

## Stack
- Cloudflare Workers (compute + routing)
- Durable Objects (session relay + presence + ack)
- D1 (SQLite registry)
- Cloudflare Access (auth)
- cloudflared (per-machine tunnel)

## Status
Phase 0+1 — scaffold + core relay. See docs/superpowers/specs/ for the design spec.
