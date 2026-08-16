// Plot color schemes.
//
// Every palette below was run through the dataviz validator rather than
// chosen by eye. Dose-response and column graphs are scatter/line charts
// where any two series can end up adjacent, so they are checked with
// --pairs all (every pair), not just neighbouring slots.
//
// That check has a hard result worth stating: the OKLCH lightness band a
// mark must sit in to stay legible on its surface (L 0.43-0.77 light,
// 0.48-0.67 dark) only holds about six mutually distinguishable hues in
// light mode and four in dark. Eight is not achievable, and no re-ordering
// makes it so. So each scheme carries as many validated slots as its mode
// allows, and past that colors repeat while the marker symbol keeps going:
// SYMBOLS is 7 long, coprime with both 6 and 4, so the colour+symbol pair
// stays unique through 42 series in light mode and 28 in dark.
//
// Symbols are not decoration. They are the secondary encoding the CVD
// checks require, and they are what makes the black-and-white scheme work
// at all.

export type SchemeId = "default" | "colorblind" | "mono" | "sequential";

export interface Scheme {
  id: SchemeId;
  label: string;
  /** One line, shown under the picker: when to reach for this. */
  note: string;
  light: string[];
  dark: string[];
  /** Vary the line dash per slot, not just the symbol. */
  varyDash: boolean;
}

export const SCHEMES: Record<SchemeId, Scheme> = {
  // all-pairs clean in both modes
  default: {
    id: "default",
    label: "Default",
    note: "Six distinct hues, checked so no two series look alike.",
    light: ["#2a78d6", "#eb6834", "#1baf7a", "#c43f8f", "#4a3aa7", "#9c5a1e"],
    dark: ["#3987e5", "#e2701f", "#1baf7a", "#c43f8f"],
    varyDash: false,
  },
  // Okabe-Ito, with its black dropped (outside the band, no chroma) and its
  // pale yellow re-stepped; light order checked adjacent, dark all-pairs.
  colorblind: {
    id: "colorblind",
    label: "Colorblind safe",
    note: "Separable under deuteranopia, protanopia and tritanopia.",
    light: ["#0072B2", "#D55E00", "#009E73", "#E69F00", "#762A83", "#56B4E9",
            "#CC79A7"],
    dark: ["#3d95d6", "#e2701f", "#1baf7a", "#9d4aad"],
    varyDash: false,
  },
  // Achromatic on purpose: identity comes from symbol and dash alone, which
  // is what a journal that charges for color figures needs.
  mono: {
    id: "mono",
    label: "Black and white",
    note: "For print. Series differ by symbol and line style, not color.",
    light: ["#000000"],
    dark: ["#f5f5f7"],
    varyDash: true,
  },
  // Single-hue ramp: passes the ordinal checks (monotone lightness, adjacent
  // gaps, both ends clear of the surface). For series that have an order.
  sequential: {
    id: "sequential",
    label: "Sequential blue",
    note: "For ordered series such as timepoints or dose groups.",
    light: ["#8fb8e4", "#5f95d2", "#3a76bd", "#24589c", "#183f72", "#0f2c4f"],
    dark: ["#e8f1fc", "#c2daf3", "#96bced", "#6a9ddd", "#4a7ec6", "#3260a4"],
    varyDash: false,
  },
};

export const SCHEME_LIST: Scheme[] = [
  SCHEMES.default, SCHEMES.colorblind, SCHEMES.mono, SCHEMES.sequential,
];

export const DEFAULT_SCHEME: SchemeId = "default";

export function isSchemeId(v: unknown): v is SchemeId {
  return typeof v === "string" && v in SCHEMES;
}

// Plotly marker symbols. Filled shapes only, so a small marker still reads
// at print size; ordered so the first few are maximally different.
const SYMBOLS = [
  "circle", "square", "diamond", "triangle-up", "triangle-down",
  "star", "hexagon",
];

// Plotly dash patterns, used when a scheme cannot rely on hue.
const DASHES = [
  "solid", "dash", "dot", "dashdot", "longdash", "longdashdot", "2px,3px",
];

export interface SeriesStyle {
  color: string;
  symbol: string;
  dash: string;
}

export function seriesStyle(
  index: number, dark: boolean, scheme: SchemeId = DEFAULT_SCHEME,
): SeriesStyle {
  const s = SCHEMES[scheme] ?? SCHEMES[DEFAULT_SCHEME];
  const colors = dark ? s.dark : s.light;
  return {
    color: colors[index % colors.length],
    symbol: SYMBOLS[index % SYMBOLS.length],
    dash: s.varyDash ? DASHES[index % DASHES.length] : "solid",
  };
}

export function seriesColor(
  index: number, dark: boolean, scheme: SchemeId = DEFAULT_SCHEME,
): string {
  return seriesStyle(index, dark, scheme).color;
}

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
