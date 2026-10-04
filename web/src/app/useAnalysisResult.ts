import { useEffect, useMemo, useReducer } from "react";
import type { Priority } from "../lib/engine";
import type { DataTableModel, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions, resultKey, sheetRunner, type PendingRun } from "./analysis";
import { useProject } from "./context";

/** What the results view knows about the computation behind a result. */
export interface AnalysisStatus {
  /** The result shown belongs to exactly the current input: computed by
   *  the engine for it, or saved with its fingerprint by this same build
   *  (false: an older result, shown until the new one arrives). */
  live: boolean;
  /** A computation for the current input is queued or running. */
  pending: PendingRun | null;
  /** The user cancelled the computation for the current input. */
  cancelled: boolean;
  /** Start the cancelled computation again. */
  retry: () => void;
}

const IDLE: AnalysisStatus = { live: false, pending: null, cancelled: false, retry: () => {} };

/**
 * The result shown for a results sheet. Recomputes (debounced) whenever the
 * table or the options change, in the engine worker; keeps showing the
 * previous result until the new one is ready, so typing does not flicker.
 * A newer input cancels the computation of the previous one. A result
 * saved with the fingerprint of its input (project file, autosave, share
 * link) is reused while the input is unchanged. Frozen sheets show the
 * result stored when they were frozen and never recompute.
 */
export function useAnalysisResult(sheet: ResultsSheet | null,
  table: DataTableModel | null, priority: Priority = "visible"):
  { result: unknown; options: unknown; status: AnalysisStatus } {
  const { results, project } = useProject();
  const def = sheet && table ? analysisDef(table.type, sheet.analysis) : undefined;
  const prefs = project.prefs;
  const options = useMemo(
    () => (sheet && table ? resolveOptions(def, sheet.options, table, prefs) : null),
    [sheet, def, table, prefs],
  );
  const key = useMemo(() => (sheet && def && table
    ? resultKey(sheet.analysis, options, table) : ""),
  [sheet, def, options, table]);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const id = sheet?.id ?? null;

  useEffect(() => (id ? results.subscribe(id, bump) : undefined), [id, results]);

  const entry = id ? results.get(id) : undefined;
  const pending = id ? results.pending(id) ?? null : null;
  const cancelled = !!id && results.isCancelled(id, key);
  const current = entry?.key === key;

  useEffect(() => {
    if (!sheet || !def || !table || sheet.frozen || !key) return;
    if (results.isCurrent(sheet.id, key) || results.isCancelled(sheet.id, key)) return;
    if (results.pending(sheet.id)?.key === key) return;
    // Debounce typing; run promptly when nothing current is shown yet.
    const prev = results.get(sheet.id);
    const delay = prev && prev.key !== "" && prev.live !== false ? 400 : 30;
    const timer = setTimeout(() => {
      results.run(sheet.id, key, sheetRunner(def, table, options), priority);
    }, delay);
    return () => clearTimeout(timer);
  // `cancelled` and `current` re-arm the effect after Retry / a newer run.
  }, [key, sheet, def, table, options, prefs, results, priority, cancelled, current]);

  if (!sheet) return { result: null, options: null, status: IDLE };
  if (sheet.frozen) {
    return { result: sheet.cached ?? null, options, status: { ...IDLE, live: true } };
  }
  return {
    result: entry?.result ?? null,
    options,
    status: {
      live: current,
      pending: pending && pending.key === key ? pending : null,
      cancelled,
      retry: () => { if (id) results.retry(id); },
    },
  };
}
