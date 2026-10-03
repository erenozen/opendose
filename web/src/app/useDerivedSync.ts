// Keeps derived data tables (chains of analyses) equal to the output of
// the analysis that produces them. Runs for the whole project, not just
// the sheets on screen: editing a raw table re-computes Transform ->
// Normalize -> ... down the chain, and each derived table's own results
// re-run because their table changed.
//
// Writes go through store.amend (no undo step): a derived table is a
// pure function of its source and options, so undoing the source edit
// brings back the derived table that went with it.
import { useEffect } from "react";
import type { EngineBridge } from "../lib/engine";
import { getEngine } from "../lib/engine";
import {
  derivedOutputs, producerOrder, writeDerivedTable,
} from "../project/derived";
import type { DataSheet, Project, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions, type ResultsCache } from "./analysis";
import { useProject } from "./context";

const DEBOUNCE_MS = 250;

/** Same cache key useAnalysisResult computes, so a producer sheet that is
 *  on screen reuses the result computed here (and vice versa). */
export function resultKey(analysis: string, options: unknown, table: unknown): string {
  return JSON.stringify([analysis, options, table]);
}

/** One sync pass over a project: re-run each producer whose input
 *  changed (upstream first) and write its output table. Pure apart from
 *  the results cache it fills. */
export function syncDerived(p: Project, engine: EngineBridge, results: ResultsCache): Project {
  const producers = p.sheets.filter((s): s is ResultsSheet => s.kind === "results"
    && !s.frozen && derivedOutputs(p, s.id).some((d) => !d.frozen));
  let next = p;
  for (const prod of producerOrder(p, producers)) {
    const source = next.sheets.find((s) => s.id === prod.parentId) as DataSheet | undefined;
    if (!source || source.kind !== "data") continue;
    const def = analysisDef(source.table.type, prod.analysis);
    if (!def?.derivedTable) continue;
    const options = resolveOptions(def, prod.options, source.table, next.prefs);
    const key = resultKey(prod.analysis, options, source.table);
    let entry = results.get(prod.id);
    if (entry?.key !== key) {
      let result: unknown;
      try {
        result = def.run(engine, source.table, options);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      entry = { key, result };
      results.set(prod.id, entry);
    }
    let table = null;
    try {
      table = def.derivedTable(entry.result, source.table, options);
    } catch {
      table = null;
    }
    if (!table) continue;
    for (const out of derivedOutputs(next, prod.id)) {
      next = writeDerivedTable(next, out.id, table);
    }
  }
  return next;
}

export function useDerivedSync() {
  const { project, store, results, engineReady } = useProject();
  useEffect(() => {
    if (!engineReady) return;
    const hasChains = project.sheets.some((s) => s.kind === "data" && s.derived);
    if (!hasChains) return;
    const timer = setTimeout(async () => {
      const engine = await getEngine();
      store.amend((p) => syncDerived(p, engine, results));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [project, engineReady, store, results]);
}
