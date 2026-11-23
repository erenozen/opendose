// The sex chip's one-click fix (guide/sex.ts): two-way ANOVA with sex and
// the interaction on a grouped table whose rows or data sets look like
// sex, or the two-way analysis the table already has.
import { useProject } from "../app/context";
import { Button } from "../components/ui";
import { newId } from "../project/ids";
import type { DataSheet, ResultsSheet } from "../project/types";
import { addConfiguredAnalysis } from "./actions";
import { findSexFactor, sexTwoWayOptions } from "./sex";

export function SexFactorAction({ dataId }: { dataId: string }) {
  const { project, apply, select } = useProject();
  const data = project.sheets.find((s): s is DataSheet => s.kind === "data" && s.id === dataId);
  const factor = data ? findSexFactor(data.table) : null;
  if (!data || !factor) return null;
  const have = project.sheets.find((s): s is ResultsSheet => s.kind === "results"
    && s.parentId === dataId && s.analysis === "grouped_two_way");
  const open = () => {
    if (have) { select(have.id); return; }
    let goTo: string | null = null;
    apply((p) => {
      const r = addConfiguredAnalysis(p, dataId, { tableType: "grouped", analysisId: "grouped_two_way",
        options: sexTwoWayOptions(factor), layout: "" }, newId);
      goTo = r.resultsId;
      return r.project;
    });
    if (goTo) select(goTo);
  };
  return (
    <p className="guide-chip-action">
      <Button size="sm" onClick={open}>
        {have ? `Open “${have.name}”` : "Two-way ANOVA with sex and the interaction"}</Button>
    </p>
  );
}
