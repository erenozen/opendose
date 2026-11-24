// The source data of a layout page (P-65), read from its drawn graphs: each
// placed graph's traces as Plotly holds them (gd.data, exactly what the
// panel plots) with its legend, test, data set names and n. The workbook
// itself is export/sourceData.ts (pure).
import type { ResultsCache } from "../app/analysis";
import type { Trace } from "../graph/apply";
import { legendSpec, type LegendSummary } from "../graph/legend";
import { waitForPlot } from "../export/figure";
import type { PanelInput, SourceDataInput } from "../export/sourceData";
import { panelLetters, readingOrder, type ResolvedLayout } from "../project/layout";
import { findSheet } from "../project/ops";
import { withExclusionsBlanked } from "../project/table";
import type { DataSheet, DataTableModel, GraphSheet, Project, ResultsSheet } from "../project/types";
import { describeResult } from "../report/describe";
import { graphFacts, legendFor, tableGroups } from "../report/legendFor";
import { reportPrefsOf } from "../report/prefs";
import { valuesPhrase } from "../report/valuesAre";
import { familyEquivalence } from "../report/estimation/margins";
import { softwareLabel } from "../report/useReport";
import { analysisDef, graphDef } from "../sheets/registry";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUMMARY: Partial<Record<LegendSummary, { centre: string; error: string }>> = {
  mean_sd: { centre: "Mean", error: "SD" },
  mean_sem: { centre: "Mean", error: "SEM" },
  mean_ci: { centre: "Mean", error: "95% CI" },
  median_iqr: { centre: "Median", error: "quartile" },
  geo_sd: { centre: "Geometric mean", error: "geometric SD" },
  geo_ci: { centre: "Geometric mean", error: "95% CI" },
  mean_range: { centre: "Mean", error: "range" },
  as_entered: { centre: "Mean", error: "error as entered" },
};

const XY_ERRORS: Record<string, { centre: string; error: string }> = {
  sd: { centre: "Mean", error: "SD" },
  sem: { centre: "Mean", error: "SEM" },
  ci95: { centre: "Mean", error: "95% CI" },
  ci: { centre: "Mean", error: "95% CI" },
  range: { centre: "Mean", error: "range" },
};

/** Panel letters as sheet names: the layout's letter style, plain ("a",
 *  not "(a)"), whether or not the page shows them. */
export function panelSheetLetters(layout: ResolvedLayout): Map<string, string> {
  return panelLetters(layout.items, { ...layout.letters, show: true, format: "plain" });
}

function boundResult(project: Project, graph: GraphSheet, cache: ResultsCache):
  { sheet: ResultsSheet | null; result: unknown; options: unknown } {
  if (graph.frozen && graph.snapshot) {
    return { sheet: null, result: graph.snapshot.result, options: graph.snapshot.options };
  }
  const s = graph.resultsId ? findSheet(project, graph.resultsId) : undefined;
  if (s?.kind !== "results") return { sheet: null, result: null, options: null };
  return { sheet: s, result: s.frozen ? s.cached ?? null : cache.get(s.id)?.result ?? s.cached ?? null,
    options: s.options };
}

