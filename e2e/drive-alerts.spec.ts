import { expect, test, type Page } from "@playwright/test";
import type { MediumSpeedCamera, StationaryCamera } from "../lib/cdn";
import { computeOffset, type LatLng } from "../lib/alerts/geo";
import { CAMERA_TITLES, DRIVE_START_LABEL, DRIVE_STOP_LABEL, GPS_ERROR_DENIED } from "../lib/alerts/messages";

// The drive-mode e2e suite: real Chromium over the production export, a fake
// GPS feed, an instrumented audio element. The map, the markers, the CDN
// data and the voice files are the real page; only the geolocation feed and
// (when playback is unavailable) the phrase completion are stubbed.

const CDN = "https://cdn-data.behindwheel.workers.dev";
// The drive speed hardcoded into the fast fixtures: fast enough to exceed
// any camera limit the fixtures pick, so the over-speed face and phrase
// join the sequence.
const DRIVE_KMH = 80;

type GpsFix = { lat: number; lng: number; heading: number; speedMs: number };

type StationaryFixture = {
  id: string;
  point: LatLng;
  angle: number;
  bidirectional: boolean;
  speedLimit: number;
};

type SectionFixture = {
  id: string;
  end: LatLng;
  endAngle: number;
  speedLimit: number;
};

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

// The drive-mode strings the page reads are the same constants this suite
// asserts against; the fixtures below come from the live CDN.
async function fetchStationary(): Promise<StationaryCamera[]> {
  const manifest = (await (await fetch(`${CDN}/manifest.json`)).json()) as {
    features: Record<string, { url: string }>;
  };
  return (
    (await (await fetch(`${CDN}${manifest.features.stationary.url}`)).json()) as {
      items: StationaryCamera[];
    }
  ).items;
}

async function fetchSections(): Promise<MediumSpeedCamera[]> {
  const manifest = (await (await fetch(`${CDN}/manifest.json`)).json()) as {
    features: Record<string, { url: string }>;
  };
  return (
    (await (await fetch(`${CDN}${manifest.features["medium-speed"].url}`)).json()) as {
      items: MediumSpeedCamera[];
    }
  ).items;
}

async function pickStationary(): Promise<StationaryFixture> {
  // A camera the 80 km/h drive actually exceeds.
  const usable = (await fetchStationary()).filter(
    (c) => c.point && c.speedCar >= 40 && c.speedCar <= 75,
  );
  if (usable.length === 0) {
    throw new Error("the live CDN carries no camera the e2e can approach");
  }
  // The first by id — deterministic across runs with the same snapshot.
  const cam = usable.sort((a, b) => a.id.localeCompare(b.id))[0];
  return {
    id: cam.id,
    point: cam.point,
    angle: cam.angle,
    bidirectional: cam.bidirectional,
    speedLimit: cam.speedCar,
  };
}

async function pickOneSidedCamera(): Promise<StationaryFixture | null> {
  // A camera with a facing angle and no opposite lane — the only kind whose
  // angle check alone keeps a sideways crossing silent.
  const usable = (await fetchStationary()).filter(
    (c) => c.point && !c.bidirectional && c.angle !== -1,
  );
  const cam = usable.sort((a, b) => a.id.localeCompare(b.id))[0];
  return cam
    ? { id: cam.id, point: cam.point, angle: cam.angle, bidirectional: false, speedLimit: cam.speedCar }
    : null;
}

async function pickSection(): Promise<SectionFixture | null> {
  const usable = (await fetchSections()).filter(
    (s) => s.points.length > 0 && s.speedCar >= 40 && s.speedCar <= 75,
  );
  const section = usable.sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!section) {
    return null;
  }
  return {
    id: section.id,
    end: section.points[section.points.length - 1],
    endAngle: section.angleEnd,
    speedLimit: section.speedCar,
  };
}

// Precomputes the whole GPS track in Node: from 650 m short of the target on
// the approach bearing, 30 m per fix, clamped at 25 m like the app's dead
// zone. lateralM shifts the whole track sideways — the perpendicular
// crossing that only the angle check may reject.
function buildFixes(
  target: LatLng,
  bearing: number,
  opts: { lateralM?: number; speedKmh?: number; steps?: number } = {},
): GpsFix[] {
  const steps = opts.steps ?? 22;
  const speedMs = (opts.speedKmh ?? DRIVE_KMH) / 3.6;
  let at = computeOffset(target, 650, bearing + 180);
  if (opts.lateralM) {
    at = computeOffset(at, opts.lateralM, bearing + 90);
  }
  const fixes: GpsFix[] = [];
  for (let i = 0; i < steps; i++) {
    const fix = computeOffset(at, Math.min(i * 30, 625), bearing);
    fixes.push({ lat: fix.lat, lng: fix.lng, heading: bearing, speedMs });
  }
  return fixes;
}

