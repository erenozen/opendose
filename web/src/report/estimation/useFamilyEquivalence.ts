// The family's t test with an equivalence margin (margins.ts
// equivalenceSheet), computed if nobody has yet, for the estimation plot
// and its legend. Off (null) for other graphs and for frozen ones, whose
// snapshot holds only their own result.
import { useMemo } from "react";
import { useProject } from "../../app/context";
import { useAnalysisResult } from "../../app/useAnalysisResult";
import { findSheet } from "../../project/ops";
import type { GraphSheet, ResultsSheet } from "../../project/types";
import { GRAPH_ESTIMATION } from "./run";
import { equivalenceSheet, type EquivalenceLink } from "./margins";

export function useFamilyEquivalence(graph: GraphSheet | null | undefined): EquivalenceLink | null {
  const { project } = useProject();
  const on = !!graph && graph.graphType === GRAPH_ESTIMATION && !graph.frozen;
  const sheet = on ? equivalenceSheet(project.sheets, graph!.parentId) as ResultsSheet | null : null;
  const data = sheet ? findSheet(project, graph!.parentId) : undefined;
  const live = useAnalysisResult(sheet, data?.kind === "data" ? data.table : null, "background");
  const found = !!sheet;
  return useMemo(() => (found ? { result: live.result, options: live.options } : null),
    [found, live.result, live.options]);
}
