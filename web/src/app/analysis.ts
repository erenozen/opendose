// Running analyses for results sheets: option normalization and a cache of
// computed results that lives outside undo history.
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

export interface CacheEntry { key: string; result: unknown }

/** Results keyed by results-sheet id. Not part of the project or its
 *  history; written into files as `cached` on save. */
export class ResultsCache {
  private map = new Map<string, CacheEntry>();
  private listeners = new Map<string, Set<() => void>>();

  get(id: string): CacheEntry | undefined { return this.map.get(id); }

  set(id: string, entry: CacheEntry) {
    this.map.set(id, entry);
    this.listeners.get(id)?.forEach((fn) => fn());
  }

  subscribe(id: string, fn: () => void): () => void {
    let set = this.listeners.get(id);
    if (!set) { set = new Set(); this.listeners.set(id, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  /** id -> latest result, for saving. */
  snapshot(): Map<string, unknown> {
    return new Map([...this.map].map(([k, v]) => [k, v.result]));
  }

  clear() { this.map.clear(); }

  /** Seed from a loaded file so numbers show before the engine reruns. */
  prime(sheets: ResultsSheet[]) {
    for (const s of sheets) {
      if (s.cached !== undefined && !this.map.has(s.id)) {
        this.map.set(s.id, { key: "", result: s.cached });
      }
    }
  }
}
