# behindwheel.github.io

Public map of the [Grodno Roads](https://github.com/BehindWheel) app data:
stationary speed cameras, medium-speed camera sections and road repairs, rendered
on an interactive MapLibre map. Published at https://behindwheel.github.io/.

## How it works

- **Next.js static export** (`output: "export"`): GitHub Pages serves the `out/`
  directory produced by `npm run build` — no server, everything renders client-side.
- **Data is fetched live** from the public CDN (`https://cdn-data.behindwheel.workers.dev`):
  `manifest.json` first, then the three feature files. The CDN sets
  `max-age=0, must-revalidate` + ETag, so the browser revalidates on every visit
  (304 when nothing changed) and the site always shows fresh data — no rebuild needed.
  The data contract is documented in the pipeline repo, `docs/integrations/cdn.md`.
- **MapLibre GL JS 5.x + OpenFreeMap Liberty** basemap (free, no API key), with an
  optional Esri World Imagery satellite toggle.

## Development

```bash
npm install
npm run dev       # http://localhost:3000
npm run lint      # eslint
npm run build     # static export into out/
```

To check the production build locally, serve the export:

```bash
npx serve out
```

## Deployment

Pushes to `main` deploy automatically to GitHub Pages (`.github/workflows/deploy.yml`).
Changes land through PRs: CI runs eslint, type check and the production build on every
pull request; merge to `main` triggers the Pages deploy.

MapLibre note: it stamps its own `.maplibregl-map` class (with `position: relative`)
onto the container element, so the container positioning rule needs a higher-specificity
selector than a bare class (`div.map-container` in `app/globals.css`) or the container
collapses to zero height and the map renders black.
