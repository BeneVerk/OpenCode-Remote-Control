# Docs-site visual system

How the Astro Starlight documentation site looks and feels. The implementation
lives in `docs/src/styles/custom.css` + `docs/astro.config.mjs`; this is the spec.

## Principles

- **Calm control-room** — dark-first, low-glare, generous whitespace, one accent.
- **Readable first** — body type ≥ 16px / 1.7 line-height; diagrams centered + scrollable.
- **On-brand with the dashboard** — same accent + status palette as `brand.config.json`.

## Palette (mirrors `brand.config.json`)

| Token | Value | Use |
| --- | --- | --- |
| `--sl-color-accent` | `#58a6ff` | links, focus, active nav |
| `--sl-color-accent-low` | `#1f6feb` | hover backgrounds |
| `--sl-color-accent-high` | `#a5c8ff` | muted accent text |
| green / red / amber | `#3fb950` / `#f85149` / `#d29922` | status (online/offline/waiting) in diagrams + prose |

## Typography

- **Sans:** Inter (system fallback) for UI + body.
- **Mono:** JetBrains Mono / SFMono / Consolas for code.
- Starlight defaults are overridden via `--sl-font` / `--sl-font-mono`.

## Diagrams (Mermaid)

- Rendered **client-side** via `docs/src/components/Mermaid.astro` (bundled mermaid, dark theme).
- Diagrams sit in a bordered, rounded surface with horizontal scroll on overflow
  (`--sl-color-gray-7` background, `--sl-color-gray-5` border).
- Theme variables pin Mermaid's primary/line colors to the fleet palette so diagrams
  match the docs chrome.

## Layout + responsiveness

- Starlight defaults (sticky top nav, sidebar, in-page outline, search).
- Fluid breakpoints: the dashboard targets phone → desktop, portrait + landscape;
  the docs site inherits Starlight's responsive shell.

## Dark / light

- Dark is default (matches the dashboard + the "control-room" feel).
- Light theme overrides are defined under `[data-theme="light"]` tokens; Starlight's
  theme toggle switches at runtime.

## Build-time vs client-side rendering

Mermaid currently renders client-side (lightweight build, no Puppeteer/Chromium at
build time). A build-time SVG pass (`rehype-mermaid` with `inline-svg` strategy) can
be added later if LCP/SEO needs it — diagram source (MD/MDX) won't change.
