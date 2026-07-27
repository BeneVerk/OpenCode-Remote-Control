---
title: ADR-0004 — Product naming
description: Decision — product "Opencode Remote Fleet", npm scope @beneverk, packages @beneverk/opencode-remote-fleet-*.
---

- **Status:** Accepted (2026-07-26)

## Context

The product needs a stable name conveying three things: **remote connection**,
**aggregation of machines/sessions**, and **unified under one user/account**.
Initial proposal `com.beneverk.opencode-remote-session-controller` was verbose
and Java-flavored (reverse-DNS), which is unidiomatic for a TS/Cloudflare
monorepo.

## Decision

- **Product name:** **Opencode Remote Fleet** — "fleet" conveys many machines,
  "remote" conveys the connection, "fleet under you" conveys unified ownership.
- **npm scope:** `@beneverk`.
- **Sub-packages:** `@beneverk/opencode-remote-fleet-<part>` (worker, dashboard, agent, proxy, core, brand, server, docs).
- **Formal identifier** (optional, where reverse-DNS is genuinely needed): `com.beneverk.opencode-remote-fleet`.

## Consequences

- One consistent name across repo, npm scope, Worker, dashboard, docs, UI, CI.
- Other candidates considered (Orbit, Constellation, Tether, Loom, Cockpit, Atlas) are documented for reference but not chosen.
