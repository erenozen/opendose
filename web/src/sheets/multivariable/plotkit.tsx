// The Plotly chart shared by the multiple-variables graphs: drawn through
// the graph-format layer, so Format graph / Format axes / annotations
// apply (see src/graph/README.md).
import { useMemo, type ReactNode } from "react";
import type Plotly from "plotly.js-dist-min";
import type { GraphFormat } from "../../graph/format";
import FormattedPlot from "../../graph/FormattedPlot";
import type { SchemeId } from "../../lib/palette";

/** The Plotly div the export panel looks for. `names` are the data sets
 *  Format graph formats (index = trace tag `ds`); keep the array stable
 *  (from the same useMemo as the traces). */
export function PlotlyChart({ data, layout, filename, label, format, onFormatChange, dark,
  scheme, names, rowTitles }: {
  data: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
  filename: string;
  label: string;
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  dark: boolean;
  scheme: SchemeId;
  names?: string[];
  rowTitles?: string[];
}) {
  const ctx = useMemo(() => ({ dark, scheme, datasets: names ?? [], rowTitles }),
    [dark, scheme, names, rowTitles]);
  return (
    <FormattedPlot traces={data} layout={layout} format={format} onFormatChange={onFormatChange}
      ctx={ctx} filename={filename} label={label} />
  );
}

/** Shown instead of a graph when the result cannot be drawn. */
export function PlotMessage({ children }: { children: ReactNode }) {
  return <div className="plot mv-plot-message"><p className="empty-hint">{children}</p></div>;
}
