export const STORE_URLS = {
  appStore: "https://apps.apple.com/app/id6737742923",
  googlePlay: "https://play.google.com/store/apps/details?id=com.egoriku.grodnoroads",
} as const;

export const BANNER_DISMISS_KEY = "app-banner-dismissed-at";
export const BANNER_DISMISS_DAYS = 7;

// Safari's ITP wipes script-written localStorage after 7 days, so the 7-day
// TTL matches what the storage can honor anyway; Chrome keeps the full TTL.
export function isBannerDismissed(storage: Storage): boolean {
  try {
    const raw = storage.getItem(BANNER_DISMISS_KEY);
    if (!raw) {
      return false;
    }
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) {
      return false;
    }
    return Date.now() - dismissedAt < BANNER_DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissBanner(storage: Storage): void {
  try {
    storage.setItem(BANNER_DISMISS_KEY, String(Date.now()));
  } catch {
    // private mode / storage quota — the banner just comes back next visit
  }
  notifyBannerListeners();
}

// localStorage is external state, so the banner visibility flows through
// useSyncExternalStore instead of a setState-in-effect (which the lint rules
// rightly flag as a cascading render).
const bannerListeners = new Set<() => void>();

export function subscribeBannerDismissal(onChange: () => void): () => void {
  bannerListeners.add(onChange);
  return () => {
    bannerListeners.delete(onChange);
  };
}

function notifyBannerListeners(): void {
  for (const listener of bannerListeners) {
    listener();
  }
}
