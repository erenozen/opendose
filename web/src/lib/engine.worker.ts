// The analysis engine's own thread: loads the real CPython + NumPy + SciPy
// (Pyodide) and the same opendose package the native test suite validates,
// then answers analysis requests one at a time. Running here instead of on
// the page keeps typing, scrolling and the Cancel button responsive while
// a long fit runs. Protocol: engineProtocol.ts; the page side:
// engineClient.ts.
//
// Boot is arranged for the shortest critical path: the package wheels
// (NumPy, SciPy) and the engine's Python files start downloading at once,
// in parallel with the Python runtime itself, instead of after it; the
// byte counts drive the loading screen's progress bar. openpyxl (xlsx
// import only) is installed the first time an xlsx file is read.
import { loadPyodide, version as pyodideVersion } from "pyodide";
import type {
  BootConfig, BootPhase, RuntimeVersions, WorkerRequest, WorkerResponse,
} from "./engineProtocol";

interface Scope {
  postMessage(m: WorkerResponse): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  fetch: typeof fetch;
}
const scope = globalThis as unknown as Scope;
const post = (m: WorkerResponse) => scope.postMessage(m);

// ------------------------------------------------------------- downloads

const marks: Record<string, number> = {};
const mark = (name: string) => { marks[name] ??= Math.round(performance.now()); };

/** Decompressed sizes of the large downloads (Pyodide 314), used when
 *  the server does not say (compressed transfers carry the compressed
 *  length). Only for the progress bar. */
const EXPECTED: [RegExp, number][] = [
  [/pyodide\.asm\.wasm$/, 9.6e6],
  [/python_stdlib\.zip$/, 2.55e6],
  [/scipy-[^/]*\.whl$/, 14.0e6],
  [/numpy-[^/]*\.whl$/, 2.92e6],
  [/pyodide-lock\.json$/, 0.11e6],
  [/bundle\.json(\?|$)/, 1.4e6],
];
const TOTAL = EXPECTED.reduce((a, [, n]) => a + n, 0);
const received = new Map<string, number>();
let phase: BootPhase = "download";
let message = "Downloading the scientific runtime…";
let lastPost = 0;
let booted = false;

function expectedFor(url: string): number {
  return EXPECTED.find(([re]) => re.test(url))?.[1] ?? 0;
}

function loadedBytes(): number {
  let n = 0;
  for (const [url, got] of received) n += Math.min(got, expectedFor(url));
  return n;
}

function report(force = false) {
  if (booted) return;
  const now = performance.now();
  if (!force && now - lastPost < 120) return;
  lastPost = now;
  post({ type: "progress", progress: { phase, message, loaded: loadedBytes(), total: TOTAL } });
}

function setPhase(p: BootPhase, m: string) {
  phase = p;
  message = m;
  report(true);
}

const nativeFetch = globalThis.fetch.bind(globalThis);

function urlOf(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

/** fetch() that counts the bytes of the large downloads as they arrive. */
async function countedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = urlOf(input);
  const name = url.replace(/[?#].*$/, "").split("/").pop() ?? url;
  mark(`fetch ${name}`);
  const resp = await nativeFetch(input, init);
  if (booted || !resp.body || !expectedFor(url)) return resp;
  received.set(url, 0);
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      received.set(url, (received.get(url) ?? 0) + chunk.byteLength);
      report();
      ctl.enqueue(chunk);
    },
    flush() { mark(`done ${name}`); },
  });
  return new Response(resp.body.pipeThrough(counter), {
    headers: resp.headers, status: resp.status, statusText: resp.statusText,
  });
}

interface Prefetched { body: ArrayBuffer; headers: Headers; status: number; statusText: string }
/** Downloads started ahead of Pyodide asking for them; Pyodide's own
 *  fetch of the same URL is answered from here (no second download). */
const prefetched = new Map<string, Promise<Prefetched>>();

function prefetch(url: string, init?: RequestInit): Promise<Prefetched> {
  let p = prefetched.get(url);
  if (!p) {
    p = countedFetch(url, init).then(async (r) => ({
      body: await r.arrayBuffer(), headers: r.headers, status: r.status, statusText: r.statusText,
    }));
    prefetched.set(url, p);
    p.catch(() => prefetched.delete(url)); // Pyodide then fetches it itself
  }
  return p;
}

