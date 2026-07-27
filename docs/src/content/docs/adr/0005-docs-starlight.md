---
title: "ADR-0005 — Docs stack: Astro Starlight + Mermaid"
description: Decision — documentation site on Astro Starlight, diagrams as Mermaid rendered client-side.
---

- **Status:** Accepted (2026-07-26)

## Context

Requirements: modern, visually polished, dark/light, brandable, renders
architecture diagrams, source-of-truth in editable MD files, externally
iterable. Initially considered MkDocs Material; re-evaluated.

## Decision

- **Astro Starlight** for the docs site — modern, fast, MDX, themable, the current gold standard for dev docs.
- **Mermaid** for diagrams, rendered **client-side** via a small `<Mermaid>` Astro component (bundled mermaid). Diagrams authored inside MD/MDX.
- Source MD/MDX lives under `docs/src/content/docs/`; Starlight renders it. Design assets that aren't docs (dashboard mockup, brand config, docs-site visual spec) live under `design/`.

## Consequences

- Diagrams are text → editable in any editor or another tool/Claude session.
- Client-side rendering keeps the build light (no Puppeteer/Chromium at build time); build-time SVG can be added later if needed.
- MkDocs Material was rejected in favor of Starlight (more modern, JS/MDX component model, better DX for this monorepo).
