import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenWakeLock } from "./wakeLock";

class FakeSentinel {
  released = false;
  private listeners: (() => void)[] = [];
  addEventListener(_name: string, cb: () => void) {
    this.listeners.push(cb);
  }
  release() {
    this.released = true;
    return Promise.resolve();
  }
  // The browser drops the lock on its own when the tab is hidden.
  dropByBrowser() {
    this.listeners.forEach((cb) => cb());
  }
}

let sentinels: FakeSentinel[];
let visibility: "visible" | "hidden";
let visibilityListener: (() => void) | null;
let reject: boolean;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ScreenWakeLock", () => {
  beforeEach(() => {
    sentinels = [];
    visibility = "visible";
    visibilityListener = null;
    reject = false;
    vi.stubGlobal("navigator", {
      wakeLock: {
        request: () => {
          if (reject) {
            return Promise.reject(new DOMException("denied", "NotAllowedError"));
          }
          const sentinel = new FakeSentinel();
          sentinels.push(sentinel);
          return Promise.resolve(sentinel);
        },
      },
    });
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_name: string, cb: () => void) => {
        visibilityListener = cb;
      },
      removeEventListener: () => {
        visibilityListener = null;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("takes the lock on acquire and gives it back on release", async () => {
    const lock = new ScreenWakeLock();
    lock.acquire();
    await flush();
    expect(sentinels).toHaveLength(1);
    expect(sentinels[0].released).toBe(false);

    lock.release();
    expect(sentinels[0].released).toBe(true);
    expect(visibilityListener).toBeNull();
  });

  it("asks again when the tab comes back after the browser dropped the lock", async () => {
    const lock = new ScreenWakeLock();
    lock.acquire();
    await flush();

    visibility = "hidden";
    sentinels[0].dropByBrowser();
    visibilityListener?.();
    await flush();
    // Hidden: nothing to ask yet.
    expect(sentinels).toHaveLength(1);

    visibility = "visible";
    visibilityListener?.();
    await flush();
    expect(sentinels).toHaveLength(2);
    lock.release();
  });

  it("does not stack a second lock while the first is still held", async () => {
    const lock = new ScreenWakeLock();
    lock.acquire();
    await flush();
    visibilityListener?.();
    await flush();
    expect(sentinels).toHaveLength(1);
    lock.release();
  });

  it("releases a lock that arrives after the drive already ended", async () => {
    const lock = new ScreenWakeLock();
    lock.acquire();
    lock.release();
    await flush();
    expect(sentinels).toHaveLength(1);
    expect(sentinels[0].released).toBe(true);
  });

  it("goes without when the browser refuses or lacks the API", async () => {
    reject = true;
    const refused = new ScreenWakeLock();
    refused.acquire();
    await flush();
    expect(sentinels).toHaveLength(0);
    refused.release();

    vi.stubGlobal("navigator", {});
    const unsupported = new ScreenWakeLock();
    expect(() => {
      unsupported.acquire();
      unsupported.release();
    }).not.toThrow();
  });
});
