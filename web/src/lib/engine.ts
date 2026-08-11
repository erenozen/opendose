// Pyodide bridge: loads the real CPython + scipy in the browser and runs
// the same prism_engine package that the native test suite validates.
import { loadPyodide, version as pyodideVersion } from "pyodide";

export interface EngineBridge {
  analyze: (payload: unknown) => unknown;
}

let enginePromise: Promise<EngineBridge> | null = null;

export function getEngine(
  onStatus: (msg: string) => void = () => {},
): Promise<EngineBridge> {
  if (!enginePromise) {
    enginePromise = init(onStatus).catch((err) => {
      enginePromise = null; // allow retry after transient network failure
      throw err;
    });
  }
  return enginePromise;
}

// Dev/SPA servers answer missing files with index.html and HTTP 200, so a
// bad deploy or a fetch racing the sync-py copy would silently write HTML
// into the Python filesystem and die later with a confusing SyntaxError.
// Validate what came back and retry (bypassing caches) before giving up.
async function fetchAsset(url: string, name: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(url, attempt ? { cache: "reload" } : undefined);
    const text = resp.ok ? await resp.text() : "";
    const looksHtml = /^\s*<(!doctype|html)/i.test(text);
    if (resp.ok && text && !looksHtml) return text;
    if (attempt >= 2) {
      throw new Error(`could not load engine file "${name}"` +
        (looksHtml
          ? " (the server returned a web page instead of the file)"
          : ` (HTTP ${resp.status})`));
    }
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
}

async function init(onStatus: (msg: string) => void): Promise<EngineBridge> {
  onStatus("Downloading Python runtime…");
  const py = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
  });
  onStatus("Loading NumPy + SciPy…");
  await py.loadPackage(["numpy", "scipy", "micropip"]);
  // openpyxl (xlsx plate import) is pure Python; not bundled with Pyodide
  const micropip = py.pyimport("micropip");
  await micropip.install("openpyxl");

  onStatus("Installing analysis engine…");
  py.FS.mkdirTree("/app/prism_engine");
  const pyFiles: string[] = JSON.parse(await fetchAsset(
    `${import.meta.env.BASE_URL}py/prism_engine/manifest.json`,
    "manifest.json",
  ));
  await Promise.all(
    pyFiles.map(async (name) => {
      const text = await fetchAsset(
        `${import.meta.env.BASE_URL}py/prism_engine/${name}`, name);
      py.FS.writeFile(`/app/prism_engine/${name}`, text);
    }),
  );
  py.runPython(
    'import sys\nsys.path.insert(0, "/app")\nfrom prism_engine.api import analyze_json',
  );
  const analyzeJson = py.globals.get("analyze_json");

  return {
    analyze(payload: unknown) {
      return JSON.parse(analyzeJson(JSON.stringify(payload)) as string);
    },
  };
}
