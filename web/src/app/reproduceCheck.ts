// Reopening a project saved by another build: recompute its results and
// say whether every saved number came back (stable-results-versions).
//
// On opening a project file, restoring an autosave session or opening a
// share link saved by a different app version, build or engine,
// `prepareReproduceCheck` remembers each results sheet's saved result and
// the fingerprint of its input, and drops the saved fingerprints so every
// analysis is recomputed (the saved numbers still show meanwhile).
// `settleReproduceCheck`, called on every change of the results cache
// (ReproduceStrip), compares each recomputed result with the saved one
// (project/reproduce.ts) once it arrives for exactly the input that was
// saved; a sheet edited before then is skipped. When every sheet is
// settled the report goes to the strip, which adds it to the project
// (Project.reproductions, outside undo): saved with it, listed in the
// History panel after reopening.
import { useSyncExternalStore } from "react";
import { APP_VERSION, BUILD_COMMIT } from "../export/cite";
import { ENGINE_HASH } from "../lib/buildInfo";
import { getRuntimeVersions } from "../lib/engine";
import {
  compareResults, sameBuild, savedWithOf, type ReproductionReport, type ReproductionSource,
  type SavedWith, type SheetCheck,
} from "../project/reproduce";
import { sheetTable } from "../project/leftOut";
import type { DataSheet, Project, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions, resultKey, type ResultsCache } from "./analysis";

/** The software saving a file now (written as `savedWith`). */
export function currentSavedWith(): SavedWith {
  const libs = getRuntimeVersions();
  return {
    app: APP_VERSION,
    ...(BUILD_COMMIT ? { commit: BUILD_COMMIT } : {}),
    engine: ENGINE_HASH,
    ...(libs ? { libraries: { ...libs } as unknown as Record<string, string> } : {}),
  };
}

interface PendingSheet {
  name: string;
  analysis: string;
  saved: unknown;
  key: string;
  dataId: string;
}

interface Pending {
  file: string;
  source?: ReproductionSource;
  savedWith: SavedWith | null;
  current: SavedWith;
  sheets: Map<string, PendingSheet>;
  done: Map<string, SheetCheck>;
}

export interface ReproduceState {
  /** A check in progress: sheets settled so far and in all. */
  progress: { file: string; source?: ReproductionSource; done: number; total: number;
    savedWith: SavedWith | null } | null;
  /** The latest finished check (until dismissed). The project keeps
   *  every finished one (Project.reproductions). */
  latest: ReproductionReport | null;
}

let pending: Pending | null = null;
let state: ReproduceState = { progress: null, latest: null };
const listeners = new Set<() => void>();

