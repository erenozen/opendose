// The "separate tests per group" chip (guide/interaction.ts): the
// one-click two-way ANOVA with the interaction first on a grouped table.
import { useProject } from "../app/context";
import { newId } from "../project/ids";
import type { ResultsSheet } from "../project/types";
import { addConfiguredAnalysis } from "./actions";
import { INTERACTION_FOCUS, INTERACTION_FROM_ROWS } from "./interaction";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function InteractionAction({ dataId }: { dataId: string }) {
  const { project, apply, select } = useProject();
  const have = project.sheets.find((s): s is ResultsSheet => s.kind === "results"
    && s.parentId === dataId && s.analysis === "grouped_two_way"
    && (s.options as any)?.[INTERACTION_FOCUS] === true);
  const open = () => {
    if (have) { select(have.id); return; }
    let goTo: string | null = null;
    apply((p) => {
      const r = addConfiguredAnalysis(p, dataId, { tableType: "grouped",
        analysisId: "grouped_two_way", options: INTERACTION_FROM_ROWS, layout: "" }, newId);
      goTo = r.resultsId;
      return r.project;
    });
    if (goTo) select(goTo);
  };
  return (
    <p className="guide-chip-action">
      <button type="button" onClick={open}>
        {have ? `Open “${have.name}”` : "Two-way ANOVA with the interaction first"}</button>
    </p>
  );
}
