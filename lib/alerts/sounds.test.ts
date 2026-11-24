import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertSoundController } from "./sounds";

// The phrase player against a scriptable audio element: playback is allowed
// or refused per test, and a phrase ends only when the test says so.
let elements: FakeAudio[];
let refuse: boolean;
let log: string[];

class FakeAudio {
  src = "";
  volume = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    elements.push(this);
  }
  play() {
    if (refuse) {
      return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    }
    if (!this.src.startsWith("data:")) {
      log.push(this.src);
    }
    return Promise.resolve();
  }
  pause() {}
  end() {
    this.onended?.();
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AlertSoundController", () => {
  beforeEach(() => {
    elements = [];
    log = [];
    refuse = false;
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays the camera phrase, then the limit phrase, on one element", async () => {
    const sound = new AlertSoundController();
    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    expect(log).toEqual(["/audio/stationary_camera.mp3"]);

    elements[0].end();
    await flush();
    expect(log).toEqual(["/audio/stationary_camera.mp3", "/audio/limit_60.mp3"]);
    // The unlock element is the phrase element: one gesture-unlocked player.
    expect(elements).toHaveLength(1);
  });

  it("does not queue the same camera twice while its phrase is still playing", async () => {
    const sound = new AlertSoundController();
    sound.playCameraLimit("cam-1", 60, "stationary");
    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    elements[0].end();
    await flush();
    elements[0].end();
    await flush();
    expect(log).toEqual(["/audio/stationary_camera.mp3", "/audio/limit_60.mp3"]);
  });

  it("gives a refused phrase its id back so the next fix can retry it", async () => {
    const sound = new AlertSoundController();
    refuse = true;
    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    expect(log).toEqual([]);

    // Autoplay is allowed from now on (the driver tapped something): the
    // same camera warns on the very next fix instead of waiting five minutes.
    refuse = false;
    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    expect(log).toEqual(["/audio/stationary_camera.mp3"]);
  });

  it("keeps the queue going after a refused phrase", async () => {
    const sound = new AlertSoundController();
    refuse = true;
    // Two phrases queue behind each other; the first is refused, and the
    // second must still be attempted rather than stuck behind a dead entry.
    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    refuse = false;
    sound.playCameraLimit("cam-2", 80, "mobile");
    await flush();
    expect(log[0]).toBe("/audio/mobile_camera.mp3");
  });

  it("skips a phrase that fails to load without retrying it", async () => {
    const sound = new AlertSoundController();
    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    elements[0].onerror?.();
    await flush();
    // The limit phrase follows the broken one.
    expect(log).toEqual(["/audio/stationary_camera.mp3", "/audio/limit_60.mp3"]);

    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    elements[0].end();
    await flush();
    expect(log).toHaveLength(2);
  });

  it("stop() drops the queue and ignores a late end of the old phrase", async () => {
    const sound = new AlertSoundController();
    sound.playCameraLimit("cam-1", 60, "stationary");
    await flush();
    const old = elements[0];
    const lateEnd = old.onended;
    sound.stop();
    lateEnd?.();
    await flush();
    expect(log).toEqual(["/audio/stationary_camera.mp3"]);
  });

  it("unlock() plays a silent clip that is not logged as a phrase", async () => {
    const sound = new AlertSoundController();
    sound.unlock();
    await flush();
    expect(elements).toHaveLength(1);
    expect(elements[0].src.startsWith("data:audio/wav")).toBe(true);
    expect(log).toEqual([]);
  });
});
