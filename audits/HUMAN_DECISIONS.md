# Human Decisions Queue — OpenCode Remote Control

Items an agent cannot resolve without the user (DECISION-REQUIRED / OPEN-QUESTION from audits).
Source: AUDIT-RUN-023 (2026-07-26).

## D1 — DECISION-REQUIRED · **block** (audit S1 cluster)
**When will Cloudflare Access be enforced on `opencode.beneverk.com`?**
The platform is live and **publicly open** right now (F2). Until Access (R2) lands, the endpoint is exposed to anyone: world-readable session list, open registration, open proxy to public URLs (F3), stored XSS in the dashboard (F1). Recommendation: enable Access immediately OR treat the URL as non-public (do not share it) and ship R1+R3+R4 in the same change.

## D2 — OPEN-QUESTION (audit F20)
**Is the DO-as-HTTP-proxy data-path confirmed by a live E2E?**
The partial E2E in this session verified register → D1 → dashboard → alarm/presence, **not** browser → opencode-UI proxying through the DO → cloudflared. Spec §11 left the proxy-vs-relay question open. Until a real machine E2E (Task 7 manual) confirms it, the data-path is unvalidated.

## D3 — DECISION-REQUIRED (audit F13)
**Multi-browser-per-session semantics?**
The relay broadcasts every WS message to all connections except the sender. With >1 browser on a session they cross-receive. Decision: enforce 1:1 (browser, machine) or support multiple viewers? Affects relay correctness and the ack flow.

## D4 — OPEN-QUESTION (audit F4)
**Session-history retention policy?**
`offline` rows are never deleted; nothing reaps them. Decide a retention window (e.g., delete `offline` rows older than 30 days) for the R4 reaper cron.

---

*Resolve a decision → move it below as `RESOLVED (<date>): <choice>`, and re-audit the affected finding.*
