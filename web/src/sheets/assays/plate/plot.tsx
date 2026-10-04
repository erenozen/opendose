// Plate heat map: the normalised value (or the raw reading) of every well
// of one plate, rows A at the top, with each well's role written in it.
// Drawn through the format layer (no axes / data-set formatting).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptSelect } from "../../../components/GraphOptionControls";
import FormattedPlot from "../../../graph/FormattedPlot";
import { useDarkMode } from "../../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT } from "../../../lib/palette";
import { asRecord, useGraphOptions } from "../../common/graphOptions";
import type { GraphOptionsProps, PlotProps } from "../../types";
import { dims, ROW_LETTERS, shortConc, wellName, type PlateOptions, type PlateRun } from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface HeatOptions { plate: number; show: "normalized" | "raw" }

function sanitize(raw: unknown): HeatOptions {
  const o = asRecord(raw);
  return {
    plate: typeof o.plate === "number" && o.plate >= 0 ? Math.floor(o.plate) : 0,
    show: o.show === "raw" ? "raw" : "normalized",
  };
}

export function PlateHeatmap({ graph, options, result, format, onFormatChange, scheme }:
  PlotProps<PlateOptions, PlateRun>) {
  const dark = useDarkMode();
  const opts = sanitize(graph.settings.assayPlate);
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const plates = result?.plates ?? [];
    const k = Math.min(opts.plate, Math.max(0, plates.length - 1));
    const p = plates[k];
    const fmt = options?.format ?? 96;
    const [nr, nc] = dims(fmt);
    const z: (number | null)[][] = [];
    const text: string[][] = [];
    const hover: string[][] = [];
    const wells = new Map<string, any>((p?.wells ?? []).map((w: any) => [w.well, w]));
    for (let r = 0; r < nr; r++) {
      z.push([]); text.push([]); hover.push([]);
      for (let c = 0; c < nc; c++) {
        const w = wells.get(wellName(r, c));
        const v = w ? (opts.show === "raw" ? w.raw : w.normalized) : null;
        z[r].push(typeof v === "number" ? v : null);
        const label = !w ? "" : w.role === "blank" ? "B" : w.role === "negative" ? "V"
          : w.role === "positive" ? "K" : w.concentration != null ? shortConc(w.concentration) : "";
        text[r].push(fmt === 384 ? "" : label);
        hover[r].push(w ? `${wellName(r, c)}: ${w.role === "sample" ? `${w.compound ?? "Sample"} ${w.concentration ?? ""}` : w.role}`
          + `<br>reading ${w.raw ?? "none"}${w.normalized != null ? `<br>normalised ${Number(w.normalized.toPrecision(4))}` : ""}`
          : `${wellName(r, c)}: empty`);
      }
    }
    const traces: Plotly.Data[] = [{
      type: "heatmap", z, text: text as any, customdata: hover as any,
      texttemplate: "%{text}", textfont: { size: 10 },
      hovertemplate: "%{customdata}<extra></extra>",
      x: Array.from({ length: nc }, (_, c) => String(c + 1)),
      y: Array.from({ length: nr }, (_, r) => ROW_LETTERS[r]),
      colorscale: scheme === "mono" ? "Greys" : "Viridis", reversescale: false,
      colorbar: {
        title: { text: opts.show === "raw" ? "Reading" : "Normalised", side: "right" },
        thickness: 12, outlinewidth: 0, tickfont: { color: chrome.muted },
      },
      xgap: 2, ygap: 2, hoverongaps: false,
    } as Plotly.Data];
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 12 },
      margin: { l: 36, r: 16, t: 28, b: 24 },
      xaxis: { side: "top", type: "category", showgrid: false, zeroline: false, fixedrange: true, tickfont: { color: chrome.muted } },
      yaxis: { type: "category", autorange: "reversed", showgrid: false, zeroline: false, fixedrange: true, scaleanchor: "x", tickfont: { color: chrome.muted } },
      annotations: plates.length && !p?.error ? [] : [{
        text: p?.error ? String(p.error) : "Set up the plate map to see the plate", showarrow: false,
        x: 0.5, y: 0.5, xref: "paper", yref: "paper", font: { color: chrome.muted, size: 13 },
      }],
      uirevision: "keep",
    };
    return { traces, layout };
  }, [dark, result, options, opts.plate, opts.show, scheme]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: [] as string[] }), [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="plate-map" scrollZoom={false}
      label="Plate heat map" />
  );
}

export function PlateHeatOptions({ graph, result }: GraphOptionsProps<PlateOptions, PlateRun>) {
  const [opts, setOpts] = useGraphOptions(graph, "assayPlate", sanitize);
  const n = result?.plates?.length ?? 1;
  return (
    <>
      {n > 1 && (
        <OptSelect label="Plate" value={String(Math.min(opts.plate, n - 1))}
          options={Array.from({ length: n }, (_, i) => [String(i), `Plate ${i + 1}`] as const)}
          onChange={(v) => setOpts({ plate: Number(v) })} />
      )}
      <OptSelect label="Colour by" value={opts.show}
        options={[["normalized", "Normalised value"], ["raw", "Raw reading"]] as const}
        onChange={(v) => setOpts({ show: v === "raw" ? "raw" : "normalized" })} />
    </>
  );
}