async function installStubs(page: Page, fixes: GpsFix[]): Promise<void> {
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
async function ensureMapReady(page: Page): Promise<void> {
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

const audioLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __audio: string[] }).__audio);

const pump = (page: Page, times: number) =>
  page.evaluate((n) => {
    for (let i = 0; i < n; i++) {
      (window as unknown as { __pump?: () => number }).__pump?.();
    }
  }, times);

test("approaching a camera plays the voice warning chain", async ({ page }) => {
  // The paced demo runs ~30 s of real phrase playback; the default 30 s
  // test timeout is too tight for it.
  test.setTimeout(90_000);
  const cam = await pickStationary();
  const stepMs = Number(process.env.E2E_STEP_MS ?? 0);

  await installStubs(page, buildFixes(cam.point, (cam.angle + 180) % 360));
  await page.goto("/");
  await ensureMapReady(page);

  // Silence until the drive starts.
  expect(await audioLog(page)).toEqual([]);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();

  // Approach: the alert zone opens at 600 m, so the card, the sign and the
  // phrases appear mid-drive. E2E_STEP_MS paces the fixes for a watchable
  // headed demo; unset, the drive runs as fast as the assertions allow.
  for (let i = 0; i < 22; i++) {
    await pump(page, 1);
    if (stepMs > 0) {
      await page.waitForTimeout(stepMs);
    }
  }

  await expect(page.locator(".drive-card").first()).toContainText(
    CAMERA_TITLES.stationary,
  );
  await expect(page.locator(".speed-sign")).toHaveText(String(cam.speedLimit));

  // The phrase sequence: camera phrase, then the limit phrase, then the
  // over-speed one. A paced run (E2E_STEP_MS) stretches the drive past the
  // tracker's five seconds, so the Regular → Double transition at the 150 m
  // mark re-warns — the app's over-speed semantics, worth asserting too.
  const chain = [
    "/audio/stationary_camera.mp3",
    `/audio/limit_${cam.speedLimit}.mp3`,
    "/audio/sound_over_speed.mp3",
  ];
  await expect
    .poll(() => audioLog(page), { timeout: 60_000 })
    .toEqual(stepMs > 0 ? [...chain, "/audio/sound_over_speed.mp3"] : chain);

  // Cruising past the camera keeps the voice quiet — the played-alert
  // tracker allows one warning per camera per five minutes.
  const played = await audioLog(page);
  await pump(page, 6);
  expect(await audioLog(page)).toEqual(played);
});

test("stopping the drive hands the position display back", async ({ page }) => {
  const cam = await pickStationary();
  await installStubs(page, buildFixes(cam.point, (cam.angle + 180) % 360));
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await pump(page, 1);
  await expect(page.locator(".drive-marker")).toHaveCount(1);
  await expect(page.locator(".maplibregl-ctrl-geolocate")).toHaveCount(0);

  await page.getByRole("button", { name: DRIVE_STOP_LABEL }).click();

  // The arrow, the cards and the sign go away; the "where am I" control
  // returns; the toggle reads as off.
  await expect(page.locator(".drive-marker")).toHaveCount(0);
  await expect(page.locator(".drive-cards")).toHaveCount(0);
  await expect(page.locator(".speed-sign")).toHaveCount(0);
  await expect(page.locator(".maplibregl-ctrl-geolocate")).toHaveCount(1);

  // The stopped session is deaf: the stub's fixes never reach it, so the
  // voice stays quiet and no marker comes back.
  await pump(page, 5);
  await expect(page.locator(".drive-marker")).toHaveCount(0);
  expect(await audioLog(page)).toEqual([]);
});

test("crawling past a camera stays silent", async ({ page }) => {
  const cam = await pickStationary();
  // 5 km/h — under the app's 10 km/h gate, everything else identical.
  await installStubs(
    page,
    buildFixes(cam.point, (cam.angle + 180) % 360, { speedKmh: 5 }),
  );
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await pump(page, 22);

  await expect(page.locator(".drive-cards")).toHaveCount(0);
  await expect(page.locator(".speed-sign")).toHaveCount(0);
  expect(await audioLog(page)).toEqual([]);
});

test("crossing the camera road sideways stays silent", async ({ page }) => {
  const cam = await pickOneSidedCamera();
  test.skip(!cam, "the live CDN snapshot has no one-sided camera");
  if (!cam) {
    return;
  }
  // A perpendicular crossing 250 m off the camera: inside the corridor
  // radius, so only the angle check (±25° opposite to the facing) can —
  // and must — keep it silent.
  const travelBearing = (cam.angle + 90) % 360;
  await installStubs(
    page,
    buildFixes(cam.point, travelBearing, { lateralM: 250, steps: 17 }),
  );
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await pump(page, 17);

  await expect(page.locator(".drive-cards")).toHaveCount(0);
  await expect(page.locator(".speed-sign")).toHaveCount(0);
  expect(await audioLog(page)).toEqual([]);
});

