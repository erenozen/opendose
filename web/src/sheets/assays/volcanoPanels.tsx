// Controls, results, methods text and graph of the volcano plot from a
// fold-change / P value table.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptSelect } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { seriesStyle } from "../../lib/palette";
import { parseCell } from "../../project/table";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { fmtP } from "../common/statFormat";
import type { ControlsProps, GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import type { VolcanoResult } from "./volcano";
import { FDR_LABEL, hitsTable, type FdrMethod, type VolcanoOptions } from "./volcanoModel";
import { Card, Check, Grid, KV, LinkedTable, Note, Problem, Row, Select, TextIn } from "./ui";
import { axis, chromeOf, layoutBase, messageLayout, useDark, useGraphSettings } from "./plotkit";

export function VolcanoControls({ table, options: o, onChange }: ControlsProps<VolcanoOptions>) {
  const set = (patch: Partial<VolcanoOptions>) => onChange({ ...o, ...patch });
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const pickCol = (key: "name" | "fc" | "p", label: string, optional = false) => (
    <Row label={label}>
      <select value={o[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">{optional ? "(row titles)" : "Choose…"}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </Row>
  );
  return (
    <div className="controls">
      <section>
        <h3>Columns</h3>
        {pickCol("name", "Names (labels)", true)}
        {pickCol("fc", "Fold change")}
        <Select label="Fold change is" value={o.fcScale}
          options={[["log2", "log2 fold change"], ["ratio", "a ratio (converted to log2)"]]}
          onChange={(fcScale) => set({ fcScale })} />
        {pickCol("p", "P value")}
        <Check label="This column is already adjusted (padj, q value, FDR)"
          checked={o.pAdjusted} onChange={(pAdjusted) => set({ pAdjusted })} />
      </section>
      <section>
        <h3>Significance</h3>
        {!o.pAdjusted && (
          <Select<FdrMethod> label="Adjust for multiple comparisons" value={o.fdr}
            options={(Object.keys(FDR_LABEL) as FdrMethod[]).map((k) => [k, FDR_LABEL[k]] as const)}
            onChange={(fdr) => set({ fdr })}
            hint="Thousands of genes tested at P < 0.05 give hundreds of false positives; the adjusted P controls the false discovery rate instead." />
        )}
        <TextIn label={o.pAdjusted || o.fdr !== "none" ? "Adjusted P below" : "P below"}
          value={o.alpha} onChange={(alpha) => set({ alpha })} />
        <TextIn label="|log2 fold change| at least" value={o.fcThreshold}
          onChange={(fcThreshold) => set({ fcThreshold })}
          hint="1 means at least a two-fold change either way." />
        <TextIn label="Label the top hits (number)" value={o.topN} inputMode="numeric"
          onChange={(topN) => set({ topN })} />
      </section>
    </div>
  );
}

export function VolcanoResults({ sheet, options, result }: ResultsProps<VolcanoOptions, VolcanoResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const rows = result.rows ?? [];
  const c = result.counts ?? { up: 0, down: 0, ns: 0 };
  const hasQ = rows.some((r) => r.q !== null);
  const hits = rows.filter((r) => r.status !== "ns").sort((a, b) => a.sig - b.sig);
  const sigWord = hasQ || options.pAdjusted ? "adjusted P" : "P";
  const base = sheet.name.replace(/^Volcano of /, "");
  return (
    <>
      <Card title="Volcano plot">
        <KV caption="Counts" rows={[
          ["Up", <span className="assay-chip-up" key="u">{c.up}</span>],
          ["Down", <span className="assay-chip-down" key="d">{c.down}</span>],
          ["Not significant or below the fold change", c.ns],
          ["Rows used", rows.length],
        ]} />
        {(result.omitted ?? 0) > 0 && (
          <Note warn>{result.omitted} row{result.omitted === 1 ? "" : "s"} without a usable fold
            change or a P value between 0 and 1 {result.omitted === 1 ? "was" : "were"} left out.</Note>
        )}
        <p className="hint-block">
          Up / down: {sigWord} below {options.alpha} and |log2 fold change| of at least {options.fcThreshold}
          {hasQ ? ` (${FDR_LABEL[options.fdr]})` : ""}.
        </p>
        <LinkedTable resultsId={sheet.id} name={`Hits of ${base}`} label="Create a table of the hits"
          make={() => hitsTable(rows, hasQ)} />
      </Card>
      <Card title={`Hits (${hits.length})`}>
        <Grid caption="Hits" head={["Name", "log2 fold change", "P", ...(hasQ ? ["Adjusted P"] : []), "Direction"]}
          rows={hits.map((r) => [r.name, formatSig(r.log2fc), fmtP(r.p), ...(hasQ ? [fmtP(r.q)] : []),
            r.status])} />
      </Card>
    </>
  );
}

export function VolcanoMethods({ options, result }: ResultsProps<VolcanoOptions, VolcanoResult>) {
  if (!result || result.error) return null;
  const hasQ = (result.rows ?? []).some((r) => r.q !== null);
  const adj = hasQ ? ` P values were adjusted by the ${FDR_LABEL[options.fdr].replace(/ \(.*\)$/, "")} method.` : "";
  const text = `Features with ${hasQ || options.pAdjusted ? "an adjusted" : "a"} P value below ${options.alpha} `
    + `and an absolute log2 fold change of at least ${options.fcThreshold} were called up- or down-regulated `
    + `(${result.counts?.up ?? 0} up, ${result.counts?.down ?? 0} down of ${(result.rows ?? []).length}).${adj} `
    + `Volcano plot drawn in OpenDose (open-source, built on SciPy).`;
  return <CopyableMethods text={text} />;
}

interface VolcanoGraphSettings { labels: "top" | "hits" | "none"; y: "p" | "q" }
const VG_DEFAULTS: VolcanoGraphSettings = { labels: "top", y: "p" };

export function VolcanoTablePlot({ graph, options, result, titles, scheme, format, onFormatChange }:
  PlotProps<VolcanoOptions, VolcanoResult>) {
  const dark = useDark();
  const [s] = useGraphSettings(graph, "volcano", VG_DEFAULTS);
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    const rows = result?.rows ?? [];
    if (!result || result.error || !rows.length) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        result?.error ? "No volcano plot: the analysis did not run" : "Reading the table…") };
    }
    const useQ = s.y === "q" && rows.some((r) => r.q !== null);
    const yOf = (r: typeof rows[number]) => -Math.log10(Math.max(useQ ? r.q ?? r.p : r.p, 1e-300));
    const groups: { key: "down" | "up" | "ns"; name: string; color: string }[] = [
      { key: "down", name: "Down", color: seriesStyle(0, dark, scheme === "mono" ? "default" : scheme).color },
      { key: "up", name: "Up", color: seriesStyle(1, dark, scheme === "mono" ? "default" : scheme).color },
      { key: "ns", name: "Not significant", color: chrome.muted },
    ];
    const traces: Plotly.Data[] = groups.map((g, i) => {
      const rs = rows.filter((r) => r.status === g.key);
      return tagTrace({
        type: "scatter", mode: "markers", x: rs.map((r) => r.log2fc), y: rs.map(yOf),
        name: `${g.name} (${rs.length})`, text: rs.map((r) => r.name),
        marker: {
          color: g.key === "ns" ? g.color + "80" : g.color, size: g.key === "ns" ? 6 : 8,
          line: { color: chrome.surface, width: g.key === "ns" ? 0 : 0.8 },
        },
        customdata: rs.map((r) => [r.p, r.q ?? null]),
        hovertemplate: "%{text}<br>log2 FC %{x:.3g}<br>P = %{customdata[0]:.3g}"
          + (rows.some((r) => r.q !== null) ? "<br>adjusted %{customdata[1]:.3g}" : "") + "<extra></extra>",
      }, { ds: i, role: "points" }) as Plotly.Data;
    });
    const t = Math.abs(parseCell(options?.fcThreshold ?? "1") ?? 1);
    const alpha = parseCell(options?.alpha ?? "0.05") ?? 0.05;
    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (t > 0) {
      for (const x of [-t, t]) {
        shapes.push({ type: "line", xref: "x", x0: x, x1: x, yref: "paper", y0: 0, y1: 1,
          line: { color: chrome.muted, width: 1, dash: "dot" } });
      }
    }
    // Horizontal threshold: alpha on the plotted scale when the plotted
    // value is the one tested, otherwise the largest P still called.
    const plottedIsTested = useQ || !rows.some((r) => r.q !== null);
    let yThr: number | null = plottedIsTested ? -Math.log10(alpha) : null;
    if (!plottedIsTested) {
      const called = rows.filter((r) => r.sig < alpha);
      if (called.length) yThr = Math.min(...called.map(yOf));
    }
    if (yThr !== null) {
      shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: yThr, y1: yThr,
        line: { color: chrome.muted, width: 1, dash: "dot" } });
      annotations.push({ xref: "paper", x: 1, xanchor: "right", yref: "y", y: yThr, yanchor: "bottom",
        showarrow: false, font: { size: 11, color: chrome.muted },
        text: plottedIsTested ? `${useQ ? "adjusted P" : "P"} = ${formatSig(alpha)}`
          : `adjusted P = ${formatSig(alpha)} (largest P called ${formatSig(10 ** -yThr, 3)})` });
    }
    const labelled = s.labels === "none" ? [] : rows.filter((r) => (s.labels === "top" ? r.top : r.status !== "ns"));
    for (const r of labelled) {
      annotations.push({ xref: "x", yref: "y", x: r.log2fc, y: yOf(r), text: r.name,
        showarrow: true, arrowhead: 0, arrowwidth: 0.8, arrowcolor: chrome.muted,
        ax: r.log2fc >= 0 ? 18 : -18, ay: -16, font: { size: 11, color: chrome.ink } });
    }
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x, { zeroline: true, zerolinecolor: chrome.axis }),
      yaxis: axis(chrome, useQ ? titles.y.replace(/\((.*)\)$/, "(adjusted P)") : titles.y, { rangemode: "tozero" }),
      shapes, annotations,
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: chrome.ink } },
      margin: { l: 64, r: 16, t: 36, b: 52 },
    });
    return { traces, layout };
  }, [result, options, s, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: ["Down", "Up", "Not significant"] }), [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="volcano-plot" />
  );
}

export function VolcanoTableOptions({ graph, result }: GraphOptionsProps<VolcanoOptions, VolcanoResult>) {
  const [s, set] = useGraphSettings(graph, "volcano", VG_DEFAULTS);
  if (!set) return null;
  const hasQ = (result?.rows ?? []).some((r) => r.q !== null);
  return (
    <>
      <OptSelect label="Label" value={s.labels}
        options={[["top", "Top hits (number set in the analysis)"], ["hits", "Every hit"], ["none", "None"]]}
        onChange={(labels) => set({ labels })} />
      {hasQ && (
        <OptSelect label="Y axis" value={s.y}
          options={[["p", "−log10(P)"], ["q", "−log10(adjusted P)"]]}
          onChange={(y) => set({ y })} />
      )}
    </>
  );
}
