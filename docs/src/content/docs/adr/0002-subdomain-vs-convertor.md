---
title: ADR-0002 — Subdomain (default) vs subpath convertor (fallback)
description: Decision — both proxy adapters; subdomain is the default, convertor is the escape hatch.
---

- **Status:** Accepted (2026-07-26)

## Context

Two ways to give each machine a routing handle that survives opencode's
absolute-path API calls:

1. **Subdomain** (`<machine>.opencode.beneverk.com`) — the host carries the machine id.
2. **Subpath + convertor** (`/<machine>/<session>/…`) — the path carries it, but a shim must repoint opencode's absolute fetches under the prefix.

The convertor was requested to be **built now** so both can be tested in parallel.

## Decision

Build **both**, selectable via `ProxyMode`:

- **Default = SubdomainProxyMode.** opencode runs unmodified at its own origin; absolute paths resolve natively; survives any opencode update; zero maintenance. Used in cloud (wildcard DNS/Access).
- **Fallback = SubpathRewriteProxyMode (the convertor).** A `fetch`/`XHR`/`WebSocket`/`EventSource` shim is injected before opencode's bundle; absolute paths are repointed under `/<machine>/`. Used where a domain/wildcard DNS is unavailable (some self-hosted).

## Consequences / robustness

- The shim is the **robust variant** of convertor (catches runtime-constructed URLs at the transport layer), but couples us to opencode's transports and has edge cases (workers, `sendBeacon`, future APIs). Body-regex rewriting was rejected as too fragile.
- Subdomain is **strictly more robust** (zero rewriting, decoupled from opencode internals) — that's why it's the default.
- Both being adapters means a deployment can choose; the product keeps a single domain UX (`opencode.beneverk.com/<machine>/<session>` redirects to the subdomain in cloud mode).
