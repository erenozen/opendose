// Build-time constants (vite.config.ts `define`).
declare const __ENGINE_HASH__: string;
declare const __PYODIDE_VERSION__: string;

/** Hash of the engine's Python files: versions the engine download, so
 *  a browser or the offline cache never mixes old Python with new pages. */
export const ENGINE_HASH = typeof __ENGINE_HASH__ === "string" ? __ENGINE_HASH__ : "dev";
export const PYODIDE_VERSION = typeof __PYODIDE_VERSION__ === "string" ? __PYODIDE_VERSION__ : "0";
export const BASE_URL: string = import.meta.env.BASE_URL;
