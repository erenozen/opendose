// Plot panels of the grouped table: the raw-table graphs (bars, scatter,
// box, lines, three-way, heat map) and the volcano plot of multiple
// t tests. Each renders a compact "Graph options" disclosure above the
// plot; its choices are stored on the graph sheet.
import { useEffect, useId, useMemo, type ReactNode } from "react";
import type Plotly from "plotly.js-dist-min";
import { seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import type { PlotProps } from "../types";
import { buildGrouped, clusterByFor } from "./buildGrouped";
import { buildHeat } from "./buildHeat";
import {
  G_BOX, G_LINES, G_SCATTER, G_SEPARATED, G_STACKED, G_THREE_WAY,
  HEAT_VALUE_LABEL, normalizeGraph, normalizeHeat,
  type GroupedGraphSettings, type HeatSettings, type HeatValue,
  LOG_TESTS, type MultiTOptions, type ThreeWayOptions,
} from "./options";
import { baseLayout, useGraphSetting, usePlot, valueAxis } from "./plotting";
import { cellStats, ERROR_LABELS, type ErrorKind } from "./stats";
import "./grouped.css";

// ------------------------------------------------------------ controls

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="go-field"><span>{label}</span>{children}</label>;
}

function Check({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="go-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="go-field go-slider">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id}>{format(value)}</output>
    </div>
  );
}

function OptionsShell({ children }: { children: ReactNode }) {
  return (
    <details className="graph-options">
      <summary>Graph options</summary>
      <div className="go-grid">{children}</div>
    </details>
  );
}

function GroupedOptions({ kind, s, set }: {
  kind: string; s: GroupedGraphSettings; set: (s: GroupedGraphSettings) => void;
}) {
  const up = (patch: Partial<GroupedGraphSettings>) => set({ ...s, ...patch });
  const bars = kind !== G_SCATTER && kind !== G_BOX && kind !== G_LINES;
  const lines = kind === G_LINES;
  const threeWay = kind === G_THREE_WAY;
  const clusterBy = clusterByFor(kind, s);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <OptionsShell>
      {kind !== G_BOX && (
        <Field label="Error bars">
          <select value={s.error} onChange={(e) => up({ error: e.target.value as ErrorKind })}>
            {(Object.keys(ERROR_LABELS) as ErrorKind[]).map((k) => (
              <option key={k} value={k}>{ERROR_LABELS[k]}</option>
            ))}
          </select>
        </Field>
      )}
      {kind !== G_BOX && kind !== G_STACKED && s.error !== "none" && (
        <Field label="Direction">
          <select value={s.errorDir}
            onChange={(e) => up({ errorDir: e.target.value as "both" | "above" })}>
            <option value="both">Above and below</option>
            <option value="above">Above only</option>
          </select>
        </Field>
      )}
      {!threeWay && (
        <Field label={lines ? "X axis shows" : "Group bars by"}>
          <select value={clusterBy}
            onChange={(e) => up({ clusterBy: e.target.value as "rows" | "datasets" })}>
            <option value="rows">{lines ? "Rows (one line per dataset)"
              : "Rows: row titles under groups"}</option>
            <option value="datasets">{lines ? "Datasets (one line per row)"
              : "Datasets: dataset titles under groups"}</option>
          </select>
        </Field>
      )}
      <Field label="Grand line">
        <select value={s.grand}
          onChange={(e) => up({ grand: e.target.value as GroupedGraphSettings["grand"] })}>
          <option value="none">None</option>
          <option value="mean">Grand mean</option>
          <option value="median">Grand median</option>
        </select>
      </Field>
      {lines && (
        <Field label="Lines connect">
          <select value={s.lineMode}
            onChange={(e) => up({ lineMode: e.target.value as "means" | "subjects" })}>
            <option value="means">Means</option>
            <option value="subjects">Means and each subcolumn (before-after)</option>
          </select>
        </Field>
      )}
      {!lines && kind !== G_STACKED && (
        <Slider label="Gap between groups" value={s.clusterGap} min={0} max={0.8}
          step={0.05} format={pct} onChange={(v) => up({ clusterGap: v })} />
      )}
      {kind === G_STACKED && (
        <Slider label="Gap between stacks" value={s.clusterGap} min={0} max={0.8}
          step={0.05} format={pct} onChange={(v) => up({ clusterGap: v })} />
      )}
      {!lines && kind !== G_STACKED && (
        <Slider label="Gap between bars" value={s.barGap} min={0} max={1}
          step={0.02} format={(v) => `${Math.round(v * 100)}% of a bar`}
          onChange={(v) => up({ barGap: v })} />
      )}
      {(bars || kind === G_BOX) && kind !== G_STACKED && (
        <Check label="Show individual values" checked={s.points}
          onChange={(v) => up({ points: v })} />
      )}
      <Check label={lines || threeWay ? "Reverse order on the X axis" : "Reverse group order"}
        checked={s.clustersReverse} onChange={(v) => up({ clustersReverse: v })} />
      <Check label={kind === G_SEPARATED ? "Reverse bar order within groups"
        : "Reverse dataset (series) order"}
      checked={s.seriesReverse} onChange={(v) => up({ seriesReverse: v })} />
      {kind !== G_SEPARATED && (
        <Check label="Legend" checked={s.legend} onChange={(v) => up({ legend: v })} />
      )}
      {kind === G_STACKED && (
        <p className="go-note">Stacked bars show error bars above each segment only.</p>
      )}
    </OptionsShell>
  );
}

