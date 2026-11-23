// The analysis plan check's state, for the counts of the Checks row
// (ResultsChecks.tsx); PlanCheck.tsx renders the check itself.
import { planSheetFor, resultsOf, sheetDeviations } from "../project/plan";
import type { DataSheet, Project, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";

/** The plan check's state for the Checks row's counts: null when the
 *  table has no plan (the row then offers "Make this the plan"). */
export function planCheckState(project: Project, sheet: ResultsSheet,
  data: DataSheet): "ok" | "warn" | "info" | null {
  const ps = planSheetFor(project, data.id);
  if (!ps) return null;
  const label = analysisDef(data.table.type, sheet.analysis)?.label;
  const devs = sheetDeviations(ps.plan, { id: sheet.id, name: sheet.name,
    analysisId: sheet.analysis, options: sheet.options }, data.table, resultsOf(project, data.id), label);
  return devs.some((d) => !d.reason) ? "warn" : devs.length ? "info" : "ok";
}

