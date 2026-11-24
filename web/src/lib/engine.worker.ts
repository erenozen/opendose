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
// byte counts drive the loading screen's progress bar. The workbook
// readers (openpyxl for .xlsx, xlrd for .xls) are installed the first time
// a file of their format is read.
import { loadPyodide, version as pyodideVersion } from "pyodide";
import pyodideExtras from "./pyodideExtras.json";
import { xlsxFlags, type SheetFlags } from "./xlsxFlags";
import type { XlsxSheet } from "./engine";
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
/** The Pyodide folder on this site (BootConfig.indexURL). */
let indexURL = "";
let analyzeJson: ((s: string) => string) | null = null;
/** opendose.api.StepJob: an analysis run in steps (a bootstrap). */
interface StepJob { step(): string | undefined; result(): string; destroy(): void }
let stepJob: ((s: string) => StepJob) | null = null;

async function boot(cfg: BootConfig) {
  indexURL = cfg.indexURL;
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
  // packageBaseUrl too: without it Pyodide's loader falls back to its CDN
  // for packages; everything comes from this site.
  const runtime = await loadPyodide({
    indexURL: cfg.indexURL, packageBaseUrl: cfg.indexURL, env: { PYTHONOPTIMIZE: "2" },
  });
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
  runtime.runPython('import sys\nsys.path.insert(0, "/app")\nfrom opendose.api import analyze_json, StepJob');
  const fn = runtime.globals.get("analyze_json") as (s: string) => string;
  stepJob = runtime.globals.get("StepJob") as (s: string) => StepJob;
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

type WorkbookFormat = "xlsx" | "xls" | "ods";

const extras = new Map<string, Promise<void>>();
/** The workbook readers' wheels (openpyxl for .xlsx, xlrd for .xls) are
 *  pure Python and not part of the Pyodide distribution; each is
 *  installed the first time a file of its format is read, from the wheels
 *  this site serves next to Pyodide (pyodideExtras.json). .ods needs none. */
function ensureReader(runtime: Py, format: WorkbookFormat): Promise<void> {
  const wheels = pyodideExtras.wheels.filter((w) => w.for === format);
  if (!wheels.length) return Promise.resolve();
  let p = extras.get(format);
  if (!p) {
    p = (async () => {
      await runtime.loadPackage(wheels.map((w) => indexURL + w.file), { messageCallback: () => {} });
    })().catch((e) => {
      extras.delete(format);
      throw new Error(`could not install the .${format} reader (${e instanceof Error ? e.message : e})`);
    });
    extras.set(format, p);
  }
  return p;
}

let workbookReader: ((path: string, format: string) => string) | null = null;

/** Requests that run in steps (opendose.api.StepJob): a curve fit with
 *  bootstrap CIs. Every other request is one call. */
const STEPPED = /"ci_method":\s*"bootstrap"/;
/** Jobs the page asked to stop: checked between two steps. */
const stops = new Set<number>();
let current: number | null = null;

async function analyze(id: number, payload: string): Promise<string> {
  if (!py || !analyzeJson) throw new Error("the analysis engine is not ready");
  if (payload.includes('"xlsx_b64"')) await ensureReader(py, "xlsx");
  if (!stepJob || !STEPPED.test(payload)) return analyzeJson(payload);
  // Seconds of refits: run them a chunk at a time, report progress after
  // each, and read messages in between, so a stop ends the job at the
  // next chunk instead of retiring the worker.
  const job = stepJob(payload);
  try {
    for (;;) {
      if (stops.has(id)) throw new Error("stopped");
      const p = job.step();
      if (p == null) return job.result();
      const { done, total, what } = JSON.parse(p) as { done: number; total: number; what?: string };
      post({ type: "jobProgress", id, done, total, what });
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    job.destroy();
  }
}

/** Every sheet of a workbook, read by engine/opendose/workbooks.py. */
async function readWorkbook(bytes: Uint8Array, format: WorkbookFormat): Promise<string> {
  if (!py) throw new Error("the analysis engine is not ready");
  await ensureReader(py, format);
  if (!workbookReader) {
    py.runPython("from opendose.workbooks import read_workbook as _opendose_read_workbook");
    workbookReader = py.globals.get("_opendose_read_workbook") as (path: string, format: string) => string;
  }
  const path = `/tmp/opendose-import.${format}`;
  py.FS.writeFile(path, bytes);
  let json: string;
  try {
    json = workbookReader(path, format);
  } catch (e) {
    // a Python traceback: its last line says what went wrong
    const last = String(e instanceof Error ? e.message : e).trim().split("\n").pop() ?? "";
    throw new Error(`it is not a readable .${format} workbook (${last.replace(/^[\w.]*(Error|Exception): /, "")})`);
  } finally {
    try { py.FS.unlink(path); } catch { /* already gone */ }
  }
  // .xls and .ods carry their own hidden-row flags; .xlsx gets them here
  return format === "xlsx" ? withFlags(json, bytes) : json;
}

/** The reader reads cached values only: add what they hide (formulas
 *  saved without a value, rows hidden in Excel) from the sheet XML. A
 *  workbook whose XML cannot be scanned still imports, with flags null so
 *  the dialog says it could not check. */
function withFlags(json: string, bytes: Uint8Array): string {
  const sheets = JSON.parse(json) as XlsxSheet[];
  let flags: Map<string, SheetFlags> | null = null;
  try { flags = xlsxFlags(bytes); } catch { /* reported per sheet as null */ }
  for (const s of sheets) {
    const f = flags?.get(s.name);
    const index = (rows: number[]) => rows.map((r) => r - 1).filter((i) => i >= 0 && i < s.rows.length);
    s.flags = f ? { filterHidden: index(f.filterHidden), manualHidden: index(f.manualHidden),
      blankFormulas: f.blankFormulas } : null;
  }
  return JSON.stringify(sheets);
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
  if (msg.type === "stop") {
    if (msg.id === current) stops.add(msg.id);
    return;
  }
  // Jobs run strictly one after another (the page sends one at a time;
  // this keeps the worker correct even if it did not).
  chain = chain.then(async () => {
    const t0 = performance.now();
    current = msg.id;
    try {
      let json: string;
      if (msg.type === "analyze") json = await analyze(msg.id, msg.payload);
      else if (msg.type === "readWorkbook") json = await readWorkbook(msg.bytes, msg.format);
      else {
        if (!py) throw new Error("the analysis engine is not ready");
        await ensureReader(py, msg.what);
        json = "{}";
      }
      post({ type: "result", id: msg.id, ok: true, json, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      post({
        type: "result", id: msg.id, ok: false,
        message: err instanceof Error ? err.message : String(err),
        ms: Math.round(performance.now() - t0),
      });
    } finally {
      current = null;
      stops.clear();
    }
  });
};
