import { expect, test, type Page } from "@playwright/test";
import type { StationaryCamera } from "../lib/cdn";
import { CAMERA_TITLES, DRIVE_START_LABEL } from "../lib/alerts/messages";

// The full drive-mode journey on the production export: a fake GPS feed
// approaches a real camera from the live CDN and the test asserts the whole
// chain the driver experiences — the alert card, the over-speed sign and the
// voice queue (camera phrase, then the limit phrase, then the over-speed
// one). The map, the markers and the audio are the real page; only the
// geolocation feed and the phrase playback completion are stubbed.
const CDN = "https://cdn-data.behindwheel.workers.dev";
// The drive speed hardcoded in the GPS stub: fast enough to exceed any
// camera limit the fixture picks, so the over-speed face and phrase join
// the sequence.

type TestCamera = {
  id: string;
  lat: number;
  lng: number;
  angle: number;
  speedLimit: number;
};

async function pickCamera(): Promise<TestCamera> {
  // A stationary camera the test can approach on its own road: the facing
  // angle known (the approach drives opposite to it) and a limit the drive
  // actually exceeds (40..75 at 80 km/h).
  const manifest = (await (await fetch(`${CDN}/manifest.json`)).json()) as {
    features: Record<string, { url: string }>;
  };
  const { items } = (await (await fetch(`${CDN}${manifest.features.stationary.url}`)).json()) as {
    items: StationaryCamera[];
  };
  const usable = items
    .filter((c) => c.point && c.speedCar >= 40 && c.speedCar <= 75)
    .filter((c) => c.bidirectional || (c.angle >= 0 && c.angle <= 360));
  if (usable.length === 0) {
    throw new Error("the live CDN carries no camera the e2e can approach");
  }
  // The first by id — deterministic across runs with the same snapshot.
  const cam = usable.sort((a, b) => a.id.localeCompare(b.id))[0];
  return {
    id: cam.id,
    lat: cam.point.lat,
    lng: cam.point.lng,
    angle: cam.angle,
    speedLimit: cam.speedCar,
  };
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

test("approaching a camera plays the voice warning chain", async ({ page }) => {
  // The paced demo runs ~30 s of real phrase playback; the default 30 s
  // test timeout is too tight for it.
  test.setTimeout(90_000);
  const cam = await pickCamera();
  const stepMs = Number(process.env.E2E_STEP_MS ?? 0);

  await page.addInitScript(
    ({ lat, lng, angle }) => {
      const camPoint = { lat, lng };
      const rad = (d: number) => (d * Math.PI) / 180;
      const w = window as unknown as Record<string, unknown>;

      // The voice spy: every phrase the queue constructs is recorded. When
      // playback really works (a headed run with sound), the queue advances
      // on the file's own `ended` — the phrases play sequentially, never
      // overlapping. When playback is unavailable (autoplay rejection, a
      // codec gap), the spy simulates the shortest possible phrase so the
      // queue still advances headless.
      const played: string[] = [];
      w.__audio = played;
      const NativeAudio = window.Audio;
      class SpyAudio extends NativeAudio {
        constructor(src: string) {
          super(src);
          played.push(src);
        }
        play(): Promise<void> {
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
              // A backstop for a stream that never ends; longer than the
              // longest phrase file.
              setTimeout(finish, 10_000);
            },
            () => {
              setTimeout(() => this.dispatchEvent(new Event("ended")), 30);
              return Promise.resolve();
            },
          );
        }
      }
      window.Audio = SpyAudio as unknown as typeof Audio;

      // The GPS stub: the session registers its watcher here, and the test
      // advances the drive by calling __pump() — one 30 m step per call at
      // 80 km/h on the camera's road axis.
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          watchPosition(ok: (p: GeolocationPosition) => void) {
            w.__driveFix = ok;
            return 1;
          },
          clearWatch() {
            w.__driveFix = null;
          },
          getCurrentPosition(ok: (p: GeolocationPosition) => void) {
            if (w.__lastFix) ok(w.__lastFix as GeolocationPosition);
          },
        },
      });

      w.__lastFix = null;
      let toGo = 650;
      w.__pump = () => {
        toGo = Math.max(toGo - 30, 25);
        const at = {
          lat: camPoint.lat + (Math.cos(rad(angle)) * toGo) / 111320,
          lng:
            camPoint.lng +
            (Math.sin(rad(angle)) * toGo) / (111320 * Math.cos(rad(camPoint.lat))),
        };
        w.__lastFix = {
          coords: {
            latitude: at.lat,
            longitude: at.lng,
            heading: (angle + 180) % 360,
            speed: 80 / 3.6,
            accuracy: 5,
          },
          timestamp: Date.now(),
        };
        const fix = w.__driveFix as ((p: GeolocationPosition) => void) | null;
        if (fix) fix(w.__lastFix as GeolocationPosition);
        return Math.round(toGo);
      };
    },
    { lat: cam.lat, lng: cam.lng, angle: cam.angle },
  );

  await page.goto("/");
  await ensureMapReady(page);

  // Silence until the drive starts.
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__audio)).toEqual(
    [],
  );

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();

  // Approach: 650 m out at 80 km/h, one 30 m fix per call — the alert zone
  // opens at 600 m, so the card, the sign and the phrases appear mid-drive.
  for (let i = 0; i < 22; i++) {
    await page.evaluate(() =>
      (window as unknown as { __pump?: () => number }).__pump?.(),
    );
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
    .poll(() =>
      page.evaluate(() => (window as unknown as { __audio: string[] }).__audio),
    { timeout: 60_000 })
    .toEqual(stepMs > 0 ? [...chain, "/audio/sound_over_speed.mp3"] : chain);

  // Cruising past the camera keeps the voice quiet — the played-alert
  // tracker allows one warning per camera per five minutes.
  const played = await page.evaluate(
    () => (window as unknown as { __audio: string[] }).__audio,
  );
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() =>
      (window as unknown as { __pump?: () => number }).__pump?.(),
    );
  }
  expect(
    await page.evaluate(() => (window as unknown as { __audio: string[] }).__audio),
  ).toEqual(played);
});
