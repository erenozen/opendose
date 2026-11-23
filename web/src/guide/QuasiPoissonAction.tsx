// The dispersion chip's one-click switch (sheets/multivariable/dispersion.ts):
// quasi-Poisson standard errors for overdispersed counts, and back.
import { useProject } from "../app/context";
import { Button, notify } from "../components/ui";
import { updateSheet } from "../project/ops";
import type { ResultsSheet, Sheet } from "../project/types";

export function QuasiPoissonAction({ resultsId }: { resultsId: string }) {
  const { project, apply, undo } = useProject();
  const sheet = project.sheets.find((s): s is ResultsSheet => s.kind === "results" && s.id === resultsId);
  if (!sheet || sheet.analysis !== "mv_poisson") return null;
  const on = (sheet.options as { quasi?: boolean } | undefined)?.quasi === true;
  const toggle = () => {
    apply((p) => updateSheet<Sheet>(p, sheet.id, (s) => (s.kind === "results"
      ? { ...s, options: { ...(s.options as object), quasi: !on } } : s)));
    notify(on ? `“${sheet.name}” uses Poisson standard errors again.`
      : `“${sheet.name}” now uses quasi-Poisson standard errors.`,
    { tone: "success", action: { label: "Undo", onAction: undo } });
  };
  return (
    <p className="guide-chip-action">
      <Button size="sm" onClick={toggle}>
        {on ? "Use Poisson standard errors" : "Use quasi-Poisson standard errors"}</Button>
    </p>
  );
}
