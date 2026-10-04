// The legend sentence of a graph: what the centre and the error bars are,
// what the points are, n per group (experiments when the graph is a
// SuperPlot) and, when asterisks are drawn, their scale. Journals ask for
// exactly this in every figure legend (error-bar meaning, n and its unit,
// the star thresholds).
//
//   legendSentence(graph, table, result?) -> string ("" = nothing to say)
//
// is the one entry point (the reporting package's legend generator reuses
// it); composeLegend(spec) builds the words from a plain description and
// is what the tests pin. Pure.
import type { DataTableModel, GraphSheet } from "../project/types.ts";
import { parseCell } from "../project/table.ts";
import {
  normalizeColumnGraph, type ColumnSummary,
} from "../sheets/column/graphSettings.ts";
import {
  replicateCounts, replicateInfo, replicateSummary, superPlotOn, type SuperCenter, type SuperError,
} from "../sheets/common/superplot.ts";
import {
  G_BOX, G_HEATMAP, G_INTERLEAVED, G_LINES, G_SCATTER, G_SEPARATED, G_STACKED, G_VOLCANO,
  normalizeGraph,
} from "../sheets/grouped/options.ts";
import { cellStats, type ErrorKind } from "../sheets/grouped/stats.ts";
import { readFormat } from "./format.ts";
import { starScale, type PStyle } from "./significance.ts";

/** Centre and error of the summary marks. */
export type LegendSummary = ColumnSummary | "mean_range" | "mean" | "as_entered";

export interface LegendGroup { name: string; n: number }

export interface LegendSpec {
  /** What summarises each group. */
  display: "scatter" | "bar" | "box" | "violin" | "lines" | "superplot";
  summary: LegendSummary;
  /** Individual values are drawn. */
  points: boolean;
  /** n of each group (experiments for a SuperPlot). */
  groups: LegendGroup[];
  /** What n counts ("values" unless said otherwise). */
  unit?: string;
  /** Box plots: whiskers to the extremes, or Tukey's 1.5 × IQR fences. */
  whiskers?: "minmax" | "tukey";
  superplot?: { center: SuperCenter; error: SuperError; values: number;
    /** The summary is drawn as bars (grouped bar graphs), not a line. */
    bars?: boolean };
  /** Asterisks are drawn on the graph in this style: state the scale. */
  stars?: PStyle | null;
}

const PHRASE: Record<LegendSummary, string> = {
  mean_sd: "Mean ± SD",
  mean_sem: "Mean ± SEM",
  mean_ci: "Mean with 95% CI",
  median_iqr: "Median with IQR",
  mean_range: "Mean with range",
  mean: "Mean",
  none: "Mean",
  as_entered: "Mean with error bars as entered",
};

const SUPER_PHRASE: Record<SuperError, string> = {
  sd: "± SD", sem: "± SEM", ci: "with 95% CI", none: "",
};

/** "n = 6 per group" or "n = 6 (Control), 5 (Treated)". */
export function nPhrase(groups: LegendGroup[], unit = ""): string {
  const g = groups.filter((x) => x.n > 0);
  if (!g.length) return "";
  const u = unit ? ` ${unit}` : "";
  if (g.every((x) => x.n === g[0].n)) {
    return `n = ${g[0].n}${u} per group`;
  }
  return `n${unit ? ` (${unit})` : ""} = ${g.map((x) => `${x.n} (${x.name})`).join(", ")}`;
}

/** The legend sentence of a described graph. */
export function composeLegend(spec: LegendSpec): string {
  const parts: string[] = [];
  const pts = spec.points ? ", with individual values" : "";
  switch (spec.display) {
    case "superplot": {
      const sp = spec.superplot ?? { center: "mean", error: "sd", values: 0 };
      const err = SUPER_PHRASE[sp.error];
      const mark = sp.bars ? "bars" : "line";
      parts.push(`Mean${err ? ` ${err}` : ""} of the experiment ${sp.center}s (${mark}${err ? " and error bars" : ""})`
        + `; small symbols are individual values coloured by experiment, large symbols the ${sp.center} of each experiment`);
      break;
    }
    case "bar":
      parts.push(`${PHRASE[spec.summary]} (bars)${pts}`);
      break;
    case "box":
      parts.push(`Median with IQR (box) and ${spec.whiskers === "minmax"
        ? "minimum to maximum" : "1.5 × IQR (Tukey)"} (whiskers)${pts}`);
      break;
    case "violin":
      parts.push(`Kernel density (violin) with the mean (line)${pts}`);
      break;
    case "lines":
      parts.push(`${PHRASE[spec.summary]}${pts}`);
      break;
    default:
      parts.push(`${PHRASE[spec.summary]}${pts}`);
  }
  const n = nPhrase(spec.groups, spec.display === "superplot" ? "experiments" : spec.unit ?? "");
  if (n) {
    parts.push(spec.display === "superplot" && spec.superplot?.values
      ? `${n} (${spec.superplot.values} values in all)` : n);
  }
  if (spec.stars) parts.push(starScale(spec.stars));
  return parts.join(". ") + ".";
}

// ------------------------------------------------------------ from a graph

const countValues = (rows: string[][]) =>
  rows.reduce((n, row) => n + row.filter((c) => parseCell(c) !== null).length, 0);

/** Asterisks drawn on this graph: the P style to state, else null. */
function starsOf(graph: Pick<GraphSheet, "settings">): PStyle | null {
  const f = readFormat(graph.settings);
  const c = f.comparisons;
  return c?.show && c.display !== "p" ? f.pStyle ?? "graphpad" : null;
}

