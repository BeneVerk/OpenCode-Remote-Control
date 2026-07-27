# Opencode Remote Fleet

> Aggregate and remote-control [opencode](https://opencode.ai) sessions across all your machines, from one place you control.

**Opencode Remote Fleet** is a remote-control + aggregation plane for opencode
coding-agent sessions. One domain gives you a single dashboard of every machine and
every active session, with live status and **notifications** ("session waiting for
input") that deep-link you straight to the session that needs you. The opencode UI
runs untouched per machine; the Fleet authenticates, aggregates, and proxies.

- **One pane of glass** — machines + their sessions, grouped, live status.
- **Notifications** — when a session needs an answer, you get told; one click lands you in it.
- **Auth-gated** — Cloudflare Access (cloud) or a pluggable self-hosted gate.
- **Self-hostable** — the same core runs on your own machine (Deno), via tunnel or static IP.

## Status

Phase 0+1 is **built and deployed** (Cloudflare Worker + Durable Object + D1 + dashboard + PowerShell agent) behind Cloudflare Access; AUDIT-RUN-023→025 closed all 20 findings. The repo is being restructured onto an industry-standard monorepo; see [Decision Records](./docs/src/content/docs/adr/0001-proxy-mode-adapter.md) and the [architecture](./docs/src/content/docs/architecture/context.mdx).

## Repository layout

```
opencode-remote-fleet/                # pnpm + Turborepo monorepo
  apps/
    worker/        @beneverk/opencode-remote-fleet-worker        # Cloudflare Worker (aggregator + proxy + dashboard)
    server/        @beneverk/opencode-remote-fleet-server        # (deferred) Deno self-hosted aggregator
  packages/
    proxy/         @beneverk/opencode-remote-fleet-proxy          # ProxyMode adapters (subdomain + subpath-convertor)
    dashboard/     @beneverk/opencode-remote-fleet-dashboard      # aggregator UI (consumes the design mockup)
    agent/         @beneverk/opencode-remote-fleet-agent          # per-machine agent (PowerShell now → TS later)
    core/          @beneverk/opencode-remote-fleet-core           # shared types, registry, notification model
    brand/         @beneverk/opencode-remote-fleet-brand          # brand.config.json schema + loader
  docs/            @beneverk/opencode-remote-fleet-docs           # Astro Starlight site (renders MD + Mermaid)
  design/                                                          # design source (separate from docs): dashboard mockup, brand config, docs-site spec
  audits/                                                          # audit run records + decision queue
  pnpm-workspace.yaml  turbo.json  tsconfig.base.json  biome.json
```

## Quick start

```bash
pnpm install                       # install all workspaces
pnpm --filter @beneverk/opencode-remote-fleet-worker typecheck    # verify the Worker
pnpm --filter @beneverk/opencode-remote-fleet-worker test         # vitest (8 tests)
pnpm --filter @beneverk/opencode-remote-fleet-docs dev            # docs site at http://localhost:4321
pnpm --filter @beneverk/opencode-remote-fleet-worker deploy       # deploy the Worker (needs wrangler login to the CF account)
```

Open `design/dashboard/index.html` directly to preview/iterate the dashboard UI.

## Documentation

The full docs (architecture diagrams, ADRs, developer guides) live under `docs/` and
render via Astro Starlight. Run `pnpm --filter @beneverk/opencode-remote-fleet-docs dev`
to browse locally. Brand + UI/UX design sources live under `design/` (editable externally).

## License & origin

Built by BeneVerk. Architecture, decision records, and audit history are committed
in this repo (`docs/src/content/docs/`, `audits/`).