// ------------------------------------------------------------ raw-table graphs

const isThreeWayOptions = (o: unknown): o is ThreeWayOptions =>
  !!o && typeof o === "object" && Array.isArray((o as ThreeWayOptions).assign)
  && Array.isArray((o as ThreeWayOptions).bLevels);

export function GroupedPlot({ graph, table, options, titles, scheme }: PlotProps) {
  const [settings, set] = useGraphSetting(graph, "grouped", normalizeGraph);
  const { ref, dark, chrome, draw } = usePlot("grouped-graph");
  const cells = useMemo(() => cellStats(table), [table]);
  const threeWay = isThreeWayOptions(options) ? options : null;
  useEffect(() => {
    const { traces, layout } = buildGrouped({
      kind: graph.graphType, table, cells, settings, scheme, dark, chrome,
      yTitle: titles.y, threeWay,
    });
    draw(traces, layout);
  }, [graph.graphType, table, cells, settings, scheme, dark, chrome, titles.y,
    threeWay, draw]);
  return (
    <>
      {set && <GroupedOptions kind={graph.graphType} s={settings} set={set} />}
      <div className="plot" ref={ref} />
    </>
  );
}

// ------------------------------------------------------------ heat map

function HeatOptions({ h, set }: { h: HeatSettings; set: (h: HeatSettings) => void }) {
  const up = (patch: Partial<HeatSettings>) => set({ ...h, ...patch });
  return (
    <OptionsShell>
      <Field label="Each cell shows">
        <select value={h.value} onChange={(e) => up({ value: e.target.value as HeatValue })}>
          {(Object.keys(HEAT_VALUE_LABEL) as HeatValue[]).map((k) => (
            <option key={k} value={k}>{HEAT_VALUE_LABEL[k]}</option>
          ))}
        </select>
      </Field>
      <Field label="Color map">
        <select value={h.palette}
          onChange={(e) => up({ palette: e.target.value as HeatSettings["palette"] })}>
          <option value="sequential">Single hue (from the color scheme)</option>
          <option value="diverging">Diverging (two hues around a center)</option>
          <option value="grayscale">Grayscale</option>
        </select>
      </Field>
      <Field label="Lowest value">
        <input className="go-num" inputMode="decimal" placeholder="auto" value={h.min}
          onChange={(e) => up({ min: e.target.value })} />
      </Field>
      <Field label="Highest value">
        <input className="go-num" inputMode="decimal" placeholder="auto" value={h.max}
          onChange={(e) => up({ max: e.target.value })} />
      </Field>
      {h.palette === "diverging" && (
        <Field label="Center value">
          <input className="go-num" inputMode="decimal" placeholder="halfway"
            value={h.center} onChange={(e) => up({ center: e.target.value })} />
        </Field>
      )}
      <Check label="Reverse colors" checked={h.reverse} onChange={(v) => up({ reverse: v })} />
      <Check label="Show values in cells" checked={h.labels}
        onChange={(v) => up({ labels: v })} />
      {h.labels && (
        <Field label="Significant digits">
          <input className="go-num" type="number" min={1} max={8} value={h.digits}
            onChange={(e) => up({ digits: Number(e.target.value) || 3 })} />
        </Field>
      )}
      <Slider label="Gap between cells" value={h.gap} min={0} max={12} step={1}
        format={(v) => `${v} px`} onChange={(v) => up({ gap: v })} />
      <Field label="Blank cells">
        <input type="color" value={h.missing} aria-label="Color of blank or excluded cells"
          onChange={(e) => up({ missing: e.target.value })} />
      </Field>
      <Check label="Cross out blank cells" checked={h.crossMissing}
        onChange={(v) => up({ crossMissing: v })} />
      <Check label="Legend (color bar)" checked={h.legend}
        onChange={(v) => up({ legend: v })} />
      {h.legend && (
        <Field label="Legend title">
          <input className="go-text" value={h.legendTitle}
            placeholder={HEAT_VALUE_LABEL[h.value]}
            onChange={(e) => up({ legendTitle: e.target.value })} />
        </Field>
      )}
      <Check label="Datasets as rows (transpose)" checked={h.transpose}
        onChange={(v) => up({ transpose: v })} />
      <Check label="Column labels on top" checked={h.xTop}
        onChange={(v) => up({ xTop: v })} />
    </OptionsShell>
  );
}