/** Summary of entered mean / error data, as the legend states it. */
function enteredSummary(fmt: DataTableModel["subcolumnFormat"]): LegendSummary {
  if (fmt.startsWith("mean_sd")) return "mean_sd";
  if (fmt.startsWith("mean_sem")) return "mean_sem";
  if (fmt === "mean_ci_n") return "mean_ci";
  return "as_entered";
}

/** n of entered summary data: the N subcolumn of the first filled row. */
function enteredN(rows: string[][], fmt: DataTableModel["subcolumnFormat"]): number {
  const col = fmt === "mean_ci_n" ? 3 : fmt.endsWith("_n") ? 2 : -1;
  if (col < 0) return 0;
  const row = rows.find((r) => parseCell(r[0] ?? "") !== null);
  return row ? Math.max(0, Math.round(parseCell(row[col] ?? "") ?? 0)) : 0;
}

function columnSpec(graph: Pick<GraphSheet, "graphType" | "settings">, table: DataTableModel,
  result: unknown): LegendSpec | null {
  const s = normalizeColumnGraph(graph.settings.column);
  const kind = graph.graphType;
  const display = kind === "bar" ? "bar" : kind === "box" ? "box"
    : kind === "violin" ? "violin" : "scatter";
  const stars = starsOf(graph);
  if (table.subcolumnFormat !== "replicates") {
    return {
      display: display === "box" || display === "violin" ? "scatter" : display,
      summary: enteredSummary(table.subcolumnFormat), points: false, stars,
      groups: table.datasets.map((d) => ({ name: d.name, n: enteredN(d.rows, table.subcolumnFormat) })),
    };
  }
  if (superPlotOn(s.superplot, result)) {
    const { groups } = replicateSummary(table, s.superplot.center);
    const counts = replicateCounts(groups);
    return {
      display: "superplot", summary: "mean", points: true, stars,
      groups: groups.map((g, i) => ({ name: g.name, n: counts[i] })),
      superplot: { center: s.superplot.center, error: s.superplot.error,
        values: groups.reduce((n, g) => n + g.points.length, 0) },
    };
  }
  return {
    display, stars,
    summary: s.summary,
    points: display === "bar" ? s.points : true,
    whiskers: "tukey",
    groups: table.datasets.map((d) => ({ name: d.name, n: countValues(d.rows) })),
  };
}

const GROUPED_SUMMARY: Record<ErrorKind, LegendSummary> = {
  sd: "mean_sd", sem: "mean_sem", ci: "mean_ci", range: "mean_range", none: "mean",
};

function groupedSpec(graph: Pick<GraphSheet, "graphType" | "settings">, table: DataTableModel,
  result: unknown): LegendSpec | null {
  const kind = graph.graphType;
  if (kind === G_HEATMAP || kind === G_VOLCANO) return null;
  const s = normalizeGraph(graph.settings.grouped);
  const stars = starsOf(graph);
  const rowName = (r: number) => table.rowTitles[r]?.trim() || `Row ${r + 1}`;
  const dsName = (d: number) => table.datasets[d]?.name.trim() || `Data set ${d + 1}`;
  if (table.subcolumnFormat === "replicates" && superPlotOn(s.superplot, result)
    && [G_INTERLEAVED, G_SEPARATED, G_SCATTER].includes(kind)) {
    const info = replicateInfo(table);
    const groups: LegendGroup[] = [];
    let values = 0;
    const rows = table.rowTitles.length;
    for (let r = 0; r < rows; r++) {
      table.datasets.forEach((d, di) => {
        const row = d.rows[r] ?? [];
        const filled = row.map((c) => parseCell(c) !== null);
        values += filled.filter(Boolean).length;
        const reps = new Set<number>();
        filled.forEach((f, k) => { if (f && info.of(di, r, k) >= 0) reps.add(info.of(di, r, k)); });
        if (reps.size) groups.push({ name: `${rowName(r)} · ${dsName(di)}`, n: reps.size });
      });
    }
    return {
      display: "superplot", summary: "mean", points: true, stars, groups,
      superplot: { center: s.superplot.center, error: s.superplot.error, values,
        bars: kind !== G_SCATTER },
    };
  }
  const cells = cellStats(table);
  const groups: LegendGroup[] = [];
  cells.forEach((row, r) => row.forEach((c, d) => {
    if (c) groups.push({ name: `${rowName(r)} · ${dsName(d)}`, n: c.n });
  }));
  const display = kind === G_BOX ? "box" : kind === G_LINES ? "lines"
    : kind === G_SCATTER ? "scatter" : "bar";
  const summary: LegendSummary = table.subcolumnFormat !== "replicates"
    ? enteredSummary(table.subcolumnFormat) : GROUPED_SUMMARY[s.error];
  const points = table.subcolumnFormat === "replicates"
    && (kind === G_SCATTER || (s.points && kind !== G_STACKED && kind !== G_LINES));
  return { display, summary, points, groups, stars, whiskers: "minmax" };
}

/**
 * The legend sentence for a graph sheet: "Mean ± SD (bars), with
 * individual values. n = 6 per group. ns, P > 0.05; * P ≤ 0.05; …".
 * Column graphs (also of XY tables) and grouped graphs; other kinds
 * return "". `table` is the
 * table the graph plots (exclusions blanked); `result` the bound results,
 * if any (a statistics-on-replicate-means result turns SuperPlot mode on
 * unless the graph turned it off).
 */
export function legendSentence(graph: Pick<GraphSheet, "graphType" | "settings">,
  table: DataTableModel, result?: unknown): string {
  const columnKind = ["scatter", "bar", "box", "violin"].includes(graph.graphType);
  const spec = table.type === "column" || (table.type === "xy" && columnKind)
    ? columnSpec(graph, table, result)
    : table.type === "grouped" ? groupedSpec(graph, table, result) : null;
  return spec && spec.groups.length ? composeLegend(spec) : "";
}
