# OpenCode Remote Control

Claude-style remote control for opencode � one domain, many machines, all Cloudflare.

## Stack
- Cloudflare Workers (compute + routing)
- Durable Objects (session relay + presence + ack)
- D1 (SQLite registry)
- Cloudflare Access (auth)
- cloudflared (per-machine tunnel)

## Status
Phase 0+1 � scaffold + core relay. See docs/2026-07-22-opencode-remote-control.md (design spec) and docs/superpowers/plans/ (implementation plan).
