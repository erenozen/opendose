// Chips above the t test / one-way ANOVA results (logScale.ts):
// - "SD grows with the mean (SD ratio 4.7): analyse on the log scale?",
//   from the engine's scale_check, with one click to switch the option on;
// - on the log scale, how many values <= 0 were left out (no logarithm);
// - on the log scale, a one-click log10 Y axis for the bound column graph.
import { useState } from "react";
import { useProject } from "../../app/context";
import { readFormat } from "../../graph/format";
import { findSheet, updateResultsOptions, updateSheet } from "../../project/ops";
import type { ResultsSheet, Sheet } from "../../project/types";
import { legendGraph } from "../../report/legendFor";
import { Banner, Button } from "../../components/ui";
import type { ColumnOptionsState } from "../../types";
import { hasLogY, LOG_AXIS_KINDS, withLogY } from "./logAxis";
import { droppedValues, logScaleApplies, onLogScale, scaleSuggestion } from "./logScale";
import { LOG_SOURCES } from "./logScaleSources";
import "./logScale.css";

function Sources() {
  return (
    <span className="source-line">Sources: {LOG_SOURCES.map((s, i) => (
      <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
    ))}.</span>
  );
}

export default function LogScaleChips({ sheet, result, options }: {
  sheet: ResultsSheet;
  result: Record<string, unknown> | null;
  options: ColumnOptionsState;
}) {
  const { apply, project, readOnly } = useProject();
  const [open, setOpen] = useState(false);
  if (!result || result.error) return null;
  const editable = !readOnly && !sheet.frozen;
  const suggest = !options.logScale && logScaleApplies(options) ? scaleSuggestion(result) : null;
  const dropped = droppedValues(result);
  const graph = onLogScale(result) ? legendGraph(project.sheets, sheet.id, sheet.parentId) : null;
  const offerAxis = !!graph && editable && !graph.frozen && LOG_AXIS_KINDS.has(graph.graphType)
    && !hasLogY(readFormat(graph.settings));
  if (!suggest && !dropped && !offerAxis) return null;

  const switchOn = () => apply((p) => updateResultsOptions(p, sheet.id,
    (o) => ({ ...(o as ColumnOptionsState), logScale: true })), `options:${sheet.id}`);
  const logAxis = () => graph && apply((p) => updateSheet<Sheet>(p, graph.id, (s) => {
    if (s.kind !== "graph" || s.frozen) return s;
    return { ...s, settings: { ...s.settings, format: withLogY(readFormat(s.settings)) } };
  }), `graph:${graph.id}:format`);
  const dataName = (findSheet(project, sheet.parentId) as { name?: string } | undefined)?.name;

  return (
    <div className="log-chips">
      {suggest && (
        <Banner tone="info" className="log-chip" data-chip="scale-check">
          <Banner.Title>{suggest.label}</Banner.Title>
          <Banner.Detail>
            <p>
              Values such as concentrations, titres and expression levels often vary by a factor
              rather than by an amount: here {suggest.reason}. A t test or ANOVA on such data has
              wide confidence intervals and little power; on log10(values) the scatter is even, and
              the result is a ratio of geometric means (a fold change) with its CI.{" "}
              <Sources />
            </p>
          </Banner.Detail>
          {editable && (
            <Banner.Actions>
              <Button onClick={switchOn}>Analyse on the log scale</Button>
            </Banner.Actions>
          )}
        </Banner>
      )}
      {dropped && (
        <Banner tone="warn" className="log-chip" data-chip="log-dropped">
          <Banner.Title>
            {dropped.label}
            {dropped.groups.length > 0 && ` (${dropped.groups.map(([g, n]) => `${g}: ${n}`).join(", ")})`}
          </Banner.Title>
          {open && (
            <Banner.Detail>
              <p>
                Zero and negative values have no logarithm, so the log-scale analysis cannot use
                them. If they are real results (below the detection limit, no response), leaving
                them out raises the geometric mean of that group: report how many there were, and
                consider a rank-based test (Mann-Whitney or Kruskal-Wallis), which uses every value
                without a transform, or analyse the values as they are.{" "}
                <Sources />
              </p>
            </Banner.Detail>
          )}
          <Banner.Actions>
            <Button variant="ghost" aria-expanded={open}
              onClick={() => setOpen(!open)}>{open ? "Less" : "What to consider"}</Button>
          </Banner.Actions>
        </Banner>
      )}
      {offerAxis && (
        <Banner tone="info" className="log-chip" data-chip="log-axis">
          <Banner.Title>
            The analysis is on the log scale; the graph{dataName ? ` of ${dataName}` : ""} has a
            linear Y axis.
          </Banner.Title>
          <Banner.Actions>
            <Button onClick={logAxis}>Use a log10 Y axis</Button>
          </Banner.Actions>
        </Banner>
      )}
    </div>
  );
}
