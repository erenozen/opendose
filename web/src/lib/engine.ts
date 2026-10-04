// The analysis engine: real CPython + NumPy + SciPy (Pyodide) running the
// same opendose package that the native test suite validates, in a Web
// Worker (engine.worker.ts) so the page stays responsive while it works.
//
// Public API (callers do not see the worker):
//   runEngine(fn, opts)   run synchronous analysis code `fn(engine)`;
//                         resolves with its return value. Inside fn,
//                         engine.analyze(payload) answers synchronously
//                         (see engineReplay.ts for how).
//   analyzeAsync(p, opts) one request, as a promise.
//   getEngine()           resolves when the engine is ready, with a bridge
//                         for code that hands it to runEngine-style calls.
//   readXlsx(bytes)       every worksheet of an .xlsx file.
//   getRuntimeVersions()  numpy/scipy/python versions (citations).
//   engineState()/subscribeEngine()  boot progress and busy state.
//
// Options: `signal` cancels; `coalesce` names a slot ("results:<sheet id>")
// so a newer run cancels the previous one still pending in that slot;
// `priority` orders the queue ("user" > "visible" > "background").
import { BASE_URL, ENGINE_HASH, PYODIDE_VERSION } from "./buildInfo";
import {
  EngineHost, isCancelled, type EngineState, type Priority,
  type WorkerLike,
} from "./engineClient";
import type { RuntimeVersions } from "./engineProtocol";
import {
  AnswerCache, replay, type EngineBridge, type Outcome,
} from "./engineReplay";
import { applyModelList } from "./modelLibrary";

export type { EngineBridge } from "./engineReplay";
export type { RuntimeVersions } from "./engineProtocol";
export type { EngineState, Priority } from "./engineClient";
export { EngineCancelled, isCancelled } from "./engineClient";
export { isEnginePending } from "./engineReplay";

export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const host = new EngineHost(
  () => new Worker(new URL("./engine.worker.ts", import.meta.url),
    { type: "module", name: "opendose-engine" }) as unknown as WorkerLike,
  {
    indexURL: PYODIDE_INDEX_URL,
    engineURL: `${BASE_URL}py/opendose/bundle.json?v=${ENGINE_HASH}`,
    packages: ["numpy", "scipy"],
  },
);
// For the e2e and performance scripts (boot and restart timings).
(globalThis as { __opendoseEngine?: EngineHost }).__opendoseEngine = host;

const answers = new AnswerCache();
let modelsApplied = false;

function onReady() {
  if (modelsApplied) return;
  modelsApplied = true;
  // The xlsx reader (openpyxl, from PyPI) installs once the engine has
  // nothing else to do, so the first xlsx import does not wait for it.
  setTimeout(() => {
    host.submit({ type: "prepare", what: "xlsx" }, { priority: "background" }).catch(() => {});
  }, 3000);
  const models = host.info?.models;
  if (!models) return;
  try { applyModelList(JSON.parse(models)); } catch { /* keep the built-in list */ }
}

/** Start downloading and booting the engine now (idempotent). Called
 *  before React renders, so the runtime loads while the page paints. */
export function startEngine(): Promise<void> {
  return host.boot().then(onReady);
}

export function engineState(): EngineState { return host.state; }

export function subscribeEngine(fn: (s: EngineState) => void): () => void {
  return host.subscribe(fn);
}

/** Null until the engine has booted. */
export function getRuntimeVersions(): RuntimeVersions | null {
  return host.info?.versions ?? null;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** A newer run with the same key cancels this one. */
  coalesce?: string;
  priority?: Priority;
}

const slots = new Map<string, AbortController>();

/** Run synchronous analysis code against the engine (see the header). */
export async function runEngine<T>(fn: (engine: EngineBridge) => T,
  opts: RunOptions = {}): Promise<T> {
  const ctl = new AbortController();
  const { signal: outer, coalesce, priority } = opts;
  if (outer) {
    if (outer.aborted) ctl.abort();
    else outer.addEventListener("abort", () => ctl.abort(), { once: true });
  }
  if (coalesce) {
    slots.get(coalesce)?.abort();
    slots.set(coalesce, ctl);
  }
  try {
    await startEngine();
    const ask = (payload: string): Promise<Outcome> =>
      host.submit({ type: "analyze", payload }, { priority, signal: ctl.signal }).then(
        (text) => ({ ok: true, text }),
        (e) => {
          if (isCancelled(e)) throw e;
          return { ok: false, text: e instanceof Error ? e.message : String(e) };
        },
      );
    return await replay(fn, ask, answers, { signal: ctl.signal });
  } finally {
    if (coalesce && slots.get(coalesce) === ctl) slots.delete(coalesce);
  }
}

/** One engine request. */
export function analyzeAsync(payload: unknown, opts: RunOptions = {}): Promise<unknown> {
  return runEngine((e) => e.analyze(payload), opts);
}

/** Cancel everything queued or running (a new project was opened). */
export function cancelAllEngineJobs() {
  for (const c of slots.values()) c.abort();
  slots.clear();
  host.cancelAll();
}

/** Answers outside a runEngine() call come only from the shared cache;
 *  anything else is a programming error, reported clearly. */
const looseBridge: EngineBridge = {
  analyze(payload: unknown) {
    const hit = answers.get(JSON.stringify(payload) ?? "null");
    if (hit?.ok) return JSON.parse(hit.text);
    throw new Error("engine.analyze() must be called inside runEngine() "
      + "(the engine runs in a worker; see src/lib/engine.ts)");
  },
};

/** Resolves when the engine is ready. `onStatus` receives the loading
 *  messages until then. Analysis code takes its EngineBridge from
 *  runEngine(); the bridge given here only answers requests already made. */
export function getEngine(onStatus: (msg: string) => void = () => {}): Promise<EngineBridge> {
  const off = host.subscribe((s) => { if (s.progress) onStatus(s.progress.message); });
  return startEngine().then(
    () => { off(); return looseBridge; },
    (e) => { off(); throw e; },
  );
}

// ------------------------------------------------------------ xlsx reading

/** One worksheet as rows of cell text (numbers in full precision, dates
 *  as ISO text, blanks as ""). */
export interface XlsxSheet { name: string; rows: string[][] }

/** Read every worksheet of an .xlsx file (in the engine worker; waits for
 *  it to load, and installs the xlsx reader on first use). */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxSheet[]> {
  await startEngine();
  const text = await host.submit({ type: "readXlsx", bytes: bytes.slice() }, { priority: "user" });
  return JSON.parse(text) as XlsxSheet[];
}

