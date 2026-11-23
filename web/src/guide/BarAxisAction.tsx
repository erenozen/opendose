// The "bars without zero" chip (sheets/column/barAxis.ts): show the same
// groups as points, or give the value axis back its zero (a linear axis,
// or the axis from 0 with a break).
import { useProject } from "../app/context";
import { Button, notify } from "../components/ui";
import { isDefaultFormat, readFormat, type GraphFormat } from "../graph/format";
import { updateSheet } from "../project/ops";
import type { GraphSheet, Sheet } from "../project/types";
import {
  barAxisProblem, pointsKind, withLinearY, withZeroBreak,
} from "../sheets/column/barAxis";

export function BarAxisAction({ graphId }: { graphId: string }) {
  const { project, apply, undo } = useProject();
  const g = project.sheets.find((s): s is GraphSheet => s.kind === "graph" && s.id === graphId);
  const problem = g && !g.frozen ? barAxisProblem(g) : null;
  if (!g || !problem) return null;
  // The fix removes this chip and its buttons: say what changed (with
  // Undo) and keep focus in the Checks row rather than on the page.
  const edit = (fn: (s: GraphSheet) => GraphSheet, done: string) => {
    const from = document.activeElement?.closest(".checks");
    apply((p) => updateSheet<Sheet>(p, g.id, (s) => (s.kind === "graph" ? fn(s) : s)),
      `graph:${g.id}:bar-axis`);
    notify(`“${g.name}” ${done}.`, { tone: "success", action: { label: "Undo", onAction: undo } });
    requestAnimationFrame(() => from?.querySelector<HTMLElement>("summary")?.focus());
  };
  const setFormat = (f: GraphFormat, done: string) => edit((s) => {
    const { format: _old, ...rest } = s.settings;
    void _old;
    return { ...s, settings: { ...rest, ...(isDefaultFormat(f) ? {} : { format: f }) } };
  }, done);
  const points = pointsKind(g.graphType);
  const format = readFormat(g.settings);
  const broken = problem.kind === "cut" ? withZeroBreak(format, problem.at) : null;
  return (
    <p className="guide-chip-action guide-chip-actions">
      {points && (
        <Button size="sm" onClick={() => edit((s) => ({ ...s, graphType: points }), "now shows the points")}>
          Show points instead</Button>
      )}
      {problem.kind === "log" && (
        <Button size="sm" onClick={() => setFormat(withLinearY(format), "now has a linear Y axis")}>
          Use a linear axis</Button>
      )}
      {broken && (
        <Button size="sm" onClick={() => setFormat(broken, "now starts at 0, with a break")}>
          Start at 0 with a break</Button>
      )}
    </p>
  );
}
