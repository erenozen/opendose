// The on-screen plot chrome (lib/chrome.ts) is styles/tokens.css resolved
// to sRGB: Plotly and the exporters cannot read oklch() or custom
// properties, so the hex copy must follow every token retune. This test
// fails on drift; fix it by updating lib/chrome.ts with the printed values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  EXPORT_CHROME_DARK, EXPORT_CHROME_LIGHT, SCREEN_CHROME_DARK, SCREEN_CHROME_LIGHT, THEME_COLOR,
  type Chrome,
} from "../chrome.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const tokensCss = read("../../styles/tokens.css");

/** oklch(L C H [/ A]) -> "#rrggbb" or "rgba(r,g,b,a)", sRGB, clamped. */
function oklchToCss(value: string): string {
  const m = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/);
  if (!m) throw new Error(`not an oklch() colour: ${value}`);
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const rgb = lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  if (m[4] !== undefined) return `rgba(${rgb.join(",")},${Number(m[4])})`;
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** A token's light and dark values from `--name: light-dark(a, b);`. */
function token(name: string): { light: string; dark: string } {
  const m = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} not found in tokens.css`);
  const v = m[1].trim();
  const pair = v.match(/^light-dark\((oklch\([^)]*\)),\s*(oklch\([^)]*\))\)$/);
  if (pair) return { light: oklchToCss(pair[1]), dark: oklchToCss(pair[2]) };
  const one = oklchToCss(v);
  return { light: one, dark: one };
}

const TOKEN_OF: Record<keyof Chrome, string> = {
  surface: "surface", ink: "ink", inkSecondary: "ink-2", muted: "muted",
  grid: "grid", axis: "axis", accentSoft: "accent-soft", danger: "danger",
};

test("on-screen plot chrome equals styles/tokens.css", () => {
  const want = { light: {} as Chrome, dark: {} as Chrome };
  for (const [key, name] of Object.entries(TOKEN_OF) as [keyof Chrome, string][]) {
    const t = token(name);
    want.light[key] = t.light;
    want.dark[key] = t.dark;
  }
  assert.deepEqual(SCREEN_CHROME_LIGHT, want.light, "SCREEN_CHROME_LIGHT drifted from tokens.css");
  assert.deepEqual(SCREEN_CHROME_DARK, want.dark, "SCREEN_CHROME_DARK drifted from tokens.css");
});

test("theme-color is the header background (--surface), in chrome.ts and index.html", () => {
  const surface = token("surface");
  assert.deepEqual(THEME_COLOR, { light: surface.light, dark: surface.dark });
  const html = read("../../../index.html");
  for (const scheme of ["light", "dark"] as const) {
    const meta = html.match(new RegExp(
      `<meta name="theme-color" media="\\(prefers-color-scheme: ${scheme}\\)" content="([^"]+)"`));
    assert.equal(meta?.[1], THEME_COLOR[scheme], `index.html theme-color (${scheme})`);
    assert.ok(html.includes(`"${THEME_COLOR[scheme]}"`), `pre-paint script colour (${scheme})`);
  }
});

test("the pre-paint theme script is allowed by the Content-Security-Policy", () => {
  const html = read("../../../index.html");
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, "inline pre-paint script in index.html");
  const hash = createHash("sha256").update(script[1]).digest("base64");
  const headers = read("../../../public/_headers");
  assert.ok(headers.includes(`'sha256-${hash}'`),
    `public/_headers script-src needs 'sha256-${hash}'`);
});

test("export chrome stays pinned (ruling 10)", () => {
  assert.deepEqual(EXPORT_CHROME_LIGHT, {
    surface: "#ffffff", ink: "#1d1d1f", inkSecondary: "#424245", muted: "#6e6e73",
    grid: "#e5e5ea", axis: "#c7c7cc", accentSoft: "rgba(0,113,227,0.07)", danger: "#d70015",
  });
  assert.deepEqual(EXPORT_CHROME_DARK, {
    surface: "#1c1c1e", ink: "#f5f5f7", inkSecondary: "#aeaeb5", muted: "#98989f",
    grid: "#38383a", axis: "#48484a", accentSoft: "rgba(41,151,255,0.10)", danger: "#ff6961",
  });
});

test("screen chrome colours never collide with each other or a series colour", async () => {
  // export/figure.ts maps screen chrome to export chrome by colour value,
  // so a chrome value shared with a data colour would be rewritten too.
  const { SCHEMES } = await import("../palette.ts");
  const series = new Set(Object.values(SCHEMES).flatMap((s) => [...s.light, ...s.dark])
    .map((c) => c.toLowerCase()));
  const chrome = [...Object.values(SCREEN_CHROME_LIGHT), ...Object.values(SCREEN_CHROME_DARK)]
    .map((c) => c.toLowerCase());
  assert.equal(new Set(chrome).size, chrome.length, "two chrome roles share a colour");
  for (const c of chrome) assert.ok(!series.has(c), `chrome ${c} is also a series colour`);
});
