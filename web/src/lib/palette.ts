// Validated reference palette (dataviz skill, references/palette.md).
// Categorical slots in fixed order: never cycled, never re-ranked.
export const SERIES_LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
export const SERIES_DARK = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
];

export interface Chrome {
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
}

export const CHROME_LIGHT: Chrome = {
  surface: "#ffffff",
  ink: "#1d1d1f",
  inkSecondary: "#424245",
  muted: "#6e6e73",
  grid: "#e5e5ea",
  axis: "#c7c7cc",
};

export const CHROME_DARK: Chrome = {
  surface: "#1c1c1e",
  ink: "#f5f5f7",
  inkSecondary: "#aeaeb5",
  muted: "#98989f",
  grid: "#38383a",
  axis: "#48484a",
};

export const PLOT_FONT =
  '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

// The in-app theme toggle sets data-theme on <html>; absent means "follow
// the OS". Plot chrome must agree with the CSS tokens, so both consult it.
export function isDarkMode(): boolean {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light") return false;
  if (forced === "dark") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Fires on either source of theme change: the OS setting or the toggle
// (which dispatches "opendose-theme" after updating data-theme).
export function onThemeChange(cb: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  window.addEventListener("opendose-theme", cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener("opendose-theme", cb);
  };
}

export function seriesColor(index: number, dark: boolean): string {
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  return palette[index % palette.length];
}
