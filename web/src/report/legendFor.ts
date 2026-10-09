// The legend of a graph sheet: reads what the graph draws (its kind, error
// bars, points, brackets) from the sheet's settings and format, and the
// test from the bound result. Pure.
import { readFormat } from "../graph/format.ts";
import { legendSpec, plottedClause } from "../graph/legend.ts";
import { replicateInfo } from "../sheets/common/superplot.ts";
import { cellStats } from "../sheets/grouped/stats.ts";
import { numericData } from "../project/table.ts";
import { exclusionSentence } from "../project/exclusions.ts";
import type { DataSheet, DataTableModel, GraphSheet } from "../project/types.ts";
import type { GroupN } from "./describe.ts";
import { legendParagraph, whatIsPlotted, type ErrorBars } from "./legend.ts";
import type { ReportPrefs } from "./prefs.ts";
import {
  metaWithReplicates, replicateFacts, withinNote, withinPerGroup,
} from "./replicates.ts";
import { compareParameterLegend } from "../sheets/xy/compareParameter.ts";
import { logLegendClause } from "../sheets/column/logScale.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const COLUMN_KINDS = new Set(["scatter", "bar", "box", "violin"]);

/** n per data set counted from the table (values entered, exclusions out). */
export function tableGroups(t: DataTableModel): GroupN[] {
  if (t.type === "contingency" || t.type === "multivariable") return [];
  if (t.type === "survival") {
    return numericData(t).datasets.map((d) => ({ name: d.name, n: d.ys.filter((r) => r[0] !== null).length }));
  }
  // Grouped tables: n is per row × data set cell (as the graph's legend
  // sentence counts it), not per data set across rows.
  if (t.type === "grouped") {
    const out: GroupN[] = [];
    cellStats(t).forEach((row, r) => row.forEach((c, d) => {
      if (c && c.n > 0) {
        out.push({ name: `${t.rowTitles[r]?.trim() || `Row ${r + 1}`} · ${t.datasets[d]?.name.trim()
          || `Data set ${d + 1}`}`, n: c.n });
      }
    }));
    return out;
  }
  // A long-format replicate map keeps experiment labels in a data set of
  // their own: it is not a group.
  const idColumn = t.type === "column" && t.replicates?.by === "column"
    ? replicateInfo(t).idColumn : null;
  return numericData(t).datasets.map((d, i) => ({
    name: d.name, n: i === idColumn ? 0 : d.ys.flat().filter((v) => v !== null).length,
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
  // Unit and experiments: typed in Reporting details, else from the
  // table's replicate map (report/replicates.ts).
  const superplot = !!c.graph && legendSpec(c.graph, c.table, c.result)?.display === "superplot";
  const meta = metaWithReplicates(c.data.report, c.table, c.result, { superplot });
  const facts = replicateFacts(c.table, c.result, { superplot });
  // XY with repeats inside experiments: the points are experiment means.
  const xyByExp = xy && !!facts && !c.data.report?.unit;
  const xyGroups = xyByExp ? groups.map((g) => ({ ...g, n: facts!.experiments })) : groups;
  const unit = meta.unit ?? (xy ? "replicates per X value" : undefined);
  // Statistics on experiment means with one value per experiment (a flow
  // summary's donors) and the experiment named in Reporting details: n
  // already counts the experiments, so "(3 donors)" and "from 3
  // independent experiments" would only repeat it.
  const onePer = !xy && !!facts?.onMeans && !!c.data.report?.unit
    && facts.values.every((g) => g.n <= facts.experiments);
  // The graph's own P style / "hide ns" override the project's.
  const fmt = c.graph ? readFormat(c.graph.settings) : null;
  return legendParagraph({
    graphType: c.graph?.graphType ?? null,
    plotted: withCompareClause(c.graph ? plottedClause(c.graph, c.table, c.result) : undefined, c.result),
    result: c.result,
    groups: xyGroups,
    unit: { unit, experiments: onePer ? null : meta.experiments ?? null,
      within: onePer ? undefined : withinPerGroup(facts, xy) || undefined, ...(xyByExp ? { per: "X value" } : {}) },
    nNote: withinNote(facts, xy) || undefined,
    exclusions: exclusionSentence(c.table) ?? undefined,
    errorBars: f.errorBars, points: f.points ?? undefined,
    starsShown: f.starsShown, pShown: f.pShown,
    style: fmt?.pStyle ?? c.prefs.pStyle,
    hideNs: fmt?.comparisons?.hideNs ?? c.prefs.hideNs, software: c.software,
  });
}

/** A "Compare a parameter" result adds what was compared and how to the
 *  legend (sheets/xy/compareParameter.ts). */
function withCompareClause(plotted: string | undefined, result: unknown): string | undefined {
  const r = result as { analysis?: string; mode?: string; compare?: unknown } | null;
  // a t test / ANOVA on the log scale says so (sheets/column/logScale.ts)
  const logs = logLegendClause(result);
  if (logs) return [plotted, logs].filter(Boolean).join(" ") || undefined;
  if (r?.analysis !== "compare_fits" || r.mode !== "parameter" || !r.compare) return plotted;
  const clause = compareParameterLegend(r.compare as Record<string, unknown>);
  return [plotted, clause].filter(Boolean).join(" ") || undefined;
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
