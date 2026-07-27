# Design — Opencode Remote Fleet

Source-of-truth design assets, **kept separate from the rendered docs site** so they
can be edited externally (any editor / another Claude session) and re-synced.

## Layout

```
design/
  brand.config.json     # brand definition (name, logo, palette, asset list) — single source of truth
  brand.schema.json     # JSON schema for the config above (validates values)
  dashboard/            # the aggregator UI as a standalone, no-build HTML/CSS/JS mockup
    index.html, styles.css, app.js
  architecture/         # (rendered in the docs site) — see docs/src/content/docs/architecture/
  docs-site/            # the Starlight docs-site visual system spec
    visual-system.md
```

> The architecture diagrams + ADRs live as MD/MDX under
> `docs/src/content/docs/` (source MD rendered by Astro Starlight). They are the
> "documentation design" source; this folder holds everything that is **not** a doc
> page — the dashboard mockup, the brand config, and the docs-site visual spec.

## Brand config

`brand.config.json` is the single source of truth for branding. Both the dashboard
and the docs site read from it (the dashboard via a loader; the docs site via
`src/styles/custom.css` mirroring the palette).

- **Light vs heavy assets:** `assets.light` (favicon, primary logo) are loaded
  eagerly; `assets.heavy` (large hero/video) are lazy-loaded (`loading="lazy"` /
  intersection observer) so the UI paints fast.
- **Logo `load`: `"light"`** means the light/primary logo is loaded first; the dark
  variant is swapped in only when the active theme is dark — supporting the
  "light first, heavy later" rule.

To rebrand: edit `brand.config.json` (and drop asset files into `/brand/...` of the
serving Worker / docs site). No code changes required.

## Dashboard mockup

`design/dashboard/` is a **standalone** page — open `index.html` directly in a
browser; no server, no build. Sample data is hard-coded in `app.js` for design
iteration. The real Worker-served dashboard (`packages/dashboard`) will implement
this look 1:1, fed by `/api/machines`.

## Iterating externally

Everything here is text or plain web files. Edit, preview locally, then sync back —
the dashboard mockup and brand config drive the real UI without touching app logic.
