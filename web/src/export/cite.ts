// "How to cite OpenDose": the version stamp (injected at build time by
// vite.config.ts) plus the numerical libraries actually loaded in this
// browser, reported by the Python runtime once the engine has booted.
import type { RuntimeVersions } from "../lib/engine";

declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : "";
export const BUILD_DATE = typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "";
export const SITE_URL = "https://erenozen.dev/opendose/";
export const AUTHOR = { family: "Ozen", given: "Eren" };

/** "0.0.0 (build 3282bac, 2026-10-03)" */
export function versionLabel(): string {
  const extra = [BUILD_COMMIT && `build ${BUILD_COMMIT}`, BUILD_DATE].filter(Boolean);
  return extra.length ? `${APP_VERSION} (${extra.join(", ")})` : APP_VERSION;
}

/** "SciPy 1.14.1 and NumPy 2.0.2 (Python 3.12.7 in Pyodide 0.27.2)", or a
 *  version-free phrase before the engine has booted. */
export function librariesPhrase(v: RuntimeVersions | null): string {
  if (!v) return "SciPy and NumPy";
  return `SciPy ${v.scipy} and NumPy ${v.numpy} (Python ${v.python} in Pyodide ${v.pyodide})`;
}

/** Sentence for a methods section: which software did the computing. */
export function softwareSentence(v: RuntimeVersions | null): string {
  return `Analyses were performed in OpenDose version ${APP_VERSION} (${SITE_URL}), `
    + `free open-source software that computes with ${librariesPhrase(v)} in the web browser.`;
}

export interface Citation { plain: string; bibtex: string }

export function citation(v: RuntimeVersions | null, accessed = new Date()): Citation {
  const year = (BUILD_DATE || accessed.toISOString()).slice(0, 4);
  const day = accessed.toISOString().slice(0, 10);
  const build = BUILD_COMMIT ? `, build ${BUILD_COMMIT}` : "";
  const plain = `${AUTHOR.family} ${AUTHOR.given[0]}. OpenDose: curve fitting and `
    + `biostatistics in the browser. Version ${APP_VERSION}${build}. ${year}. `
    + `${SITE_URL} (accessed ${day}). Numerical libraries: ${librariesPhrase(v)}.`;
  const bibtex = [
    "@software{opendose,",
    `  author  = {${AUTHOR.family}, ${AUTHOR.given}},`,
    "  title   = {OpenDose: curve fitting and biostatistics in the browser},",
    `  version = {${APP_VERSION}${BUILD_COMMIT ? `+${BUILD_COMMIT}` : ""}},`,
    `  year    = {${year}},`,
    `  url     = {${SITE_URL}},`,
    `  urldate = {${day}},`,
    `  note    = {Computed with ${librariesPhrase(v)}}`,
    "}",
  ].join("\n");
  return { plain, bibtex };
}
