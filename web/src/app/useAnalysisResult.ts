import { useEffect, useMemo, useReducer } from "react";
import { getEngine } from "../lib/engine";
import type { DataTableModel, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions } from "./analysis";
import { useProject } from "./context";

/**
 * The result shown for a results sheet. Recomputes (debounced) whenever the
 * table or the options change; keeps showing the previous result until the
 * new one is ready, so typing does not flicker. Frozen sheets show the
 * result stored when they were frozen and never recompute.
 */
export function useAnalysisResult(sheet: ResultsSheet | null,
  table: DataTableModel | null): { result: unknown; options: unknown } {
  const { results, engineReady, project } = useProject();
  const def = sheet && table ? analysisDef(table.type, sheet.analysis) : undefined;
  const prefs = project.prefs;
  const options = useMemo(
    () => (sheet && table ? resolveOptions(def, sheet.options, table, prefs) : null),
    [sheet, def, table, prefs],
  );
  const key = useMemo(() => (sheet && def && table
    ? JSON.stringify([sheet.analysis, options, table]) : ""),
  [sheet, def, options, table]);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const id = sheet?.id ?? null;

  useEffect(() => (id ? results.subscribe(id, bump) : undefined), [id, results]);

  useEffect(() => {
    if (!sheet || !def || !table || !engineReady || sheet.frozen) return;
    const entry = results.get(sheet.id);
    if (entry?.key === key) return;
    // Debounce typing; run promptly when nothing is shown yet.
    const delay = entry && entry.key !== "" ? 400 : 30;
    const timer = setTimeout(async () => {
      const engine = await getEngine();
      let result: unknown;
      try {
        result = def.run(engine, table, options);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      results.set(sheet.id, { key, result });
    }, delay);
    return () => clearTimeout(timer);
  }, [key, sheet, def, table, options, engineReady, results]);

  if (!sheet) return { result: null, options: null };
  if (sheet.frozen) return { result: sheet.cached ?? null, options };
  return { result: results.get(sheet.id)?.result ?? null, options };
}
