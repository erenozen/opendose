// Applying the theme preference (ruling 4: a theme switch never animates).
//
// The first paint already has the right theme: the inline script in
// index.html reads the stored preference and sets data-theme (and an
// inline color-scheme for the canvas) before any CSS loads. From then on
// this module owns it. styles/tokens.css writes every colour once as
// light-dark(), so data-theme only has to pick the color-scheme.
import { THEME_COLOR } from "../lib/chrome";

export type ThemePreference = "auto" | "light" | "dark";

/** Run a colour swap with every transition off, then turn them back on
 *  after the next frame has painted (double requestAnimationFrame). */
function withoutTransitions(swap: () => void): void {
  const root = document.documentElement;
  root.classList.add("no-transitions");
  swap();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.remove("no-transitions");
  }));
}

/** Point the browser chrome (status bar, tab strip) at the header colour
 *  of the theme in use: the forced one, or each meta's own scheme. */
function syncThemeColor(forced: "light" | "dark" | null): void {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = forced ?? (/dark/.test(meta.media) ? "dark" : "light");
    meta.content = THEME_COLOR[scheme];
  }
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  const forced = pref === "light" || pref === "dark" ? pref : null;
  // The pre-paint script's inline color-scheme only bridges the moment
  // before the stylesheet loads; from here the stylesheet decides, so the
  // print setup (usePrint) can still switch data-theme on its own.
  root.style.removeProperty("color-scheme");
  if ((root.dataset.theme ?? null) !== forced) {
    withoutTransitions(() => {
      if (forced) root.dataset.theme = forced;
      else delete root.dataset.theme;
    });
  }
  syncThemeColor(forced);
}

/** With the preference on auto, an OS light/dark change swaps every
 *  colour through CSS alone; keep that swap from animating too. */
export function watchSystemScheme(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (!document.documentElement.dataset.theme) withoutTransitions(() => {});
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