/** The panel's description from the project (everything but the traces). */
export function panelInfo(project: Project, graph: GraphSheet, cache: ResultsCache):
  Omit<PanelInput, "letter" | "traces" | "xTicks" | "xTitle" | "yTitle"> | null {
  const data = findSheet(project, graph.parentId) as DataSheet | undefined;
  if (data?.kind !== "data") return null;
  const table: DataTableModel = graph.frozen && graph.snapshot ? graph.snapshot.table
    : withExclusionsBlanked(data.table);
  const { sheet: res, result, options } = boundResult(project, graph, cache);
  const kind = graphDef(data.table.type, graph.graphType);
  const datasets = kind?.formatDatasets ? kind.formatDatasets(table, graph, options as any)
    : table.datasets.map((d, i) => d.name || `Data set ${i + 1}`);
  const features = kind?.formatFeatures;
  const spec = legendSpec(graph, table, result, options);
  const errors = spec ? SUMMARY[spec.summary] ?? null
    : graph.graphType === "xy" ? XY_ERRORS[graphFacts(graph, options).errorBars ?? ""] ?? null : null;
  const legend = legendFor({
    data, table, graph, result, options,
    prefs: reportPrefsOf(project.prefs), software: softwareLabel(),
    valuesAre: valuesPhrase(project, data),
    equivalence: familyEquivalence(project.sheets, graph, (s) => cache.get(s.id)?.result),
  });
  // the test as the results describe it ("unpaired t test"), else the analysis
  const info = result ? describeResult(result) : null;
  const named = info?.test ? [info.test, info.sided, info.posthoc && `then ${info.posthoc}`]
    .filter(Boolean).join(", ") : null;
  const label = res ? (named ? named.replace(/^./, (c) => c.toUpperCase())
    : analysisDef(data.table.type, res.analysis)?.label ?? res.analysis) : null;
  return {
    graph: graph.name, data: data.name, legend,
    test: res ? `${label} (results sheet “${res.name}”)` : null,
    datasets, rowTitles: table.rowTitles,
    categorical: !!(features?.categorical || features?.categoryX),
    errors,
    groupN: Object.fromEntries(tableGroups(table).map((g) => [g.name, g.n])),
  };
}

/** An axis title as drawn ("log[Conc.], M"), or "". */
function axisTitle(ax: any): string {
  const t = ax?.title;
  return String(typeof t === "string" ? t : t?.text ?? "").replace(/<[^>]+>/g, "").trim();
}

function ticksOf(gd: any): PanelInput["xTicks"] {
  const ax = gd?.layout?.xaxis ?? {};
  const vals = Array.isArray(ax.tickvals) ? ax.tickvals : null;
  const text = Array.isArray(ax.ticktext) ? ax.ticktext : null;
  return vals && text ? { vals: vals.map(Number), text: text.map(String) } : undefined;
}

/**
 * Every panel of the page with what its graph draws. `pageEl` holds the
 * drawn page (the layout sheet's canvas or the bundle's off-screen copy):
 * each graph item's `.layout-graph .plot`. A picture (an unlinked SVG
 * copy) or a graph that does not draw in time has no data: it is listed
 * in `without`, never left out silently.
 */
export async function readSourceData(pageEl: HTMLElement, layout: ResolvedLayout, project: Project,
  cache: ResultsCache, meta: { name: string; app: string }): Promise<SourceDataInput> {
  const letters = panelSheetLetters(layout);
  const panels: PanelInput[] = [];
  const without: SourceDataInput["without"] = [];
  for (const it of readingOrder(layout.items)) {
    const letter = letters.get(it.id);
    if (!letter) continue;
    if (it.kind === "picture") {
      without.push({ letter, why: `a picture of “${it.name}”, unlinked from its data` });
      continue;
    }
    if (it.kind !== "graph" || !it.graphId) continue;
    const graph = findSheet(project, it.graphId) as GraphSheet | undefined;
    const host = pageEl.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(it.id)}"] .layout-graph`);
    const gd = host ? await waitForPlot(host, 30000) as any : null;
    const info = graph?.kind === "graph" ? panelInfo(project, graph, cache) : null;
    if (!gd || !info) {
      without.push({ letter, why: `“${graph?.name ?? "its graph"}” was not drawn in time` });
      continue;
    }
    panels.push({ ...info, letter, traces: (gd.data ?? []) as Trace[], xTicks: ticksOf(gd),
      xTitle: axisTitle(gd.layout?.xaxis), yTitle: axisTitle(gd.layout?.yaxis) });
  }
  return { layout: meta.name, app: meta.app, date: new Date().toISOString(), panels, without };
}
