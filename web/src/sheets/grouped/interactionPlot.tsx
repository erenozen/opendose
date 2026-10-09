// Interaction plot of a two-way design: the cell means with their 95% CIs
// (engine column_statistics per cell), the row-factor levels along X and
// one line per data set, so non-parallel lines show an interaction.
import { useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { analyzeAsync, isCancelled } from "../../lib/engine";
import { DEFAULT_SCHEME, seriesStyle } from "../../lib/palette";
import { withExclusionsBlanked } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import { baseLayout, chromeFor, useDark } from "../multivariable/chart";
import { PlotlyChart } from "../multivariable/plotkit";
import { groupedPayload } from "./stats";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface Cell { mean: number | null; ci: [number, number] | null; n: number }

export default function InteractionPlot({ table, rowFactor }: {
  table: DataTableModel; rowFactor: string;
}) {
  const dark = useDark();
  const data = useMemo(() => groupedPayload(withExclusionsBlanked(table)), [table]);
  const [cells, setCells] = useState<Cell[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    // One column-statistics data set per row × data set cell.
    const flat = data.datasets.flatMap((d, j) => data.row_titles.map((_, i) => ({
      name: `${i}:${j}`, ys: [(d.ys[i] ?? []).filter((v): v is number => v !== null)] })));
    analyzeAsync({ analysis: "column_statistics", data: { datasets: flat },
      options: { normality_tests: [] } }, { signal: ctl.signal })
      .then((res) => {
        const r = res as R;
        if (r?.error) { setError(String(r.error)); return; }
        const out: Cell[][] = data.datasets.map(() => data.row_titles.map(() =>
          ({ mean: null, ci: null, n: 0 })));
        (r.datasets as R[] ?? []).forEach((ds, k) => {
          const s = (ds.descriptive ?? {}) as R;
          const j = Math.floor(k / data.row_titles.length);
          const i = k % data.row_titles.length;
          const n = typeof s.n === "number" ? s.n : 0;
          out[j][i] = { n, mean: n > 0 && typeof s.mean === "number" ? s.mean : null,
            ci: Array.isArray(s.ci_mean) && s.ci_mean.every((v: unknown) => typeof v === "number")
              ? [s.ci_mean[0], s.ci_mean[1]] : null };
        });
        setCells(out);
        setError(null);
      }, (e) => { if (!isCancelled(e)) setError(e instanceof Error ? e.message : String(e)); });
    return () => ctl.abort();
  }, [data]);

  const fig = useMemo(() => {
    if (!cells) return null;
    const chrome = chromeFor(dark);
    const x = data.row_titles;
    const traces = data.datasets.map((d, j) => {
      const st = seriesStyle(j, dark, DEFAULT_SCHEME);
      const c = cells[j];
      return {
        type: "scatter", mode: "lines+markers", name: d.name, x,
        y: c.map((v) => v.mean),
        line: { color: st.color, width: 2.2, dash: st.dash },
        marker: { color: st.color, symbol: st.symbol, size: 9 },
        error_y: { type: "data", symmetric: false, visible: true, color: st.color, thickness: 1.4,
          width: 5,
          array: c.map((v) => (v.ci && v.mean !== null ? v.ci[1] - v.mean : null)),
          arrayminus: c.map((v) => (v.ci && v.mean !== null ? v.mean - v.ci[0] : null)) },
        hovertemplate: `${d.name}, %{x}: mean %{y:.4g}<extra></extra>`,
      } as Plotly.Data;
    });
    const layout = baseLayout(chrome, rowFactor, table.yTitle.trim() || "Mean",
      { showlegend: true, height: 300, margin: { l: 64, r: 16, t: 12, b: 52 } });
    return { traces, layout };
  }, [cells, dark, data, rowFactor, table.yTitle]);

  if (error) return <p className="results-error">Interaction plot failed: {error}</p>;
  if (!fig) return <p className="hint-block">Drawing the interaction plot…</p>;
  return (
    <figure className="interaction-plot">
      <PlotlyChart data={fig.traces} layout={fig.layout} filename="interaction-plot"
        label={`Interaction plot: cell means with 95% CIs, one line per ${data.datasets.length > 1
          ? "data set" : "group"}`} dark={dark} scheme={DEFAULT_SCHEME}
        names={data.datasets.map((d) => d.name)} rowTitles={data.row_titles} />
      <figcaption className="hint-block">
        Cell means with 95% confidence intervals of each mean; one line per data set. Parallel
        lines mean the same effect in every group; lines that diverge or cross show an
        interaction.
      </figcaption>
    </figure>
  );
}
