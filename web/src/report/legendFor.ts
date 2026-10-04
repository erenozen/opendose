// The legend of a graph sheet: reads what the graph draws (its kind, error
// bars, points, brackets) from the sheet's settings and format, and the
// test from the bound result. Pure.
import { readFormat } from "../graph/format.ts";
import { numericData } from "../project/table.ts";
import type { DataSheet, DataTableModel, GraphSheet } from "../project/types.ts";
import type { GroupN } from "./describe.ts";
import { legendParagraph, whatIsPlotted, type ErrorBars } from "./legend.ts";
import type { ReportPrefs } from "./prefs.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const COLUMN_KINDS = new Set(["scatter", "bar", "box", "violin"]);

/** n per data set counted from the table (values entered, exclusions out). */
export function tableGroups(t: DataTableModel): GroupN[] {
  if (t.type === "contingency" || t.type === "multivariable") return [];
  if (t.type === "survival") {
    return numericData(t).datasets.map((d) => ({ name: d.name, n: d.ys.filter((r) => r[0] !== null).length }));
  }
  return numericData(t).datasets.map((d) => ({
    name: d.name, n: d.ys.flat().filter((v) => v !== null).length,
  })).filter((g) => g.n > 0);
}

export interface GraphFigureFacts {
  errorBars: ErrorBars | null;
  points: boolean | null;
  starsShown: boolean;
  pShown: boolean;
}

/** What a graph sheet draws, as far as a legend needs to know. */
export function graphFacts(g: GraphSheet | null | undefined, options: unknown): GraphFigureFacts {
  if (!g) return { errorBars: null, points: null, starsShown: false, pShown: false };
  const fmt = readFormat(g.settings);
  const cmp = fmt.comparisons;
  const starsShown = !!cmp?.show && cmp.display !== "p";
  const pShown = !!cmp?.show && cmp.display === "p";
  const kind = g.graphType;
  if (COLUMN_KINDS.has(kind)) {
    return { errorBars: kind === "scatter" || kind === "bar" ? "sd" : null, points: true, starsShown, pShown };
  }
  if (kind.startsWith("grouped_")) {
    const s = (g.settings.grouped ?? {}) as any;
    const err = ["sd", "sem", "ci", "range", "none"].includes(s.error) ? s.error as ErrorBars : "sd";
    return { errorBars: err, points: s.points !== false, starsShown, pShown };
  }
  if (kind === "xy") {
    const o = (options ?? {}) as any;
    const err = ["sd", "sem", "ci95", "range", "none"].includes(o.errorBars) ? o.errorBars as ErrorBars : "sd";
    return { errorBars: err, points: false, starsShown, pShown };
  }
  if (kind === "estimation" || kind === "nested_scatter") {
    return { errorBars: kind === "estimation" ? "sd" : null, points: true, starsShown, pShown };
  }
  return { errorBars: null, points: null, starsShown, pShown };
}

export interface LegendContext {
  data: DataSheet;
  table: DataTableModel;
  graph: GraphSheet | null | undefined;
  result: unknown;
  options: unknown;
  prefs: ReportPrefs;
  software: string;
}

/** The figure legend of a graph (or of the results alone, without one). */
export function legendFor(c: LegendContext): string {
  const f = graphFacts(c.graph, c.options);
  // XY tables: n is the replicates at each X, not every value of a curve.
  const xy = c.table.type === "xy";
  const groups = xy ? numericData(c.table).datasets.map((d) => ({
    name: d.name, n: Math.max(0, ...d.ys.map((r) => r.filter((v) => v !== null).length)),
  })).filter((g) => g.n > 0) : tableGroups(c.table);
  const unit = c.data.report?.unit ?? (xy ? "replicates per X value" : undefined);
  return legendParagraph({
    graphType: c.graph?.graphType ?? null,
    result: c.result,
    groups,
    unit: { unit, experiments: c.data.report?.experiments ?? null },
    errorBars: f.errorBars, points: f.points ?? undefined,
    starsShown: f.starsShown, pShown: f.pShown,
    style: c.prefs.pStyle, hideNs: c.prefs.hideNs, software: c.software,
  });
}

/** Can the legend say what this graph draws? */
export function graphDescribed(g: GraphSheet): boolean {
  return whatIsPlotted(g.graphType, {}) !== null;
}

/** The graph a results sheet's legend describes: the family's graph bound
 *  to that results sheet (null if none). */
export function legendGraph(sheets: readonly { kind: string }[], resultsId: string,
  dataId: string): GraphSheet | null {
  const graphs = sheets.filter((s): s is GraphSheet => s.kind === "graph"
    && (s as GraphSheet).parentId === dataId);
  return graphs.find((g) => g.resultsId === resultsId) ?? null;
}
