// Keeps the screen on while the drive mode runs. A phone that locks its
// screen suspends the page: the GPS watch stops and so does the voice, which
// is the whole point of the mode. The browser drops a screen wake lock by
// itself whenever the tab is hidden, so the lock is asked for again when the
// tab comes back. Browsers without the Wake Lock API (or a page that may not
// use it) simply go without: the drive mode works, the screen just may sleep.

export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private requesting = false;

  acquire(): void {
    if (!isSupported() || this.wanted) {
      return;
    }
    this.wanted = true;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    void this.request();
  }

  release(): void {
    if (!this.wanted) {
      return;
    }
    this.wanted = false;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    const sentinel = this.sentinel;
    this.sentinel = null;
    sentinel?.release().catch(() => {});
  }

  private onVisibilityChange = (): void => {
    if (this.wanted && document.visibilityState === "visible" && !this.sentinel) {
      void this.request();
    }
  };

  private async request(): Promise<void> {
    if (this.requesting) {
      return;
    }
    this.requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (!this.wanted) {
        // The drive ended while the request was in flight.
        sentinel.release().catch(() => {});
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (this.sentinel === sentinel) {
          this.sentinel = null;
        }
      });
    } catch {
      // Battery saver, a hidden tab, a refusing browser: the next
      // visibilitychange asks again; nothing here is worth interrupting a drive.
    } finally {
      this.requesting = false;
    }
  }
}

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof document !== "undefined" &&
    "wakeLock" in navigator
  );
}