test("approaching a medium-speed section warns with its voice", async ({ page }) => {
  const section = await pickSection();
  test.skip(!section, "the live CDN snapshot has no medium-speed section");
  if (!section) {
    return;
  }
  await installStubs(
    page,
    buildFixes(section.end, (section.endAngle + 180) % 360),
  );
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await pump(page, 22);

  await expect(page.locator(".drive-card").first()).toContainText(
    CAMERA_TITLES.mediumSpeed,
  );
  await expect
    .poll(() => audioLog(page), { timeout: 30_000 })
    .toEqual([
      "/audio/medium_speed_camera.mp3",
      `/audio/limit_${section.speedLimit}.mp3`,
      "/audio/sound_over_speed.mp3",
    ]);
});

test("the over-speed sign clears when the driver slows down", async ({ page }) => {
  const cam = await pickStationary();
  // The approach at 80 km/h, then the same road at 40 — under the limit's
  // +2 allowance, so the over-speed state falls back to none.
  const fixes = buildFixes(cam.point, (cam.angle + 180) % 360, { steps: 23 });
  // The slow tail starts at fix 20: the sign check stands on fix 19 (80 m
  // out at 80 km/h), the slow fixes then clear the over-speed state.
  for (let i = 20; i < fixes.length; i++) {
    fixes[i].speedMs = 40 / 3.6;
  }
  await installStubs(page, fixes);
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await pump(page, 19);
  await expect(page.locator(".speed-sign")).toHaveText(String(cam.speedLimit));

  await pump(page, 4);
  await expect(page.locator(".speed-sign")).toHaveCount(0);
  // The alert itself stays: the camera is still inside the radius.
  await expect(page.locator(".drive-card").first()).toContainText(
    CAMERA_TITLES.stationary,
  );
});

test("a GPS failure names itself in the pill", async ({ page }) => {
  const cam = await pickStationary();
  await installStubs(page, buildFixes(cam.point, (cam.angle + 180) % 360));
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await expect(page.locator(".drive-gps-error")).toHaveCount(0);

  // A denied permission: the pill names it instead of failing silently.
  await page.evaluate(() =>
    (window as unknown as { __failGps?: () => void }).__failGps?.(),
  );
  await expect(page.locator(".drive-gps-error")).toHaveText(GPS_ERROR_DENIED);

  // The first good fix clears it and drives the marker.
  await pump(page, 1);
  await expect(page.locator(".drive-gps-error")).toHaveCount(0);
  await expect(page.locator(".drive-marker")).toHaveCount(1);
});

test("a reload during the drive lands on a clean map", async ({ page }) => {
  const cam = await pickStationary();
  await installStubs(page, buildFixes(cam.point, (cam.angle + 180) % 360));
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await pump(page, 1);
  await page.reload();
  await ensureMapReady(page);

  // A fresh page: the drive is off, the position display is the control's
  // again, and nothing of the old session leaked into the new one.
  await expect(
    page.getByRole("button", { name: DRIVE_START_LABEL }),
  ).toHaveCount(1);
  await expect(page.locator(".maplibregl-ctrl-geolocate")).toHaveCount(1);
  await expect(page.locator(".drive-marker")).toHaveCount(0);
  await expect(page.locator(".drive-cards")).toHaveCount(0);
});

test("the offline shell keeps the drive voice available", async ({ page }) => {
  test.setTimeout(90_000);
  const cam = await pickStationary();
  await installStubs(page, buildFixes(cam.point, (cam.angle + 180) % 360));
  await page.goto("/");
  await ensureMapReady(page);

  // The service worker takes control, then a fully SW-served reload fills
  // the caches (the shell, the data snapshot, the audio).
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();
  await pump(page, 22);
  await expect(page.locator(".drive-card").first()).toContainText(
    CAMERA_TITLES.stationary,
  );
  await expect
    .poll(() => audioLog(page), { timeout: 30_000 })
    .toContain("/audio/stationary_camera.mp3");

  // Offline, the drive mode still works: the cached shell boots, the cached
  // data snapshot renders, and the cached phrases are fetchable.
  await page.context().setOffline(true);
  await page.reload();
  await ensureMapReady(page);

  await expect(
    page.getByRole("button", { name: DRIVE_START_LABEL }),
  ).toHaveCount(1);
  const status = await page.evaluate(async () => {
    const res = await fetch("/audio/stationary_camera.mp3");
    return res.status;
  });
  expect(status).toBe(200);
  await page.context().setOffline(false);
});
