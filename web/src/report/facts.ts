// Facts about a family for the journal checklists: read from the project,
// its results cache and the registry. The rules themselves are pure
// (checklists.ts).
import type { ResultsCache } from "../app/analysis";
import { librariesPhrase, APP_VERSION } from "../export/cite";
import { getRuntimeVersions } from "../lib/engine";
import { allReasoned, exclusionSentence } from "../project/exclusions";
import type { DataSheet, GraphSheet, Project, ResultsSheet } from "../project/types";
import type { FamilyFacts, GraphFacts, ResultFacts } from "./checklists";
import { describeResult } from "./describe";
import { effectGroups } from "./effects";
import { graphDescribed, graphFacts, tableGroups } from "./legendFor";
import { reportPrefsOf } from "./prefs";
import { metaWithReplicates } from "./replicates";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function resultOf(sheet: ResultsSheet, cache: ResultsCache): unknown {
  return sheet.frozen ? sheet.cached ?? null : cache.get(sheet.id)?.result ?? sheet.cached ?? null;
}

/** The ARRIVE-style sample-size sentence of a power analysis in the
 *  project (engine "power" handler with a justification), if any. */
export function powerJustification(p: Project, cache: ResultsCache): string | null {
  for (const s of p.sheets) {
    if (s.kind !== "results") continue;
    const r = resultOf(s, cache) as any;
    if (r && r.analysis === "power" && typeof r.justification?.text === "string") return r.justification.text;
  }
  return null;
}

function estimateCI(r: any): boolean {
  if (!r || typeof r !== "object") return false;
  const ok = (c: unknown) => Array.isArray(c) && c.length === 2 && c.every((v) => typeof v === "number");
  if (ok(r.ci_difference) || ok(r.ci_ratio) || ok(r.ci_hodges_lehmann) || ok(r.ci_median) || ok(r.ci_r)) return true;
  if (r.analysis === "estimation") return (r.comparisons ?? []).every((c: any) => ok(c.effects?.[0]?.ci));
  if (r.analysis === "nested_t_test") return ok(r.ci);
  if (r.analysis === "survival") return ok(r.hazard_ratio?.ci);
  return false;
}

export function familyFacts(p: Project, data: DataSheet, cache: ResultsCache): FamilyFacts {
  const prefs = reportPrefsOf(p.prefs);
  const results: ResultFacts[] = [];
  const graphs: GraphFacts[] = [];
  let normalityChecked = false;
  let minN: number | null = null;
  for (const s of p.sheets) {
    if (s.kind === "results" && s.parentId === data.id) {
      const r = resultOf(s, cache) as any;
      if (!r || r.error) continue;
      const info = describeResult(r);
      if (r.analysis === "column_statistics" && r.datasets?.some((d: any) => d.normality && Object.keys(d.normality).length)) {
        normalityChecked = true;
      }
      const rows = effectGroups(r, prefs).flatMap((g) => g.rows);
      results.push({
        sheetId: s.id, name: s.name, info,
        effect: rows.length > 0, effectCI: rows.some((x) => x.ci !== null),
        estimateCI: estimateCI(r),
      });
      for (const g of info.groups) minN = minN === null ? g.n : Math.min(minN, g.n);
    }
    if (s.kind === "graph" && s.parentId === data.id) {
      const g = s as GraphSheet;
      const bound = g.resultsId ? p.sheets.find((x) => x.id === g.resultsId) as ResultsSheet | undefined : undefined;
      const f = graphFacts(g, bound?.options);
      graphs.push({ sheetId: g.id, name: g.name, described: graphDescribed(g),
        errorBars: f.errorBars, pointsShown: f.points });
    }
  }
  if (minN === null) {
    const tg = tableGroups(data.table);
    if (tg.length) minN = Math.min(...tg.map((g) => g.n));
  }
  const excludedCount = data.table.datasets.reduce((a, d) => a + (d.excluded?.length ?? 0), 0)
    + (data.table.xExcluded?.length ?? 0);
  // A reason recorded with every excluded value answers the exclusions
  // item as well as a typed note does (ARRIVE 2.0 item 3b).
  const meta = { ...metaWithReplicates(data.report, data.table) };
  if (!meta.exclusions && allReasoned(data.table)) {
    meta.exclusions = exclusionSentence(data.table) ?? undefined;
  }
  return {
    dataId: data.id, dataName: data.name, results, graphs,
    meta,
    excludedCount, minN, powerJustification: powerJustification(p, cache),
    software: `OpenDose ${APP_VERSION} with ${librariesPhrase(getRuntimeVersions())}`,
    normalityChecked,
  };
}
