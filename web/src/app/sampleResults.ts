// The example project's results, as the engine computed them when this
// file was last regenerated (scripts/gen-sample-results.mjs). The first
// paint shows them, marked as not live, while the engine loads; the live
// engine then recomputes every one, so a stale file only means a moment
// of older digits, never wrong numbers left on screen.
import type { Project } from "../project/types";
import type { ResultsCache } from "./analysis";
import data from "./sampleResults.json";

interface Saved { analysis: string; result: unknown }

/** Seed the cache with the bundled results of the example project, matched
 *  to its results sheets in order (ids are new on every start). */
export function primeSampleResults(p: Project, cache: ResultsCache) {
  const saved = (data as { results?: Saved[] }).results ?? [];
  const sheets = p.sheets.filter((s) => s.kind === "results");
  sheets.forEach((s, i) => {
    const d = saved[i];
    if (d && s.kind === "results" && d.analysis === s.analysis && d.result) {
      cache.set(s.id, { key: "", result: d.result, live: false });
    }
  });
}