scope.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const pre = prefetched.get(urlOf(input));
  if (pre) {
    return pre.then(
      (r) => new Response(r.body.slice(0), { headers: r.headers, status: r.status, statusText: r.statusText }),
      () => countedFetch(input, init),
    );
  }
  return countedFetch(input, init);
};

interface LockPackage { file_name: string; sha256?: string; depends?: string[] }

/** The wheels `names` need, dependencies included, from pyodide-lock.json. */
function wheelsFor(lock: { packages: Record<string, LockPackage> }, names: string[]): LockPackage[] {
  const out = new Map<string, LockPackage>();
  const visit = (n: string) => {
    const p = lock.packages[n];
    if (!p || out.has(n)) return;
    out.set(n, p);
    for (const d of p.depends ?? []) visit(d);
  };
  names.forEach(visit);
  return [...out.values()];
}

function sriOf(hex: string | undefined): string | undefined {
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return undefined;
  let bin = "";
  for (let i = 0; i < 64; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return `sha256-${btoa(bin)}`;
}

/** The engine's Python files. A static host answering a missing file with
 *  its index page (HTTP 200) must not end up in Python's filesystem. */
async function fetchEngine(url: string): Promise<Record<string, string>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const resp = await scope.fetch(url, attempt ? { cache: "reload" } : undefined);
      const text = resp.ok ? await resp.text() : "";
      if (resp.ok && !/^\s*</.test(text)) {
        const files = (JSON.parse(text) as { files?: Record<string, string> }).files;
        if (files && Object.keys(files).length) return files;
      }
      if (attempt >= 2) {
        throw new Error(resp.ok ? "the server returned a web page instead of the engine files"
          : `HTTP ${resp.status}`);
      }
    } catch (e) {
      if (attempt >= 2) throw new Error(`could not load the engine files (${e instanceof Error ? e.message : e})`);
    }
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
}

// ------------------------------------------------------------------ Python

type Py = Awaited<ReturnType<typeof loadPyodide>>;
let py: Py | null = null;
let analyzeJson: ((s: string) => string) | null = null;

async function boot(cfg: BootConfig) {
  const t0 = performance.now();
  setPhase("download", "Downloading the scientific runtime…");
  const engineFiles = fetchEngine(cfg.engineURL);
  engineFiles.catch(() => { /* reported below, when awaited */ });
  // The lock file names the wheels: fetch them now, while the runtime
  // itself downloads and starts.
  prefetch(`${cfg.indexURL}pyodide-lock.json`)
    .then((r) => JSON.parse(new TextDecoder().decode(r.body)))
    .then((lock) => {
      for (const w of wheelsFor(lock, cfg.packages)) {
        const integrity = sriOf(w.sha256);
        prefetch(`${cfg.indexURL}${w.file_name}`, integrity ? { integrity } : undefined)
          .catch(() => { /* Pyodide retries it itself */ });
      }
    })
    .catch(() => { /* Pyodide fetches the lock file itself */ });

  mark("boot");
  // -OO: SciPy skips building ~100 distribution docstrings at import
  // (about a fifth of the engine's start-up). Only docstrings and asserts
  // are affected; the engine's native test suite passes under -OO.
  const runtime = await loadPyodide({ indexURL: cfg.indexURL, env: { PYTHONOPTIMIZE: "2" } });
  mark("python started");
  setPhase("packages", "Loading NumPy + SciPy…");
  await runtime.loadPackage(cfg.packages, { messageCallback: () => {} });
  mark("packages loaded");
  setPhase("engine", "Installing the analysis engine…");
  const files = await engineFiles;
  runtime.FS.mkdirTree("/app/opendose");
  for (const [name, text] of Object.entries(files)) {
    if (/^[\w.]+\.py$/.test(name)) runtime.FS.writeFile(`/app/opendose/${name}`, text);
  }
  runtime.runPython('import sys\nsys.path.insert(0, "/app")\nfrom opendose.api import analyze_json');
  const fn = runtime.globals.get("analyze_json") as (s: string) => string;
  mark("engine imported");
  let versions: RuntimeVersions | null = null;
  try {
    versions = {
      ...JSON.parse(runtime.runPython(
        "import json, sys, numpy, scipy\n"
        + 'json.dumps({"python": sys.version.split()[0], '
        + '"numpy": numpy.__version__, "scipy": scipy.__version__})') as string),
      pyodide: pyodideVersion,
    };
  } catch { /* informational only */ }
  let models: string | null = null;
  try {
    models = fn(JSON.stringify({ analysis: "list_models", data: {}, options: {} }));
  } catch { /* the page keeps its built-in list */ }
  py = runtime;
  analyzeJson = fn;
  booted = true;
  prefetched.clear();
  received.clear();
  mark("ready");
  post({ type: "ready", versions, models, bootMs: Math.round(performance.now() - t0), marks });
}

