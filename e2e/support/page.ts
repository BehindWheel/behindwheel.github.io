// The page-side stubs and helpers: the audio spy and the GPS stub installed
// before the page loads, the map-ready wait, and the handles the tests read.

import type { Page } from "@playwright/test";
import type { GpsFix } from "./track";

// The voice spy: every phrase the player starts is recorded (the silent
// unlock clip of the drive button's tap is not a phrase). The player reuses
// one element, so a phrase is logged when its play() starts, by the src
// attribute as the page wrote it. When playback really works (a headed run
// with sound), the queue advances on the file's own `ended` — the phrases
// play sequentially, never overlapping. When playback is unavailable
// (autoplay rejection, a codec gap), the spy simulates the shortest possible
// phrase so the queue still advances headless.
const AUDIO_SPY = `(() => {
  const played = [];
  window.__audio = played;
  const NativeAudio = window.Audio;
  class SpyAudio extends NativeAudio {
    play() {
      const src = this.getAttribute("src") || "";
      if (!src.startsWith("data:")) {
        played.push(src);
      }
      return super.play().then(
        () => {
          let done = false;
          const finish = () => {
            if (!done) {
              done = true;
              this.dispatchEvent(new Event("ended"));
            }
          };
          this.addEventListener("ended", finish, { once: true });
          setTimeout(finish, 10000);
        },
        () => {
          setTimeout(() => this.dispatchEvent(new Event("ended")), 30);
          return Promise.resolve();
        },
      );
    }
  }
  window.Audio = SpyAudio;
})();`;

// The GPS stub: the session registers its watcher here; the test advances
// the drive by calling window.__pump() — one precomputed fix per call —
// and can fire a failure through window.__failGps().
const GPS_STUB = `(() => {
  const fixes = window.__fixes;
  let index = 0;
  const gps = { ok: null, fail: null };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition(ok, fail) {
        gps.ok = ok;
        gps.fail = fail;
        return 1;
      },
      clearWatch() {
        gps.ok = null;
        gps.fail = null;
      },
      getCurrentPosition(ok) {
        if (gps.lastFix) ok(gps.lastFix);
      },
    },
  });
  window.__driveFix = null;
  window.__failGps = () =>
    gps.fail?.({ code: 1, PERMISSION_DENIED: 1, message: "denied by the test" });
  window.__pump = () => {
    index = Math.min(index + 1, fixes.length - 1);
    const fix = fixes[index];
    const position = {
      coords: {
        latitude: fix.lat,
        longitude: fix.lng,
        heading: fix.heading,
        speed: fix.speedMs,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
      },
      timestamp: Date.now(),
    };
    gps.lastFix = position;
    if (gps.ok) gps.ok(position);
    return index;
  };
})();`;

export async function installStubs(page: Page, fixes: GpsFix[]): Promise<void> {
  await page.addInitScript(
    `window.__fixes = ${JSON.stringify(fixes)};
     ${AUDIO_SPY}
     ${GPS_STUB}`,
  );
}

// The data pipeline waits for the map's `load` event; a network that stalls
// the style's glyphs can hold that event forever, so after a grace period
// the test fires it the way a healthy browser would and lets the pipeline
// run. On a healthy network the fallback never triggers.
export async function ensureMapReady(page: Page): Promise<void> {
  const ready = () =>
    page.evaluate(() =>
      document.querySelector(".data-pill")?.textContent?.includes("Данные от"),
    );
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && !(await ready())) {
    await page.waitForTimeout(500);
  }
  if (!(await ready())) {
    await page.evaluate(() => {
      const container = document.querySelector(".maplibregl-map");
      if (!container) return;
      const fiberKey = Object.keys(container).find((k) =>
        k.startsWith("__reactFiber"),
      );
      if (!fiberKey) return;
      for (let f = (container as never as Record<string, unknown>)[fiberKey] as {
        tag?: number;
        memoizedState?: unknown;
        return?: unknown;
      } | null; f; f = f.return as never) {
        if (f.tag !== 0 && f.tag !== 1) continue;
        for (
          let h = f.memoizedState as { memoizedState?: unknown; next?: unknown } | null;
          h;
          h = h.next as never
        ) {
          const v = h.memoizedState as { current?: { easeTo?: unknown } } | null;
          if (v?.current && typeof v.current.easeTo === "function") {
            (v.current as { fire: (name: string) => void }).fire("load");
            return;
          }
        }
      }
    });
    await page.waitForFunction(
      () =>
        document.querySelector(".data-pill")?.textContent?.includes("Данные от"),
      { timeout: 20_000 },
    );
  }
}

export const audioLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __audio: string[] }).__audio);

export const pump = (page: Page, times: number) =>
  page.evaluate((n) => {
    for (let i = 0; i < n; i++) {
      (window as unknown as { __pump?: () => number }).__pump?.();
    }
  }, times);