export function HeatMapPlot({ graph, table, titles, scheme }: PlotProps) {
  const [h, set] = useGraphSetting(graph, "heat", normalizeHeat);
  const { ref, dark, chrome, draw } = usePlot("heat-map");
  const cells = useMemo(() => cellStats(table), [table]);
  useEffect(() => {
    const { traces, layout } = buildHeat(table, cells, h, scheme, chrome, dark, titles.y);
    draw(traces, layout);
  }, [table, cells, h, scheme, dark, chrome, titles.y, draw]);
  return (
    <>
      {set && <HeatOptions h={h} set={set} />}
      <div className="plot" ref={ref} />
    </>
  );
}

// ------------------------------------------------------------ volcano

interface VolcanoSettings { labels: "flagged" | "all" | "none" }
const normalizeVolcano = (raw: unknown): VolcanoSettings => {
  const v = (raw && typeof raw === "object" ? raw as Record<string, unknown> : {}).labels;
  return { labels: v === "all" || v === "none" ? v : "flagged" };
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export function VolcanoPlot({ graph, result, titles, scheme }: PlotProps<MultiTOptions, any>) {
  const [vs, set] = useGraphSetting(graph, "volcano", normalizeVolcano);
  const { ref, dark, chrome, draw } = usePlot("volcano-plot");
  useEffect(() => {
    const layout: Partial<Plotly.Layout> = { ...baseLayout(chrome) };
    if (!result || result.error || !Array.isArray(result.rows)) {
      draw([], {
        ...layout, xaxis: { visible: false }, yaxis: { visible: false },
        annotations: [{ xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false,
          text: result?.error ? "No volcano plot: the analysis did not run"
            : "Waiting for the multiple t tests", font: { color: chrome.muted } }],
      });
      return;
    }
    const ratio = LOG_TESTS.includes(result.test);
    const rows = (result.rows as any[]).filter((r) => !r.omitted && r.p != null
      && (ratio ? r.ratio > 0 : r.difference != null));
    const accent = seriesStyle(0, dark, scheme === "mono" ? "default" : scheme).color;
    const pick = (flag: boolean) => rows.filter((r) => !!r.significant === flag);
    const trace = (rs: any[], flag: boolean): Plotly.Data => ({
      type: "scatter",
      mode: (vs.labels === "all" || (vs.labels === "flagged" && flag))
        ? "text+markers" : "markers",
      x: rs.map((r) => (ratio ? r.ratio : r.difference)),
      y: rs.map((r) => r.neg_log10_p),
      text: rs.map((r) => r.row),
      textposition: "top center",
      textfont: { size: 11, color: flag ? chrome.ink : chrome.muted },
      name: flag ? result.flag_label?.replace("?", "") || "Flagged" : "Not flagged",
      marker: {
        color: flag ? accent : chrome.muted, size: flag ? 10 : 7,
        symbol: flag ? "circle" : "circle-open",
        line: { color: flag ? chrome.surface : chrome.muted, width: flag ? 1.2 : 1.5 },
      },
      customdata: rs.map((r) => [r.p, r.p_adjusted]),
      hovertemplate: `%{text}<br>${ratio ? "ratio" : "difference"} %{x:.4g}`
        + "<br>P = %{customdata[0]:.4g}"
        + (result.method !== "none" ? "<br>adjusted %{customdata[1]:.4g}" : "")
        + "<extra></extra>",
    } as Plotly.Data);
    const shapes: Partial<Plotly.Shape>[] = [{
      type: "line", xref: "x", x0: ratio ? 1 : 0, x1: ratio ? 1 : 0, yref: "paper",
      y0: 0, y1: 1, line: { color: chrome.axis, width: 1 },
    }];
    const flagged = pick(true);
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (flagged.length) {
      // Threshold drawn at the largest P value that was still flagged.
      const ymin = Math.min(...flagged.map((r) => r.neg_log10_p));
      shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: ymin, y1: ymin,
        line: { color: chrome.muted, width: 1, dash: "dot" } });
      annotations.push({ xref: "paper", x: 1, xanchor: "right", y: ymin, yanchor: "bottom",
        showarrow: false, font: { size: 11, color: chrome.muted },
        text: `largest flagged P = ${formatSig(10 ** -ymin)}` });
    }
    draw([trace(pick(false), false), trace(flagged, true)], {
      ...layout,
      xaxis: { ...valueAxis(chrome, titles.x), type: ratio ? "log" : "linear" },
      yaxis: { ...valueAxis(chrome, titles.y), rangemode: "tozero" },
      shapes, annotations,
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom",
        font: { color: chrome.ink, size: 12 } },
      margin: { l: 64, r: 16, t: 36, b: 52 },
    });
  }, [result, vs.labels, dark, chrome, scheme, titles.x, titles.y, draw]);
  return (
    <>
      {set && (
        <OptionsShell>
          <Field label="Label points">
            <select value={vs.labels}
              onChange={(e) => set({ labels: e.target.value as VolcanoSettings["labels"] })}>
              <option value="flagged">Flagged rows</option>
              <option value="all">Every row</option>
              <option value="none">None</option>
            </select>
          </Field>
        </OptionsShell>
      )}
      <div className="plot" ref={ref} />
    </>
  );
}