let openpyxl: Promise<void> | null = null;
/** openpyxl is pure Python and not part of the Pyodide distribution;
 *  only xlsx reading needs it, so it is installed on first use. */
function ensureOpenpyxl(runtime: Py): Promise<void> {
  openpyxl ??= (async () => {
    await runtime.loadPackage("micropip", { messageCallback: () => {} });
    const micropip = runtime.pyimport("micropip");
    try { await micropip.install("openpyxl"); } finally { micropip.destroy?.(); }
  })().catch((e) => {
    openpyxl = null;
    throw new Error(`could not install the xlsx reader (${e instanceof Error ? e.message : e})`);
  });
  return openpyxl;
}

const READ_XLSX_PY = `
import datetime, json
def _opendose_read_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    out = []
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            cells = []
            for v in row:
                if v is None:
                    cells.append("")
                elif isinstance(v, bool):
                    cells.append("TRUE" if v else "FALSE")
                elif isinstance(v, datetime.datetime):
                    cells.append(v.date().isoformat() if v.time() == datetime.time(0)
                                 else v.isoformat(sep=" ", timespec="minutes"))
                elif isinstance(v, (datetime.date, datetime.time)):
                    cells.append(v.isoformat())
                elif isinstance(v, float):
                    cells.append(str(int(v)) if v.is_integer() and abs(v) < 1e15
                                 else repr(v))
                else:
                    cells.append(str(v))
            while cells and cells[-1] == "":
                cells.pop()
            rows.append(cells)
        while rows and not rows[-1]:
            rows.pop()
        out.append({"name": ws.title, "rows": rows})
    wb.close()
    return json.dumps(out)
`;
let xlsxReader: ((path: string) => string) | null = null;

async function analyze(payload: string): Promise<string> {
  if (!py || !analyzeJson) throw new Error("the analysis engine is not ready");
  if (payload.includes('"xlsx_b64"')) await ensureOpenpyxl(py);
  return analyzeJson(payload);
}

async function readXlsx(bytes: Uint8Array): Promise<string> {
  if (!py) throw new Error("the analysis engine is not ready");
  await ensureOpenpyxl(py);
  if (!xlsxReader) {
    py.runPython(READ_XLSX_PY);
    xlsxReader = py.globals.get("_opendose_read_xlsx") as (path: string) => string;
  }
  const path = "/tmp/opendose-import.xlsx";
  py.FS.writeFile(path, bytes);
  try { return xlsxReader(path); } finally {
    try { py.FS.unlink(path); } catch { /* already gone */ }
  }
}

// --------------------------------------------------------------- messages

let chain: Promise<void> = Promise.resolve();

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "boot") {
    boot(msg.config).catch((err) => {
      post({ type: "bootError", message: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  // Jobs run strictly one after another (the page sends one at a time;
  // this keeps the worker correct even if it did not).
  chain = chain.then(async () => {
    const t0 = performance.now();
    try {
      let json: string;
      if (msg.type === "analyze") json = await analyze(msg.payload);
      else if (msg.type === "readXlsx") json = await readXlsx(msg.bytes);
      else {
        if (!py) throw new Error("the analysis engine is not ready");
        await ensureOpenpyxl(py);
        json = "{}";
      }
      post({ type: "result", id: msg.id, ok: true, json, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      post({
        type: "result", id: msg.id, ok: false,
        message: err instanceof Error ? err.message : String(err),
        ms: Math.round(performance.now() - t0),
      });
    }
  });
};
