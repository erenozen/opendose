// Running analyses for results sheets: option normalization and a cache of
// computed results that lives outside undo history.
import { APP_VERSION, BUILD_COMMIT } from "../export/cite";
import { ENGINE_HASH } from "../lib/buildInfo";
import { isCancelled, runEngine, type EngineBridge, type Priority } from "../lib/engine";
import type { ResultsSheet, DataTableModel, ProjectPrefs } from "../project/types";
import type { AnalysisDef } from "../sheets/types";

export function resolveOptions(def: AnalysisDef | undefined, raw: unknown,
  table: DataTableModel, prefs: ProjectPrefs): unknown {
  if (!def) return raw;
  const ctx = { table, prefs };
  if (def.normalizeOptions) return def.normalizeOptions(raw, ctx);
  const base = def.defaultOptions(ctx);
  return raw && typeof raw === "object" && base && typeof base === "object"
    ? { ...base, ...raw } : base;
}

/** The computation behind a results sheet, for runEngine. (Whether the
 *  automatic first curve fit runs at all is the XY sheet's own decision:
 *  sheets/xy/autofit.ts.) */
export function sheetRunner(def: AnalysisDef, table: DataTableModel,
  options: unknown): (engine: EngineBridge) => unknown {
  return (engine) => def.run(engine, table, options);
}

/** 53-bit string hash (cyrb53): short, stable fingerprints of inputs. */
export function hash53(s: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Which build computed a result: a result is reused only by the build
 *  (app code and engine) that computed it. */
const BUILD_STAMP = hash53(`${APP_VERSION}|${BUILD_COMMIT}|${ENGINE_HASH}`);

/** Fingerprint of an analysis input (analysis, resolved options, table):
 *  equal fingerprints mean the stored result is what the engine would
 *  compute now. Saved with cached results in project files, autosave and
 *  share links, so a reopened project recomputes only what changed. */
export function resultKey(analysis: string, options: unknown, table: unknown): string {
  return `${hash53(JSON.stringify([analysis, options, table]))}.${BUILD_STAMP}`;
}

export interface CacheEntry {
  key: string;
  result: unknown;
  /** Computed by the engine in this session (false: read from a file, a
   *  link or the bundled example, shown until the engine recomputes). */
  live?: boolean;
}

/** A computation in progress for one results sheet. */
export interface PendingRun {
  key: string;
  /** performance.now() when it was requested. */
  startedAt: number;
  cancel: () => void;
}

/** Results keyed by results-sheet id. Not part of the project or its
 *  history; written into files as `cached` (+ `cachedKey`) on save. */
export class ResultsCache {
  private map = new Map<string, CacheEntry>();
  private listeners = new Map<string, Set<() => void>>();
  private any = new Set<() => void>();
  private pend = new Map<string, PendingRun & { ctl: AbortController }>();
  private cancelled = new Map<string, string>();

  get(id: string): CacheEntry | undefined { return this.map.get(id); }

  set(id: string, entry: CacheEntry) {
    this.map.set(id, entry);
    this.notify(id);
  }

  private notify(id: string) {
    this.listeners.get(id)?.forEach((fn) => fn());
    this.any.forEach((fn) => fn());
  }

  subscribe(id: string, fn: () => void): () => void {
    let set = this.listeners.get(id);
    if (!set) { set = new Set(); this.listeners.set(id, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  /** Called after any change (results, pending runs). */
  subscribeAll(fn: () => void): () => void {
    this.any.add(fn);
    return () => { this.any.delete(fn); };
  }

  /** id -> latest result, for saving. */
  snapshot(): Map<string, unknown> {
    return new Map([...this.map].map(([k, v]) => [k, v.result]));
  }

  /** id -> fingerprint of the input the saved result belongs to. */
  fingerprints(): Map<string, string> {
    return new Map([...this.map].filter(([, v]) => v.key).map(([k, v]) => [k, v.key]));
  }

  clear() {
    for (const p of this.pend.values()) p.ctl.abort();
    this.pend.clear();
    this.cancelled.clear();
    this.map.clear();
  }

  /** Seed from a loaded file so numbers show before the engine reruns.
   *  A result saved with the fingerprint of its input is reused as it is
   *  while the input is unchanged. */
  prime(sheets: ResultsSheet[]) {
    for (const s of sheets) {
      if (s.cached !== undefined && !this.map.has(s.id)) {
        this.map.set(s.id, { key: s.cachedKey ?? "", result: s.cached, live: false });
      }
    }
  }

  /** The result is current: computed (or saved) for exactly this input. */
  isCurrent(id: string, key: string): boolean {
    return this.map.get(id)?.key === key;
  }

  pending(id: string): PendingRun | undefined { return this.pend.get(id); }

  /** The user cancelled the computation of `key`: do not start it again
   *  until they ask (retry) or the input changes. */
  isCancelled(id: string, key: string): boolean { return this.cancelled.get(id) === key; }

  retry(id: string) {
    this.cancelled.delete(id);
    this.notify(id);
  }

  /**
   * Compute a results sheet's result in the engine. A newer run for the
   * same sheet cancels this one (typing on: only the latest input
   * matters). The result is stored when it arrives, even if nothing shows
   * the sheet any more.
   */
  run(id: string, key: string, fn: (engine: EngineBridge) => unknown,
    priority: Priority = "visible"): void {
    if (this.pend.get(id)?.key === key) return;
    this.pend.get(id)?.ctl.abort();
    this.cancelled.delete(id);
    const ctl = new AbortController();
    const run = {
      key, ctl, startedAt: performance.now(),
      cancel: () => {
        if (this.pend.get(id) !== run) return;
        this.cancelled.set(id, key);
        ctl.abort();
      },
    };
    this.pend.set(id, run);
    this.notify(id);
    runEngine(fn, { signal: ctl.signal, priority }).then(
      (result): CacheEntry | null => ({ key, result, live: true }),
      (e): CacheEntry | null => (isCancelled(e) ? null
        : { key, result: { error: e instanceof Error ? e.message : String(e) }, live: true }),
    ).then((entry) => {
      if (this.pend.get(id) !== run) return;
      this.pend.delete(id);
      if (entry) this.set(id, entry);
      else this.notify(id);
    });
  }
}
