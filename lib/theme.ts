// The theme store: the user's explicit choice rides localStorage ("light" /
// "dark"); with no choice the device's prefers-color-scheme wins. The
// resolved theme lives in <html data-theme> — the inline head script in
// layout.tsx stamps it before the first paint to avoid a token flash, and
// every dark-surface style keys off the attribute.
export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const THEME_EVENT = "themechange";
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return darkScheme.matches ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

// Fires on an explicit choice and on a device scheme flip while the choice
// is unset — the map and the toggle subscribe to both.
export function onThemeChange(listener: () => void): () => void {
  const onChange = () => listener();
  window.addEventListener(THEME_EVENT, onChange);
  darkScheme.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    darkScheme.removeEventListener("change", onChange);
  };
}
