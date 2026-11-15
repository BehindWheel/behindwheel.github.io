import { describe, expect, it, vi } from "vitest";
import {
  BANNER_DISMISS_DAYS,
  BANNER_DISMISS_KEY,
  dismissBanner,
  isBannerDismissed,
} from "./appBanner";

class MemStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function storageWith(key: string, value: string | null): Storage {
  const storage = new MemStorage();
  if (value !== null) {
    storage.setItem(key, value);
  }
  return storage as unknown as Storage;
}

describe("isBannerDismissed", () => {
  it("is visible without a stored dismissal", () => {
    expect(isBannerDismissed(storageWith(BANNER_DISMISS_KEY, null))).toBe(false);
  });

  it("stays dismissed within the TTL", () => {
    const dismissedAt = Date.now() - (BANNER_DISMISS_DAYS - 1) * 24 * 60 * 60 * 1000;
    expect(isBannerDismissed(storageWith(BANNER_DISMISS_KEY, String(dismissedAt)))).toBe(
      true,
    );
  });

  it("brings the banner back after the TTL", () => {
    const dismissedAt = Date.now() - (BANNER_DISMISS_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(isBannerDismissed(storageWith(BANNER_DISMISS_KEY, String(dismissedAt)))).toBe(
      false,
    );
  });

  it("is visible on a malformed timestamp", () => {
    expect(isBannerDismissed(storageWith(BANNER_DISMISS_KEY, "not a number"))).toBe(
      false,
    );
  });
});

describe("dismissBanner", () => {
  it("writes the current time and hides the banner", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const storage = new MemStorage();
    dismissBanner(storage as unknown as Storage);
    expect(storage.getItem(BANNER_DISMISS_KEY)).toBe("1700000000000");
    expect(isBannerDismissed(storage as unknown as Storage)).toBe(true);
    vi.restoreAllMocks();
  });
});
