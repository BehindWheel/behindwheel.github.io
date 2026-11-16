# behindwheel.github.io

Public map of the [Grodno Roads](https://github.com/BehindWheel) app data:
stationary speed cameras, medium-speed camera sections and road repairs, rendered
on an interactive MapLibre map. Published at https://behindwheel.github.io/.

## How it works

- **Next.js static export** (`output: "export"`): GitHub Pages serves the `out/`
  directory produced by `npm run build` — no server, everything renders client-side.
- **Data is fetched live** from the public CDN (`https://cdn-data.behindwheel.workers.dev`):
  `manifest.json` first, then the three feature files, each verified against the
  sha256 the manifest carries. The CDN sets `max-age=0, must-revalidate` + ETag, so
  the browser revalidates on every visit (304 when nothing changed) and the site
  always shows fresh data — no rebuild needed. The data contract is documented in
  the pipeline repo, `docs/integrations/cdn.md`.
- **MapLibre GL JS 6.x + OpenFreeMap Liberty** basemap (free, no API key).
- **PWA**: a web manifest plus an offline service worker — the app shell and the
  last CDN snapshot survive a dropped connection; map tiles are not cached.

## Drive mode

The car icon (bottom-left) starts the web counterpart of the mobile app's
navigation mode: the browser watches GPS, an arrow marker rides the map while
the camera follows, and the alert engine warns about cameras ahead — the same
corridor, camera-angle and road-cross-track logic the app uses
(`lib/alerts/`, ported from the KMP guidance feature, tested against the
app's test cases). At or above a nearest camera's limit a traffic-sign
overlay shows the limit and a voice prompt plays; camera warnings play the
camera phrase followed by the limit phrase, at most once per camera per five
minutes.

The voice prompts in `public/audio/` are pre-rendered with
[ZONOS3-Mini](https://github.com/Zyphra/ZONOS3-Mini) (the ggml CPU build,
one speaker embedding), so the drive mode speaks without any runtime TTS —
the same architecture as the app's bundled phrases.

## Development

```bash
npm install
npm run dev       # http://localhost:3000
npm run lint      # eslint
npm test          # vitest — the lib/ helpers
npm run build     # static export into out/
```

To check the production build locally, serve the export (and let the service
worker register — it only does so on a production build):

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
