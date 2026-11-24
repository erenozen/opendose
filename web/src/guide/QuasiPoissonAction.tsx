// The dispersion chip's one-click switch (sheets/multivariable/dispersion.ts,
// glm.ts): quasi-Poisson standard errors for overdispersed counts, or
// quasi-binomial ones for overdispersed proportions (P-86), and back.
import { useProject } from "../app/context";
import { Button, notify } from "../components/ui";
import { updateSheet } from "../project/ops";
import type { ResultsSheet, Sheet } from "../project/types";
import { newId } from "../project/ids";
import { addConfiguredAnalysis } from "./actions";

export function QuasiPoissonAction({ resultsId }: { resultsId: string }) {
  const { project, apply, undo, select } = useProject();
  const sheet = project.sheets.find((s): s is ResultsSheet => s.kind === "results" && s.id === resultsId);
  if (!sheet || (sheet.analysis !== "mv_poisson" && sheet.analysis !== "mv_binomial")) return null;
  const family = sheet.analysis === "mv_binomial" ? "binomial" : "Poisson";
  const on = (sheet.options as { quasi?: boolean } | undefined)?.quasi === true;
  const toggle = () => {
    apply((p) => updateSheet<Sheet>(p, sheet.id, (s) => (s.kind === "results"
      ? { ...s, options: { ...(s.options as object), quasi: !on } } : s)));
    notify(on ? `“${sheet.name}” uses ${family} standard errors again.`
      : `“${sheet.name}” now uses quasi-${family} standard errors.`,
    { tone: "success", action: { label: "Undo", onAction: undo } });
  };
  // overdispersed counts: the negative binomial model on the same variables (P-86)
  const negbin = () => {
    let id: string | null = null;
    apply((p) => {
      const o = sheet.options as Record<string, unknown>;
      const r = addConfiguredAnalysis(p, sheet.parentId, { tableType: "multivariable", analysisId: "mv_negbin",
        options: { outcome: o.outcome, predictors: o.predictors, interactions: o.interactions,
          referenceLevels: o.referenceLevels, exposure: o.exposure, ciLevel: o.ciLevel },
        layout: "" }, newId);
      id = r.resultsId;
      return r.project;
    });
    if (id) select(id);
  };
  return (
    <p className="guide-chip-action guide-chip-actions">
      <Button size="sm" onClick={toggle}>
        {on ? `Use ${family} standard errors` : `Use quasi-${family} standard errors`}</Button>
      {family === "Poisson" && !on && (
        <Button size="sm" variant="ghost" onClick={negbin}>Fit a negative binomial model</Button>
      )}
    </p>
  );
}
