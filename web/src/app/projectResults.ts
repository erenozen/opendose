// Every results sheet's result for a whole project, as the workbench would
// show it: for saving a version (P-72, the version keeps its numbers) and
// for comparing two projects (P-73). A result is taken, in order, from the
// live cache when it was computed for exactly this input, from the
// project's own saved result when that was saved for this input (data and
// options; any build), and otherwise computed now by the engine. Nothing
// here computes a statistic.
import { runEngine, engineState } from "../lib/engine";
import { sheetTable } from "../project/leftOut";
import type { DataSheet, Project } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resolveOptions, resultKey, sheetRunner, type ResultsCache } from "./analysis";

export interface ProjectResults {
  /** Results sheet id -> result (an error result included). */
  results: Map<string, unknown>;
  /** Results sheet id -> fingerprint of the input (written as cachedKey). */
  keys: Map<string, string>;
  /** Results sheet id -> the analysis options as they ran (defaults filled). */
  options: Map<string, unknown>;
  /** Results sheet id -> why there is no result. */
  missing: Map<string, string>;
}

/** "<input>.<build>" -> "<input>". */
const inputOf = (k: string) => k.slice(0, k.lastIndexOf("."));

export async function projectResults(p: Project, live?: ResultsCache,
  onProgress?: (left: number) => void): Promise<ProjectResults> {
  const out: ProjectResults = { results: new Map(), keys: new Map(), options: new Map(), missing: new Map() };
  const byId = new Map(p.sheets.map((s) => [s.id, s]));
  const todo: (() => Promise<void>)[] = [];
  for (const s of p.sheets) {
    if (s.kind !== "results") continue;
    const data = byId.get(s.parentId) as DataSheet | undefined;
    const def = data?.kind === "data" ? analysisDef(data.table.type, s.analysis) : undefined;
    if (!data || data.kind !== "data" || !def) {
      out.missing.set(s.id, "its data table or analysis is missing");
      continue;
    }
    const table = sheetTable(s, data.table);
    const options = resolveOptions(def, s.options, table, p.prefs);
    out.options.set(s.id, options);
    if (s.frozen) {
      if (s.cached !== undefined) out.results.set(s.id, s.cached);
      else out.missing.set(s.id, "it is frozen without a stored result");
      continue;
    }
    const key = resultKey(s.analysis, options, table);
    const hit = live?.get(s.id);
    if (hit && hit.key === key) {
      out.results.set(s.id, hit.result);
      out.keys.set(s.id, key);
      continue;
    }
    if (s.cached !== undefined && s.cachedKey && inputOf(s.cachedKey) === inputOf(key)) {
      out.results.set(s.id, s.cached);
      out.keys.set(s.id, s.cachedKey);
      continue;
    }
    todo.push(async () => {
      try {
        out.results.set(s.id, await runEngine(sheetRunner(def, table, options), { priority: "user" }));
        out.keys.set(s.id, key);
      } catch (e) {
        if (engineState().phase === "failed") out.missing.set(s.id, "the analysis engine did not load");
        else out.results.set(s.id, { error: e instanceof Error ? e.message : String(e) });
      }
    });
  }
  let left = todo.length;
  onProgress?.(left);
  for (const run of todo) {
    await run();
    onProgress?.(--left);
  }
  return out;
}
