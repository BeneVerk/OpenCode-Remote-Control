# Human Decisions Queue — OpenCode Remote Control

Items an agent cannot resolve without the user (DECISION-REQUIRED / OPEN-QUESTION from audits).
Source: AUDIT-RUN-023 (2026-07-26).

## D1 — RESOLVED (2026-07-26)
**Cloudflare Access is enforced on `opencode.beneverk.com`.** Enabled by the user (dashboard), then wired via API: self-hosted app `7c977393-…` on `opencode.beneverk.com`; policy `576aa83b-…` = allow `@beneverk.com` email domain (browser, email OTP via the built-in Cloudflare IdP); policy `33b90e97-…` = **`non_identity`** decision + `any_valid_service_token` (agent). Service token `9c96b864-…` ("opencode-remote-agent") created for machine auth. Verified live: unauthenticated → 302 to Access login; agent `/register` + `/api/sessions` with the service token → 200 (register→DO→D1 works behind Access). Closes audit F2. **Note:** the service-token policy must use decision `non_identity`, **not** `allow` — `allow` requires a user identity the token doesn't provide (the bug that cost a debug cycle).

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
