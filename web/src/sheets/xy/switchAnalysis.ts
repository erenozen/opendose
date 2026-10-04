// Switch a results sheet to another analysis in place: the sheet keeps its
// id (and so its tab, position and graphs) but gets the new analysis id,
// options and name, and its graphs of `graphFrom` become `graphTo`. One
// undo step when applied through the project store. Pure.
import { findSheet, uniqueName } from "../../project/ops.ts";
import type { Project } from "../../project/types.ts";

export function switchResultsAnalysis(p: Project, resultsId: string, to: {
  analysis: string;
  options: unknown;
  /** New sheet name for a data table called `tableName`. */
  sheetName: (tableName: string) => string;
  graphFrom: string;
  graphTo: string;
}): Project {
  const res = findSheet(p, resultsId);
  if (!res || res.kind !== "results" || res.frozen) return p;
  const data = findSheet(p, res.parentId);
  const name = uniqueName(p, to.sheetName(data?.name ?? "data"), resultsId);
  return {
    ...p,
    sheets: p.sheets.map((s) => {
      if (s.id === resultsId && s.kind === "results") {
        const next = { ...s, analysis: to.analysis, options: to.options, name };
        delete next.cached;
        return next;
      }
      if (s.kind === "graph" && s.resultsId === resultsId && !s.frozen && s.graphType === to.graphFrom) {
        return { ...s, graphType: to.graphTo };
      }
      return s;
    }),
  };
}
