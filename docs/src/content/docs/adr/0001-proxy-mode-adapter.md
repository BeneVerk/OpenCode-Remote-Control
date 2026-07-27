---
title: ADR-0001 — ProxyMode adapter interface
description: Decision — the per-machine UI proxy is selected by a ProxyMode adapter.
---

- **Status:** Accepted (2026-07-26)
- **Context:** Phase 0+1 audit (AUDIT-RUN-023 → 025) + the D2 de-risking.

## Context

The aggregator must reach each machine's opencode web-UI. opencode serves its UI
at the origin root and uses **absolute-path API calls** (`/event`, `/session/…`,
`/global/health`) with no base-path config (verified in
`packages/sdk/js/src/gen/client.gen.ts`). Multi-machine on a **single origin**
is therefore ambiguous — a bare `/event` carries no machine id.

## Decision

Put the per-machine proxy behind a **`ProxyMode` interface** and select one per
deployment:

```ts
interface ProxyMode {
  resolve(req: Request): { backend: URL; rewrite: "none" | "subpath-shim" } | null;
  publicUrl(machineId: string, sessionId?: string): string;
}
```

Two adapters ship:

- `SubdomainProxyMode` — `<machine>.opencode.beneverk.com`, `rewrite: "none"` (cloud default).
- `SubpathRewriteProxyMode` — `/<machine>/<session>` + a `fetch`/`XHR`/`WebSocket`/`EventSource` shim (`rewrite: "subpath-shim"`) for domain-less deployments.

## Consequences

- The aggregator core (dashboard, registry, notifications, auth) is **identical** across modes — only the proxy adapter differs.
- Self-hosted can add a `LocalPortProxyMode` (host's own opencode next to the aggregator — no proxy/rewrite at all).
- See [ADR-0002](./0002-subdomain-vs-convertor/) for why both, and the robustness trade-off.
