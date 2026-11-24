// The separation refusal's next step (P-89): a logistic regression refused
// because the predictors separate the outcome is fitted again with Firth's
// penalized likelihood in one click, and the answer pane says that the
// estimate is shrunk. Shown in the failed answer (components/ResultsAnswer).
import { useProject } from "../app/context";
import { Button, notify } from "../components/ui";
import { updateSheet } from "../project/ops";
import type { ResultsSheet, Sheet } from "../project/types";
import { SRC } from "./sources";

export function FirthAction({ resultsId }: { resultsId: string }) {
  const { project, apply, undo } = useProject();
  const sheet = project.sheets.find((s): s is ResultsSheet => s.kind === "results" && s.id === resultsId);
  if (!sheet) return null;
  const fit = () => {
    apply((p) => updateSheet<Sheet>(p, sheet.id, (s) => (s.kind === "results"
      ? { ...s, options: { ...(s.options as object), firth: true } } : s)));
    notify(`“${sheet.name}” now uses Firth's penalized likelihood.`,
      { tone: "success", action: { label: "Undo", onAction: undo } });
  };
  const src = SRC.heinzeSchemper2002;
  return (
    <>
      <p className="answer-next">
        Firth&apos;s penalized likelihood gives a finite odds ratio with a profile confidence interval. Its
        estimates are shrunk toward no effect, so read the odds ratio as a conservative estimate, and
        expect a wide interval (<a href={src.url} target="_blank" rel="noreferrer">Heinze &amp; Schemper 2002</a>).
      </p>
      <Button size="sm" variant="primary" onClick={fit}>Fit with Firth&apos;s correction</Button>
    </>
  );
}
