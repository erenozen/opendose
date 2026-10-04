// The message protocol between the page and the engine worker
// (engine.worker.ts). The worker owns Pyodide and the opendose package;
// the page never touches Python directly. One job runs at a time per
// worker: the page (engineClient.ts) keeps the queue, so cancelling a
// queued job is just removing it, and cancelling a running job means
// terminating the worker (Python cannot be interrupted mid-call).
//
// Payloads and results travel as JSON text: the engine's own entry point
// is string-in / string-out (opendose.api.analyze_json), and text is
// cheap to copy across threads and to cache.

/** Numerical library versions as loaded in the worker (for citations). */
export interface RuntimeVersions {
  python: string;
  numpy: string;
  scipy: string;
  pyodide: string;
}

export interface BootConfig {
  /** Pyodide distribution folder (CDN), ending in "/". */
  indexURL: string;
  /** The engine's Python files as one JSON document
   *  ({ files: { "api.py": "…", … } }), written by scripts/sync-py.mjs. */
  engineURL: string;
  /** Pyodide packages to load before the engine is imported. */
  packages: string[];
}

export type WorkerRequest =
  | { type: "boot"; config: BootConfig }
  /** payload: JSON text of { analysis, data, options } */
  | { type: "analyze"; id: number; payload: string }
  | { type: "readXlsx"; id: number; bytes: Uint8Array }
  /** Install what a later request will need (the xlsx reader), when idle. */
  | { type: "prepare"; id: number; what: "xlsx" };

export type BootPhase = "download" | "packages" | "engine";

export interface BootProgress {
  phase: BootPhase;
  /** One line for the loading screen, e.g. "Loading NumPy + SciPy…". */
  message: string;
  /** Bytes received so far and the expected total (0 = unknown). */
  loaded: number;
  total: number;
}

export type WorkerResponse =
  | { type: "progress"; progress: BootProgress }
  | {
    type: "ready";
    versions: RuntimeVersions | null;
    /** JSON text of the engine's model registry (list_models), or null. */
    models: string | null;
    bootMs: number;
    /** Milestones of the boot (ms since the worker started), for the
     *  performance scripts: the critical path, step by step. */
    marks: Record<string, number>;
  }
  | { type: "bootError"; message: string }
  /** ok: json is the result text; not ok: message is why the call threw. */
  | { type: "result"; id: number; ok: true; json: string; ms: number }
  | { type: "result"; id: number; ok: false; message: string; ms: number };
