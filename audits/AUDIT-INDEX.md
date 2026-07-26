# Audit Index — OpenCode Remote Control

Append-only: one row per audit run. Run numbers are sequential.

| Run | Date | Scope | Depth | Assurance | Modules | S1 | S2 | S3 | S4 | S5 | Open | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 023 | 2026-07-26 | Phase 0+1 deployed (`worker/`, `agent/`, `docs/`, live `opencode.beneverk.com`) | Deep | Reasonable | A,F,G,I,J,K,L,O,Q,R,S,T | 2 | 3 | 6 | 5 | 3 | 1 | NOT launch-ready — F1/F2 (XSS + no auth) block until R1/R2 land |
| 024 | 2026-07-26 | Re-audit post-remediation (`ea1a8da`, `0ec7115`) | Deep | Reasonable | (delta) + full regression sweep | 1 | 0 | 0 | 0 | 0 | 0 | **19/20 resolved**; only F2 (Access) open — DECISION-REQUIRED (D1, manual dashboard step) |
| 025 | 2026-07-26 | Re-audit after Access enablement + agent service-token wiring (`132b1d3`) | Deep | Reasonable | (delta) | 0 | 0 | 0 | 0 | 0 | 0 | **PASS — 20/20 resolved; 100% clean.** Launch-ready behind Access. Residual: rate-limit/metrics/SBOM (accepted); D2 live E2E (manual) |

Records: `AUDIT-RUN-023/024/025-2026-07-26.md`. Human calls: `HUMAN_DECISIONS.md`.
