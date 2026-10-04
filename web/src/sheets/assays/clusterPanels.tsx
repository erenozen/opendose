// Controls, results, methods text and graph (heat map with dendrograms
// and cluster strips) of the clustered heat map.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptNote } from "../../components/GraphOptionControls";
import FormattedPlot from "../../graph/FormattedPlot";
import { SCHEMES, seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { addDendrogram, parseDendrogram } from "../common/dendrogram";
import type { ControlsProps, GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import type { ClusterResult } from "./cluster";
import {
  LINKAGE_LABEL, METRIC_LABEL, SCALE_LABEL, membershipTable, type Axis, type ClusterOptions,
  type Linkage, type Metric, type Scaling,
} from "./clusterModel";
import { Card, Check, Grid, KV, LinkedTable, Note, Problem, Select, TextIn, Warnings } from "./ui";
import { chromeOf, divergingScale, layoutBase, messageLayout, useDark, useGraphSettings } from "./plotkit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export function ClusterControls({ table, options: o, onChange }: ControlsProps<ClusterOptions>) {
  const set = (patch: Partial<ClusterOptions>) => onChange({ ...o, ...patch });
  const mv = table.type === "multivariable";
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const continuous = names.filter((_, i) => table.datasets[i].varType !== "categorical");
  const toggleVar = (n: string, on: boolean) => {
    const cur = o.variables.length ? o.variables : continuous;
    const next = on ? [...cur, n] : cur.filter((x) => x !== n);
    set({ variables: next.length === continuous.length ? [] : next });
  };
  return (
    <div className="controls">
      {mv ? (
        <section>
          <h3>Matrix</h3>
          <Select label="Row labels" value={o.labelVariable}
            options={[["", "Row titles"] as const, ...names.map((n) => [n, n] as const)]}
            onChange={(labelVariable) => set({ labelVariable })} />
          <p className="hint-block">Each row is one item (gene, sample, animal); the continuous
            variables below are the columns of the heat map.</p>
          <div className="assay-models">
            {continuous.filter((n) => n !== o.labelVariable).map((n) => (
              <Check key={n} label={n} checked={!o.variables.length || o.variables.includes(n)}
                onChange={(v) => toggleVar(n, v)} />
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h3>Matrix</h3>
          <Select label="Each cell is the" value={o.cell}
            options={[["mean", "Mean of its replicates"], ["median", "Median of its replicates"]]}
            onChange={(cell) => set({ cell })}
            hint="Rows of the table are the heat map's rows, data sets its columns." />
        </section>
      )}
      <section>
        <h3>Clustering</h3>
        <Check label="Cluster rows" checked={o.clusterRows} onChange={(clusterRows) => set({ clusterRows })} />
        <Check label="Cluster columns" checked={o.clusterColumns}
          onChange={(clusterColumns) => set({ clusterColumns })} />
        <Select<Linkage> label="Linkage" value={o.method}
          options={(Object.keys(LINKAGE_LABEL) as Linkage[]).map((k) => [k, LINKAGE_LABEL[k]] as const)}
          onChange={(method) => set({ method })} />
        <Select<Metric> label="Distance" value={o.metric}
          options={(Object.keys(METRIC_LABEL) as Metric[]).map((k) => [k, METRIC_LABEL[k]] as const)}
          onChange={(metric) => set({ metric })}
          hint={o.metric === "correlation" ? "Items with the same pattern are close, whatever their level."
            : "Ward, centroid and median linkage assume Euclidean distances."} />
        <Select<Scaling> label="Standardise" value={o.scale}
          options={(Object.keys(SCALE_LABEL) as Scaling[]).map((k) => [k, SCALE_LABEL[k]] as const)}
          onChange={(scale) => set({ scale })} />
        {o.scale !== "none" && (
          <Select<Axis> label="Standardise each" value={o.scaleAxis}
            options={[["rows", "Row (the usual row z-score)"], ["columns", "Column"]]}
            onChange={(scaleAxis) => set({ scaleAxis })} />
        )}
        {o.clusterRows && (
          <TextIn label="Cut the row tree into k clusters" value={o.kRows} inputMode="numeric"
            onChange={(kRows) => set({ kRows })} hint="Leave blank for no cut; clusters show as a colour strip." />
        )}
        {o.clusterColumns && (
          <TextIn label="Cut the column tree into k clusters" value={o.kColumns} inputMode="numeric"
            onChange={(kColumns) => set({ kColumns })} />
        )}
      </section>
      <section>
        <h3>k-means</h3>
        <Check label="Partition with k-means" checked={o.kmeans} onChange={(kmeans) => set({ kmeans })} />
        <Check label="Help me choose k (elbow, silhouette, gap)" checked={o.chooseK}
          onChange={(chooseK) => set({ chooseK })} />
        {(o.kmeans || o.chooseK) && (
          <Select<Axis> label="Partition" value={o.kmeansAxis}
            options={[["rows", "Rows"], ["columns", "Columns"]]}
            onChange={(kmeansAxis) => set({ kmeansAxis })} />
        )}
        {o.kmeans && <TextIn label="k" value={o.kmeansK} inputMode="numeric" onChange={(kmeansK) => set({ kmeansK })} />}
        {o.chooseK && <TextIn label="Largest k to try" value={o.kMax} inputMode="numeric" onChange={(kMax) => set({ kMax })} />}
        {(o.kmeans || o.chooseK) && (
          <TextIn label="Random seed" value={o.seed} inputMode="numeric" onChange={(seed) => set({ seed })}
            hint="k-means starts from random centres (k-means++, best of 10 starts); the seed makes the result repeatable." />
        )}
      </section>
    </div>
  );
}

export function ClusterResults({ sheet, options, result }: ResultsProps<ClusterOptions, ClusterResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const m = result.matrixInput!;
  const rowNames = result.row_names as string[];
  const colNames = result.column_names as string[];
  const km = result.kmeans as R | undefined;
  const ck = result.choose_k as R | undefined;
  const kmNames = km?.axis === "columns" ? m.colNames : m.rowNames;
  const base = sheet.name.replace(/^Clustering of /, "");
  const cutRows = result.rows?.clusters as number[] | undefined;
  const cutCols = result.columns?.clusters as number[] | undefined;
  const linked = membershipTable(result, m, options);
  return (
    <>
      <Card title="Clustered heat map">
        <Warnings list={result.warnings} />
        {m.dropped.length > 0 && (
          <Note warn>{m.dropped.length} row{m.dropped.length === 1 ? "" : "s"} with a missing value
            {m.dropped.length === 1 ? " was" : " were"} left out: {m.dropped.slice(0, 8).join(", ")}
            {m.dropped.length > 8 ? ", …" : ""}.</Note>
        )}
        <KV caption="Clustering" rows={[
          ["Matrix", `${m.rowNames.length} rows × ${m.colNames.length} columns`],
          ["Standardised", options.scale === "none" ? "no" : `${options.scale === "zscore" ? "z-score" : "centred"} per ${options.scaleAxis === "rows" ? "row" : "column"}`],
          ["Linkage, distance", `${LINKAGE_LABEL[options.method]}, ${METRIC_LABEL[options.metric]}`],
          ["Row order", result.rows ? rowNames.join(", ") : "as entered (rows not clustered)"],
          ["Column order", result.columns ? colNames.join(", ") : "as entered (columns not clustered)"],
        ]} />
        {(cutRows || cutCols) && (
          <>
            <h4>Clusters from cutting the trees</h4>
            {cutRows && <Grid caption="Row clusters" head={["Cluster", "Rows"]}
              rows={groupsOf(cutRows, m.rowNames).map((g, i) => [i + 1, g.join(", ")])} />}
            {cutCols && <Grid caption="Column clusters" head={["Cluster", "Columns"]}
              rows={groupsOf(cutCols, m.colNames).map((g, i) => [i + 1, g.join(", ")])} />}
          </>
        )}
        {linked && (
          <LinkedTable resultsId={sheet.id} name={`Clusters of ${base}`}
            label="Create a table of the cluster memberships"
            make={() => membershipTable(result, m, options)} />
        )}
      </Card>
      {km && (
        <Card title={`k-means, k = ${km.k}`}>
          <KV caption="k-means fit" rows={[
            ["Within-cluster sum of squares", formatSig(km.total_within_ss)],
            ["Between-cluster / total", `${formatSig(km.between_ss)} / ${formatSig(km.total_ss)} (${formatSig(100 * km.between_ss / km.total_ss, 3)}%)`],
            ["Mean silhouette width", km.silhouette?.mean == null ? "n/a" : formatSig(km.silhouette.mean, 3)],
          ]} />
          <Grid caption="k-means memberships" head={["", "Cluster", "Silhouette width"]}
            rows={kmNames.map((n, i) => [n, km.labels[i] + 1, formatSig(km.silhouette?.widths?.[i] ?? null, 3)])} />
          <p className="hint-block">A silhouette near 1 means the item sits well inside its
            cluster; near 0, between two clusters; below 0, probably in the wrong one.</p>
        </Card>
      )}
      {ck && (
        <Card title="Choosing k">
          <Grid caption="Criteria for choosing k" head={["k", "Within SS", "Mean silhouette", "Gap", "Gap SE"]}
            rows={(ck.rows as R[]).map((r) => [r.k, formatSig(r.within_ss), formatSig(r.silhouette, 3),
              formatSig(r.gap, 3), formatSig(r.gap_se, 3)])} />
          <KV caption="Suggested k" rows={[
            ["Elbow of the within-SS curve", ck.suggested.elbow ?? "n/a"],
            ["Largest mean silhouette", ck.suggested.silhouette ?? "n/a"],
            ["Gap statistic (Tibshirani et al.)", ck.suggested.gap ?? "n/a"],
          ]} />
          <p className="hint-block">The three rules often disagree; prefer the k that also
            makes biological sense, and report how it was chosen.</p>
        </Card>
      )}
    </>
  );
}

function groupsOf(labels: number[], names: string[]): string[][] {
  const out: string[][] = [];
  labels.forEach((l, i) => { (out[l] ??= []).push(names[i]); });
  return out.filter(Boolean);
}

export function ClusterMethods({ options, result }: ResultsProps<ClusterOptions, ClusterResult>) {
  if (!result || result.error) return null;
  const what = [options.clusterRows && "rows", options.clusterColumns && "columns"].filter(Boolean).join(" and ");
  const scale = options.scale === "none" ? "" : `Values were ${options.scale === "zscore" ? "z-scored" : "centred"} `
    + `per ${options.scaleAxis === "rows" ? "row" : "column"} before clustering. `;
  const km = result.kmeans ? ` A k-means partition (k = ${result.kmeans.k}, Lloyd's algorithm from k-means++ seeds, `
    + `best of 10 starts) was assessed with silhouette widths (Rousseeuw 1987).` : "";
  const ck = result.choose_k ? " The number of clusters was examined with the elbow of the within-cluster sum of "
    + "squares, the mean silhouette width and the gap statistic (Tibshirani et al. 2001)." : "";
  const text = `${scale}${what ? `Hierarchical agglomerative clustering of the ${what} used ${
    LINKAGE_LABEL[options.method].replace(/ \(.*\)$/, "").toLowerCase()} linkage on ${
    METRIC_LABEL[options.metric].replace(/ \(.*\)$/, "").toLowerCase()} distances; the heat map shows the `
    + "matrix reordered by the leaves of the dendrograms." : ""}${km}${ck} Analysis in OpenDose (open-source, built on SciPy).`;
  return <CopyableMethods text={text.trim()} />;
}

interface HeatSettings { labels: boolean; dendrograms: boolean; strips: boolean }
const HEAT_DEFAULTS: HeatSettings = { labels: false, dendrograms: true, strips: true };

function sequential(dark: boolean): [number, string][] {
  const ramp = dark ? [...SCHEMES.sequential.dark].reverse() : SCHEMES.sequential.light;
  return ramp.map((c, i) => [i / (ramp.length - 1), c]);
}

function discreteScale(colors: string[]): [number, string][] {
  const k = colors.length;
  return colors.flatMap((c, i) => [[i / k, c], [(i + 1) / k, c]] as [number, string][]);
}

export function ClusterPlot({ graph, result, scheme, format, onFormatChange }:
  PlotProps<ClusterOptions, ClusterResult>) {
  const dark = useDark();
  const [s] = useGraphSettings(graph, "cluster", HEAT_DEFAULTS);
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!result || result.error || !Array.isArray(result.matrix)) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        result?.error ? "No heat map: the analysis did not run" : "Clustering…") };
    }
    const z = result.matrix as number[][];
    const rowNames = result.row_names as string[];
    const colNames = result.column_names as string[];
    const nr = z.length;
    const nc = colNames.length;
    const rowOrder = result.row_order as number[];
    const colOrder = result.column_order as number[];
    const km = result.kmeans as R | undefined;
    const rowLabels: number[] | undefined = km?.axis === "rows" ? km.labels : result.rows?.clusters;
    const colLabels: number[] | undefined = km?.axis === "columns" ? km.labels : result.columns?.clusters;
    const showRowDen = s.dendrograms && !!result.rows;
    const showColDen = s.dendrograms && !!result.columns;
    const rowStrip = s.strips && !!rowLabels;
    const colStrip = s.strips && !!colLabels;
    const gap = 0.01;
    const dl = showRowDen ? 0.16 : 0;
    const sw = rowStrip ? 0.03 : 0;
    const dt = showColDen ? 0.18 : 0;
    const sh = colStrip ? 0.04 : 0;
    const hx: [number, number] = [dl + sw + (dl || sw ? gap : 0), 0.82];
    const hy: [number, number] = [0, 1 - dt - sh - (dt || sh ? gap : 0)];
    const flat = z.flat();
    const diverging = (result.scale ?? "none") !== "none";
    const maxAbs = Math.max(1e-12, ...flat.map((v) => Math.abs(v)));
    const traces: Plotly.Data[] = [];
    const cellText = z.map((r, i) => r.map((v, j) => `${rowNames[i]} · ${colNames[j]}: ${formatSig(v, 3)}`));
    traces.push({
      type: "heatmap", z, x: colNames.map((_, j) => j), y: rowNames.map((_, i) => i),
      colorscale: diverging ? divergingScale(dark) : sequential(dark),
      ...(diverging ? { zmin: -maxAbs, zmax: maxAbs, zauto: false } : {}),
      text: cellText, hovertemplate: "%{text}<extra></extra>",
      colorbar: {
        title: { text: diverging ? (result.scale === "zscore" ? "z-score" : "centred") : "Value",
          side: "right", font: { color: chrome.inkSecondary } },
        outlinewidth: 0, thickness: 12, len: 0.7, x: 1, xanchor: "left", y: hy[1] / 2, yanchor: "middle",
        tickfont: { color: chrome.muted },
      },
    } as unknown as Plotly.Data);
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (s.labels && nr * nc <= 600) {
      z.forEach((r, i) => r.forEach((v, j) => annotations.push({ x: j, y: i, xref: "x", yref: "y",
        text: formatSig(v, 2), showarrow: false, font: { size: 10, color: chrome.ink } })));
    }
    const line = { color: chrome.inkSecondary, width: 1.2 };
    const layout: Partial<Plotly.Layout> & Record<string, unknown> = layoutBase(chrome, {
      margin: { l: 16, r: 64, t: 16, b: 80 }, dragmode: false, showlegend: false,
      xaxis: { domain: hx, anchor: "y", range: [-0.5, nc - 0.5], tickvals: colNames.map((_, j) => j),
        ticktext: colNames, showgrid: false, zeroline: false, ticks: "", tickangle: -45,
        tickfont: { color: chrome.ink }, automargin: true },
      yaxis: { domain: hy, anchor: "x", range: [nr - 0.5, -0.5], tickvals: rowNames.map((_, i) => i),
        ticktext: rowNames, showgrid: false, zeroline: false, ticks: "", side: "right",
        tickfont: { color: chrome.ink, size: nr > 40 ? 9 : 12 }, automargin: true },
    });
    const hidden = { showgrid: false, zeroline: false, showticklabels: false, ticks: "", showline: false } as const;
    // The same drawing as the grouped heat map's clustered toggles
    // (sheets/common/dendrogram.ts).
    const colDen = showColDen ? parseDendrogram(result.columns) : null;
    if (colDen) {
      addDendrogram(traces, layout, colDen, { side: "top", axis: 2, along: hx, across: [1 - dt, 1],
        n: nc, line });
    }
    const rowDen = showRowDen ? parseDendrogram(result.rows) : null;
    if (rowDen) {
      addDendrogram(traces, layout, rowDen, { side: "left", axis: 3, along: hy, across: [0, dl],
        n: nr, line });
    }
    const palette = (k: number) => Array.from({ length: k }, (_, i) =>
      seriesStyle(i, dark, scheme === "mono" || scheme === "sequential" ? "colorblind" : scheme).color);
    if (rowStrip) {
      const ordered = rowOrder.map((i) => rowLabels![i]);
      const k = Math.max(...ordered) + 1;
      traces.push({ type: "heatmap", z: ordered.map((l) => [l]), x: [0], y: ordered.map((_, i) => i),
        xaxis: "x4", yaxis: "y4", zmin: -0.5, zmax: k - 0.5, colorscale: discreteScale(palette(k)),
        showscale: false, ygap: 0, text: ordered.map((l, i) => [`${rowNames[i]}: cluster ${l + 1}`]),
        hovertemplate: "%{text}<extra></extra>" } as unknown as Plotly.Data);
      layout.xaxis4 = { ...hidden, domain: [dl + (dl ? gap / 2 : 0), dl + sw], anchor: "y4", range: [-0.5, 0.5] };
      layout.yaxis4 = { ...hidden, domain: hy, anchor: "x4", range: [nr - 0.5, -0.5] };
    }
    if (colStrip) {
      const ordered = colOrder.map((j) => colLabels![j]);
      const k = Math.max(...ordered) + 1;
      traces.push({ type: "heatmap", z: [ordered], x: ordered.map((_, j) => j), y: [0],
        xaxis: "x5", yaxis: "y5", zmin: -0.5, zmax: k - 0.5, colorscale: discreteScale(palette(k)),
        showscale: false, text: [ordered.map((l, j) => `${colNames[j]}: cluster ${l + 1}`)],
        hovertemplate: "%{text}<extra></extra>" } as unknown as Plotly.Data);
      layout.xaxis5 = { ...hidden, domain: hx, anchor: "y5", range: [-0.5, nc - 0.5] };
      layout.yaxis5 = { ...hidden, domain: [hy[1] + gap / 2, hy[1] + sh], anchor: "x5", range: [-0.5, 0.5] };
    }
    layout.annotations = annotations;
    return { traces, layout };
  }, [result, s, dark, scheme]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: [] as string[] }), [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="clustered-heat-map" scrollZoom={false} />
  );
}

export function ClusterPlotOptions({ graph }: GraphOptionsProps<ClusterOptions, ClusterResult>) {
  const [s, set] = useGraphSettings(graph, "cluster", HEAT_DEFAULTS);
  if (!set) return null;
  return (
    <>
      <OptCheck label="Dendrograms" checked={s.dendrograms} onChange={(dendrograms) => set({ dendrograms })} />
      <OptCheck label="Cluster colour strips" checked={s.strips} onChange={(strips) => set({ strips })} />
      <OptCheck label="Values in cells" checked={s.labels} onChange={(labels) => set({ labels })} />
      <OptNote>Strips colour the clusters of the analysis: k-means, or the tree cut into k.</OptNote>
    </>
  );
}
