import { expect, test } from "@playwright/test";
import { CAMERA_TITLES, DRIVE_START_LABEL, DRIVE_STOP_LABEL, GPS_ERROR_DENIED } from "../lib/alerts/messages";
import { pickOneSidedCamera, pickSection, pickStationary } from "./support/cdn";
import { buildFixes } from "./support/track";
import { audioLog, ensureMapReady, installStubs, pump } from "./support/page";

// The drive-mode e2e suite: real Chromium over the production export, a fake
// GPS feed, an instrumented audio element. The map, the markers, the CDN
// data and the voice files are the real page; only the geolocation feed and
// (when playback is unavailable) the phrase completion are stubbed.

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

// The two tests below run on the browser's own geolocation — no GPS_STUB, no
// audio spy: the permission flow and the real position object are what the
// stub fakes everywhere else. Playwright's setGeolocation carries only
// coordinates (no speed, no heading), so these two cover the plumbing —
// permission, first fix, marker, camera, error — and the stubbed tests keep
// the driving scenarios that need a speed.
const REAL_FIX = { latitude: 53.647197, longitude: 23.810971, accuracy: 10 };

test("a granted browser permission puts the arrow on the real fix", async ({ page }) => {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation(REAL_FIX);
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();

  // The first real fix: the arrow appears, no error pill, and the follow
  // camera centres the map on it.
  await expect(page.locator(".drive-marker")).toHaveCount(1);
  await expect(page.locator(".drive-gps-error")).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const [marker, map] = await Promise.all([
          page.locator(".drive-marker").boundingBox(),
          page.locator(".maplibregl-map").boundingBox(),
        ]);
        if (!marker || !map) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.hypot(
          marker.x + marker.width / 2 - (map.x + map.width / 2),
          marker.y + marker.height / 2 - (map.y + map.height / 2),
        );
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(5);

  // Stopping hands the display back, same as with the stub.
  await page.getByRole("button", { name: DRIVE_STOP_LABEL }).click();
  await expect(page.locator(".drive-marker")).toHaveCount(0);
  await expect(page.locator(".maplibregl-ctrl-geolocate")).toHaveCount(1);
});

test("a browser that refuses the permission names it in the pill", async ({ page }) => {
  // No grantPermissions: the context's geolocation permission is not given,
  // and the browser answers the watch with its own PERMISSION_DENIED.
  await page.context().setGeolocation(REAL_FIX);
  await page.goto("/");
  await ensureMapReady(page);

  await page.getByRole("button", { name: DRIVE_START_LABEL }).click();

  await expect(page.locator(".drive-gps-error")).toHaveText(GPS_ERROR_DENIED);
  await expect(page.locator(".drive-marker")).toHaveCount(0);
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

  // A media element asks for a byte range, and Safari insists on a 206: the
  // worker cuts it from the whole cached file.
  const ranged = await page.evaluate(async () => {
    const res = await fetch("/audio/stationary_camera.mp3", {
      headers: { Range: "bytes=0-99" },
    });
    return {
      status: res.status,
      length: (await res.arrayBuffer()).byteLength,
      contentRange: res.headers.get("content-range"),
    };
  });
  expect(ranged.status).toBe(206);
  expect(ranged.length).toBe(100);
  expect(ranged.contentRange).toMatch(/^bytes 0-99\/\d+$/);
  await page.context().setOffline(false);
});
