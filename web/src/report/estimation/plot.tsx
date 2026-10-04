// The estimation plot panel (figure.ts builds it), drawn through the
// graph-format layer.
import { useMemo } from "react";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../lib/palette";
import { numericData } from "../../project/table";
import type { PlotProps } from "../../sheets/types";
import { estimationFigure } from "./figure";
import type { EstimationOptions } from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function EstimationPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<EstimationOptions, Record<string, any>>) {
  const dark = useDarkMode();
  const ok = !!result && !result.error && Array.isArray(result.comparisons);
  const aligned = useMemo(() => {
    if (!ok || !result!.paired) return undefined;
    const out: Record<string, (number | null)[]> = {};
    numericData(table).datasets.forEach((d, i) => { out[d.name || `Group ${i + 1}`] = d.ys.map((r) => r[0] ?? null); });
    return out;
  }, [ok, result, table]);
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    if (!ok) {
      return {
        traces: [], names: [] as string[],
        layout: {
          paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
          xaxis: { visible: false }, yaxis: { visible: false },
          annotations: [{ text: result?.error ? "No estimation plot: the analysis failed (see the results)"
            : "Computing the bootstrap…", showarrow: false, x: 0.5, y: 0.5, xref: "paper", yref: "paper",
          font: { color: chrome.muted, size: 13 } }],
        } as any,
      };
    }
    const names = table.datasets.map((d, i) => d.name || `Group ${i + 1}`);
    // Grouped tables: "Day 7: Vehicle" belongs to data set "Vehicle".
    const dsOf = (g: string) => {
      const direct = names.indexOf(g);
      if (direct >= 0) return direct;
      const k = names.findIndex((n) => g.endsWith(`: ${n}`));
      return k >= 0 ? k : 0;
    };
    return estimationFigure({
      result: result!, chrome, font: PLOT_FONT, yTitle: titles.y, aligned, dsOf,
      color: (i) => seriesStyle(i, dark, scheme).color,
      symbol: (i) => seriesStyle(i, dark, scheme).symbol,
    });
  }, [ok, result, dark, scheme, titles.y, aligned, table]);
  const datasets = useMemo(() => table.datasets.map((d, i) => d.name || `Group ${i + 1}`), [table]);
  const ctx = useMemo(() => ({ dark, scheme, datasets }), [dark, scheme, datasets]);
  const kind = result?.plot?.kind === "cumming" ? "Cumming" : "Gardner-Altman";
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="estimation-plot"
      label={`${kind} estimation plot`} />
  );
}
