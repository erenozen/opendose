// One line under the headline of a rank test's results: what the test
// compares, and how the bound graph shows it (sheets/column/rankSummary.ts).
import { useMemo } from "react";
import { useProject } from "../../app/context";
import type { DataSheet, ResultsSheet } from "../../project/types";
import { legendGraph } from "../../report/legendFor";
import { normalizeColumnGraph } from "../../sheets/column/graphSettings";
import { rankLine, resolveSummary } from "../../sheets/column/rankSummary";
import { superPlotOn } from "../../sheets/common/superplot";
import { SRC } from "../../guide/sources";

export default function RankLine({ sheet, data, options, result }: {
  sheet: ResultsSheet; data: DataSheet; options: unknown; result: unknown;
}) {
  const { project } = useProject();
  const line = useMemo(() => {
    if (sheet.analysis !== "column" || !result) return null;
    const g = legendGraph(project.sheets, sheet.id, data.id);
    let shown: Parameters<typeof rankLine>[1] = null;
    if (g && data.table.subcolumnFormat === "replicates") {
      const s = normalizeColumnGraph(g.settings.column);
      if (g.graphType === "box") shown = "box";
      else if ((g.graphType === "scatter" || g.graphType === "bar") && !superPlotOn(s.superplot, result)) {
        shown = resolveSummary(s.summary, options);
      }
    }
    return rankLine(options, shown);
  }, [sheet, data, options, result, project.sheets]);
  if (!line) return null;
  return (
    <p className="answer-rank">
      {line}{" "}
      <a href={SRC.hart2001.url} target="_blank" rel="noreferrer" title={SRC.hart2001.label}>Hart 2001</a>
    </p>
  );
}
