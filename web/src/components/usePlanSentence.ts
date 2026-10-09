// The analysis plan sentence of the methods text for a data table
// (project/plan.ts planMethodsSentence), with the registry's analysis
// labels for the deviations it lists.
import { useMemo } from "react";
import { useProject } from "../app/context";
import { planDeviations, planMethodsSentence, planSheetFor, resultsOf } from "../project/plan";
import type { DataSheet, Project } from "../project/types";
import { analysisDef } from "../sheets/registry";

/** Registry labels of a table's results sheets (for analyses plan.ts
 *  does not name itself). */
export function labelsOf(p: Project, data: DataSheet): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of p.sheets) {
    if (s.kind === "results" && s.parentId === data.id) {
      const l = analysisDef(data.table.type, s.analysis)?.label;
      if (l) out[s.id] = l;
    }
  }
  return out;
}

/** The plan sentence of the methods text for a table, or null. */
export function usePlanSentence(dataId: string): string | null {
  const { project } = useProject();
  return useMemo(() => {
    const ps = planSheetFor(project, dataId);
    const data = project.sheets.find((s) => s.id === dataId);
    if (!ps || data?.kind !== "data") return null;
    return planMethodsSentence(ps.plan, planDeviations(ps.plan, data.table, resultsOf(project, dataId),
      labelsOf(project, data)));
  }, [project, dataId]);
}
