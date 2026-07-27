---
title: ADR-0003 — Pluggable auth gate
description: Decision — auth behind an AuthProvider interface; CF Access (cloud) + basic-auth/session (self-hosted default).
---

- **Status:** Accepted (2026-07-26)

## Context

Cloud deployment uses **Cloudflare Access** (email OTP / OIDC, verified live in
AUDIT-RUN-025). A self-hosted aggregator has no Access — the gate must be
decoupled so the same core runs standalone, exposed via tunnel or static IP.

## Decision

Auth sits behind an `AuthProvider` interface. Two implementations:

- **Cloud** — `CloudflareAccessProvider` (edge JWT via `cf-access-jwt-assertion`; the agent authenticates as a machine with a service token under a `non_identity` Access policy).
- **Self-hosted (default)** — `BasicAuthProvider` / `SessionPasswordProvider`: a username + bcrypt-hashed password **set when the aggregator server starts**. Pluggable to other providers (Tailscale ACL, a local OIDC) later.

## Consequences

- One aggregator core, two auth modes, selected by config — no auth code is Cloudflare-specific except the `CloudflareAccessProvider` adapter.
- The agent's auth is also pluggable: service token (cloud) vs the self-hosted credential (self-hosted).
- Cloud mode keeps the wildcard Access app covering apex + `*.opencode.beneverk.com`; self-hosted mode does its own gate at the server.
