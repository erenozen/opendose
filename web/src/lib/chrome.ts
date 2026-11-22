// Plot chrome colours: the one JS source for the colours Plotly draws
// around the data (paper, text, grid, axes).
//
// On screen, plots follow the app's tokens (styles/tokens.css), resolved
// here to sRGB because Plotly and the exporters cannot read oklch() or
// CSS custom properties. lib/__tests__/chrome.test.ts recomputes these
// from tokens.css and fails on any drift.
//
// Exported figures keep their own pinned chrome (ruling 10): every
// export starts from the live figure and export/figure.ts maps the
// screen chrome to these values, so a token retune never changes a file
// a user exports.

export interface Chrome {
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  /** Tinted bands (standard-curve range and the like). */
  accentSoft: string;
  danger: string;
}

/** --surface, --ink, --ink-2, --muted, --grid, --axis, --accent-soft and
 *  --danger in the light theme. */
export const SCREEN_CHROME_LIGHT: Chrome = {
  surface: "#fcfdff",
  ink: "#12161b",
  inkSecondary: "#393e43",
  muted: "#595e64",
  grid: "#dbdee2",
  axis: "#babec3",
  accentSoft: "rgba(8,93,199,0.08)",
  danger: "#c2181d",
};

/** The same tokens in the dark theme. */
export const SCREEN_CHROME_DARK: Chrome = {
  surface: "#13161b",
  ink: "#f0f2f4",
  inkSecondary: "#c7cbd0",
  muted: "#a7abb1",
  grid: "#282c30",
  axis: "#4c5055",
  accentSoft: "rgba(110,168,255,0.14)",
  danger: "#f97770",
};

/** Chrome of exported figures on white paper. Pinned: do not retune. */
export const EXPORT_CHROME_LIGHT: Chrome = {
  surface: "#ffffff",
  ink: "#1d1d1f",
  inkSecondary: "#424245",
  muted: "#6e6e73",
  grid: "#e5e5ea",
  axis: "#c7c7cc",
  accentSoft: "rgba(0,113,227,0.07)",
  danger: "#d70015",
};

/** Chrome of figures exported from the dark theme without paper colours.
 *  Pinned: do not retune. */
export const EXPORT_CHROME_DARK: Chrome = {
  surface: "#1c1c1e",
  ink: "#f5f5f7",
  inkSecondary: "#aeaeb5",
  muted: "#98989f",
  grid: "#38383a",
  axis: "#48484a",
  accentSoft: "rgba(41,151,255,0.10)",
  danger: "#ff6961",
};

/** The header background per scheme (--surface), for the theme-color
 *  meta tags that colour the browser chrome. */
export const THEME_COLOR = { light: "#fcfdff", dark: "#13161b" } as const;
