// A column table drawn as a SuperPlot (sheets/common/superplot.ts): points
// coloured by experiment, experiment means as large symbols, the grand
// mean ± error of the experiment means, and brackets from the bound
// statistics (on replicate means, when that is what the graph is bound to).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import type { Comparison, GraphFormat, ResultsBlock } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import type { PointSpread } from "../../graph/swarm";
import { useDarkMode } from "../../graph/useDarkMode";
import { areaScale, estimateArea, usePlotArea } from "../../graph/usePlotArea";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, type SchemeId } from "../../lib/palette";
import { parseCell } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import type { SuperPlotSettings } from "../common/superplot";
import { buildColumnSuperPlot } from "../common/superplotTraces";

export default function SuperPlotView({ table, settings, spread, scheme, yTitle, format,
  onFormatChange, comparisons, results, caption }: {
  table: DataTableModel;
  settings: SuperPlotSettings;
  spread: PointSpread;
  scheme: SchemeId;
  yTitle: string;
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  comparisons?: Comparison[];
  results?: Partial<Record<ResultsBlock, string>>;
  caption?: string;
}) {
  const dark = useDarkMode();
  const [area, measure] = usePlotArea();
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    let scale = null;
    if (spread !== "jitter") {
      const all = table.datasets.flatMap((d) => d.rows.flatMap((r) => r.map(parseCell)))
        .filter((v): v is number => v !== null);
      const est = area ?? estimateArea(null, Math.min(...all), Math.max(...all),
        [-0.6, table.datasets.length - 0.4], { l: 60, r: 16, t: 36, b: 48 });
      scale = areaScale(est, 7.5);
    }
    return buildColumnSuperPlot(table, settings, spread, scale, scheme, dark, chrome, yTitle,
      PLOT_FONT);
  }, [table, settings, spread, scheme, dark, yTitle, area]);
  const ctx = useMemo(() => ({
    dark, scheme, datasets: table.datasets.map((d) => d.name),
    comparisons, results, caption,
    groupX: (name: string, family?: string) => (family ? null : fig.groupX(name)),
  }), [dark, scheme, table.datasets, comparisons, results, caption, fig]);
  return (
    <FormattedPlot traces={fig.traces as Plotly.Data[]} layout={fig.layout as Partial<Plotly.Layout>}
      format={format} onFormatChange={onFormatChange} ctx={ctx} filename="superplot"
      label={`SuperPlot of ${fig.groups.join(", ")} with ${fig.replicates.length} experiments`}
      onDrawn={spread !== "jitter" ? measure : undefined} />
  );
}
