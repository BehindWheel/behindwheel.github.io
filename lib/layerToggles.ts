import type { LayerToggles } from "@/lib/map/marker-tiers";

// The layer toggles ride localStorage like the theme and the banner: an
// explicit choice survives reloads. A missing, malformed or unreadable key
// falls back to everything on — the map never boots half-empty.
const STORAGE_KEY = "layer-toggles";

const DEFAULT_TOGGLES: LayerToggles = {
  stationary: true,
  mediumSpeed: true,
  repairs: true,
};

export function loadToggles(storage: Storage): LayerToggles {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_TOGGLES };
    }
    const parsed = JSON.parse(raw) as Partial<LayerToggles> | null;
    return {
      stationary: parsed?.stationary ?? true,
      mediumSpeed: parsed?.mediumSpeed ?? true,
      repairs: parsed?.repairs ?? true,
    };
  } catch {
    return { ...DEFAULT_TOGGLES };
  }
}

export function saveToggles(storage: Storage, toggles: LayerToggles): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(toggles));
  } catch {
    // private mode / storage quota — the choice just doesn't survive
  }
}
