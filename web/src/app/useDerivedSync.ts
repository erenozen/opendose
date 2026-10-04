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
import { isCancelled, isEnginePending, runEngine, type EngineBridge } from "../lib/engine";
import {
  derivedOutputs, producerOrder, writeDerivedTable,
} from "../project/derived";
import type { DataSheet, Project, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions, resultKey, type CacheEntry, type ResultsCache } from "./analysis";
import { useProject } from "./context";

const DEBOUNCE_MS = 250;

// The cache key is the one useAnalysisResult computes (resultKey), so a
// producer sheet that is on screen reuses the result computed here (and
// vice versa).

/** One sync pass over a project: re-run each producer whose input
 *  changed (upstream first) and write its output table. Pure: results it
 *  computes go into `fresh` (read before `results`), for the caller to
 *  store. It runs inside runEngine, whose passes may be repeated and
 *  thrown away, so it must not write to the shared cache itself, and
 *  EnginePending must pass through untouched. */
export function syncDerived(p: Project, engine: EngineBridge, results: ResultsCache,
  fresh: Map<string, CacheEntry> = new Map()): Project {
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
    let entry = fresh.get(prod.id) ?? results.get(prod.id);
    if (entry?.key !== key) {
      let result: unknown;
      try {
        result = def.run(engine, source.table, options);
      } catch (e) {
        if (isEnginePending(e)) throw e;
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      entry = { key, result, live: true };
      fresh.set(prod.id, entry);
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
  const { project, store, results } = useProject();
  useEffect(() => {
    const hasChains = project.sheets.some((s) => s.kind === "data" && s.derived);
    if (!hasChains) return;
    const timer = setTimeout(() => {
      const p = store.project;
      // Computed in the engine worker; written only if nothing changed
      // meanwhile (otherwise the next pass, mostly cache hits, takes over).
      let fresh = new Map<string, CacheEntry>();
      runEngine((engine) => {
        fresh = new Map();
        return syncDerived(p, engine, results, fresh);
      }, { coalesce: "derived-sync" })
        .then((next) => {
          for (const [id, entry] of fresh) results.set(id, entry);
          store.amend((cur) => (cur === p ? next : cur));
        })
        .catch((e) => { if (!isCancelled(e)) console.error(e); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [project, store, results]);
}