function emit(next: Partial<ReproduceState>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

function progressOf(p: Pending): ReproduceState["progress"] {
  return { file: p.file, ...(p.source ? { source: p.source } : {}), done: p.done.size,
    total: p.sheets.size, savedWith: p.savedWith };
}

const isError = (r: unknown) => !r || typeof r !== "object" || "error" in (r as object);

/** Fingerprint of each (not frozen) results sheet's input, as
 *  useAnalysisResult computes it, with the sheet's data table. */
function inputKeys(project: Project): Map<string, { key: string; dataId: string; sheet: ResultsSheet }> {
  const out = new Map<string, { key: string; dataId: string; sheet: ResultsSheet }>();
  const byId = new Map(project.sheets.map((s) => [s.id, s]));
  for (const s of project.sheets) {
    if (s.kind !== "results" || s.frozen) continue;
    const data = byId.get(s.parentId) as DataSheet | undefined;
    if (!data || data.kind !== "data") continue;
    const def = analysisDef(data.table.type, s.analysis);
    if (!def) continue;
    const table = sheetTable(s, data.table);
    const options = resolveOptions(def, s.options, table, project.prefs);
    out.set(s.id, { key: resultKey(s.analysis, options, table), dataId: data.id, sheet: s });
  }
  return out;
}

/** The results sheets a check covers: a saved result (not an error) and
 *  the fingerprint of the input it was saved for. */
function checkable(project: Project): Map<string, PendingSheet> {
  const out = new Map<string, PendingSheet>();
  for (const [id, { key, dataId, sheet: s }] of inputKeys(project)) {
    if (s.cached === undefined || isError(s.cached)) continue;
    out.set(id, {
      name: s.name, saved: s.cached, dataId, key,
      analysis: String((s.cached as { analysis?: unknown }).analysis ?? s.analysis),
    });
  }
  return out;
}

/**
 * Called with an opened project file: returns the project to load. Saved
 * by this very build: unchanged, no check. Otherwise the results sheets
 * lose their saved fingerprints (so the engine recomputes them all) and
 * a check starts.
 */
export function prepareReproduceCheck(text: string, project: Project, file: string): Project {
  return prepareReproduceCheckFor(savedWithOf(text), project, file);
}

/**
 * The same for a project read another way: `savedWith` as the autosave
 * record or the share link recorded it (null: not recorded), `name` the
 * project's title, `source` how it was opened.
 */
export function prepareReproduceCheckFor(savedWith: SavedWith | null, project: Project,
  name: string, source?: ReproductionSource): Project {
  const current = currentSavedWith();
  pending = null;
  if (sameBuild(savedWith, current)) { emit({ progress: null, latest: null }); return project; }
  const sheets = checkable(project);
  if (!sheets.size) { emit({ progress: null, latest: null }); return project; }
  pending = { file: name, ...(source ? { source } : {}), savedWith, current, sheets, done: new Map() };
  // A result saved for another input (the file was saved while a newer
  // computation was pending or cancelled) is not a reproduction test.
  // Fingerprints are "<input>.<build>"; files without one are compared.
  const inputOf = (k: string) => k.slice(0, k.lastIndexOf("."));
  for (const s of project.sheets) {
    const ps = sheets.get(s.id);
    if (!ps || s.kind !== "results" || !s.cachedKey) continue;
    if (inputOf(s.cachedKey) !== inputOf(ps.key)) {
      pending.done.set(s.id, { sheetId: s.id, name: ps.name, analysis: ps.analysis, compared: 0,
        changes: [], status: "skipped", note: "its saved result was computed for other data or options" });
    }
  }
  if (pending.done.size === sheets.size) { pending = null; emit({ progress: null, latest: null }); return project; }
  emit({ progress: progressOf(pending), latest: null });
  return {
    ...project,
    sheets: project.sheets.map((s) => {
      if (s.kind !== "results" || !sheets.has(s.id)) return s;
      const next: ResultsSheet = { ...s };
      delete next.cachedKey;
      return next;
    }),
  };
}

/** Compare whatever has been recomputed since the last call; finish the
 *  check when every sheet is settled, and return its report then (the
 *  caller adds it to the project). */
export function settleReproduceCheck(project: Project, results: ResultsCache): ReproductionReport | null {
  const p = pending;
  if (!p) return null;
  const digits = project.prefs.digits;
  const live = inputKeys(project);
  let changed = false;
  for (const [id, s] of p.sheets) {
    if (p.done.has(id)) continue;
    const base = { sheetId: id, name: s.name, analysis: s.analysis, compared: 0, changes: [] };
    const now = live.get(id);
    if (!now || now.key !== s.key) {
      p.done.set(id, { ...base, status: "skipped",
        note: now ? "its data or options changed before the check finished" : "the sheet was removed" });
      changed = true;
      continue;
    }
    const entry = results.get(id);
    if (!entry || entry.live !== true || entry.key !== s.key) continue;
    changed = true;
    const r = entry.result as { error?: unknown } | null;
    if (!r || typeof r !== "object" || r.error) {
      p.done.set(id, { ...base, status: "failed", note: String(r?.error ?? "no result") });
      continue;
    }
    const c = compareResults(s.saved, r, { digits });
    p.done.set(id, { ...base, compared: c.compared, changes: c.changes,
      status: c.changes.length ? "changed" : "reproduced" });
  }
  if (!changed) return null;
  if (p.done.size < p.sheets.size) { emit({ progress: progressOf(p) }); return null; }
  const report: ReproductionReport = {
    file: p.file, ...(p.source ? { source: p.source } : {}), savedWith: p.savedWith,
    // the libraries are known once the engine has run
    current: { ...currentSavedWith(), app: p.current.app },
    checkedAt: new Date().toISOString(), digits,
    sheets: [...p.sheets.keys()].map((id) => p.done.get(id)!),
  };
  pending = null;
  emit({ progress: null, latest: report });
  return report;
}

/** Hide the strip (a check still running is abandoned). */
export function dismissReproduceReport(): void {
  pending = null;
  emit({ latest: null, progress: null });
}

/** Results sheet id -> data table id of the sheets in the running check. */
export function reproduceDataIds(): string[] {
  return pending ? [...new Set([...pending.sheets.values()].map((s) => s.dataId))] : [];
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useReproduceState(): ReproduceState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
