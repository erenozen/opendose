// Tumour growth (and any longitudinal measurement per subject): long
// records in (a multiple-variables table, or a grouped / XY table with
// subjects as subcolumns), three analyses out, each with its guidance:
// - a mixed-effects model of (log) volume over time and group, with the
//   per-time comparisons as one family (mixed_rm_twoway);
// - the area under each subject's curve, compared between groups, as a
//   linked column table (auc in long-format mode);
// - the time each subject takes to reach an endpoint volume, as a linked
//   survival table with Kaplan-Meier curves and the log-rank test.
import type { EngineBridge } from "../../lib/engine";
import { numericData, parseCell } from "../../project/table";
import type { DataTableModel, GraphSheet } from "../../project/types";
import { runTwoWay } from "../grouped/run";
import type { TwoWayOptions } from "../grouped/options";
import { lazyPart } from "../lazy";
import { defineAnalysis, defineGraph, type GraphKindDef } from "../types";
import type { AssayModule } from "./types";
import {
  A_TUMOUR_AUC, A_TUMOUR_ENDPOINT, A_TUMOUR_MIXED, G_TUMOUR_AUC, G_TUMOUR_AUC_CURVES,
  G_TUMOUR_CURVES, G_TUMOUR_ENDPOINT, columnFromValues, dropEmptyCells, endpointRows, groupedFromRecords, normalizeEndpoint,
  normalizeMixed, normalizeTumourAuc, subjectSeries, survivalFromEndpoints, transformed,
  tumourRecords, type EndpointRow, type TumourAucOptions, type TumourBase,
  type TumourEndpointOptions, type TumourMixedOptions,
} from "./tumourModel";
import { tumourSample } from "./tumourSample";

const panels = () => import("./tumourPanels");
const TumourControls = lazyPart(panels, "TumourControls");
const MixedResults = lazyPart(panels, "MixedResults");
const MixedMethods = lazyPart(panels, "MixedMethods");
const TumourAucResults = lazyPart(panels, "TumourAucResults");
const TumourAucMethods = lazyPart(panels, "TumourAucMethods");
const EndpointResults = lazyPart(panels, "EndpointResults");
const EndpointMethods = lazyPart(panels, "EndpointMethods");
const plots = () => import("./tumourPlot");
const TumourCurvesPlot = lazyPart(plots, "TumourCurvesPlot");
const TumourCurvesOptions = lazyPart(plots, "TumourCurvesOptions");
const TumourAucPlot = lazyPart(plots, "TumourAucPlot");

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface Prepared {
  error?: string;
  source?: string;
  timeFromOrder?: boolean;
  nSubjects?: number;
  groups?: string[];
  dropped?: number;
  duplicates?: number;
}

function summary(table: DataTableModel, o: TumourBase, transform: boolean) {
  const rec = tumourRecords(table, o.columns);
  if (rec.error) return { rec, error: rec.error };
  const t = transform ? transformed(rec.records, o) : { records: rec.records, dropped: 0 };
  const s = subjectSeries(t.records);
  const info: Prepared = {
    source: rec.source, timeFromOrder: rec.timeFromOrder, nSubjects: s.subjects.length,
    groups: s.groups, dropped: t.dropped, duplicates: s.duplicates,
  };
  if (!t.records.length) return { rec, error: "No complete records (subject, time and value)" };
  return { rec, records: t.records, info };
}

/** Title of the time axis / rows. */
export function timeTitle(table: DataTableModel, o: TumourBase): string {
  if (table.type === "multivariable") return o.columns.time || "Time";
  if (table.type === "xy") return table.xTitle && table.xTitle !== "X" ? table.xTitle : "Time";
  return "Time";
}

export function valueTitle(table: DataTableModel, o: TumourBase): string {
  if (table.type === "multivariable") return o.columns.value || "Value";
  return table.yTitle.trim() || "Value";
}

export function runTumourMixed(engine: EngineBridge, table: DataTableModel, o: TumourMixedOptions): R {
  const s = summary(table, o, true);
  if (s.error || !s.records) return { error: s.error };
  const time = timeTitle(table, o);
  const full = groupedFromRecords(s.records, table.type === "grouped" ? "Time" : time);
  const { table: grouped, dropped: droppedTimes } = dropEmptyCells(full);
  if (grouped.datasets.length < 2) {
    return { error: "The mixed model compares groups over time: it needs at least two groups" };
  }
  const tw: TwoWayOptions = {
    design: "rm_rows", rmFit: "mixed", rowFactor: time, colFactor: "Group",
    comparisons: o.comparisons, direction: o.direction,
  };
  if (grouped.rowTitles.length < 2) {
    return { error: "The mixed model needs at least two time points at which every group has values" };
  }
  const r = runTwoWay(engine, grouped, tw);
  return { ...r, grouped, twoWay: tw, info: { ...s.info, droppedTimes } };
}

export function runTumourAuc(engine: EngineBridge, table: DataTableModel, o: TumourAucOptions): R {
  const s = summary(table, o, true);
  if (s.error || !s.records) return { error: s.error };
  const recs = s.records;
  const r = engine.analyze({
    analysis: "auc",
    data: {
      subject: recs.map((x) => x.subject), group: recs.map((x) => x.group),
      time: recs.map((x) => x.time), value: recs.map((x) => x.value),
    },
    options: { baseline: o.baseline, per_time: o.perTime, equal_var: !o.welch },
  }) as R;
  if (r.error) return r;
  const labels: Record<string, string> = {};
  for (const x of recs) labels[x.subject] = x.label;
  return { ...r, labels, info: s.info };
}

export function runTumourEndpoint(engine: EngineBridge, table: DataTableModel,
  o: TumourEndpointOptions): R {
  const threshold = parseCell(o.threshold);
  if (threshold === null) return { error: "Enter the endpoint value (for example 1000 mm³)" };
  const s = summary(table, o, false);
  if (s.error || !s.records) return { error: s.error };
  const rows: EndpointRow[] = endpointRows(s.records, threshold, o.interpolate);
  const groups = s.info!.groups!;
  const survival = survivalFromEndpoints(rows, groups);
  const km = engine.analyze({ analysis: "survival", data: numericData(survival), options: {} }) as R;
  return { rows, groups, threshold, survival, km, info: s.info };
}

/** Group names of a family's graph, in plotting order. */
function groupsOf(table: DataTableModel, options: unknown): string[] {
  const o = options as TumourBase | null;
  if (!o?.columns) return [];
  return subjectSeries(tumourRecords(table, o.columns).records).groups;
}

export const tumourMixed = defineAnalysis<TumourMixedOptions, R>({
  id: A_TUMOUR_MIXED,
  label: "Tumour growth: mixed model of log volume over time",
  short: "Growth model",
  description: "Long records or subjects as subcolumns; a mixed-effects model of "
    + "ln(volume) with time and group as fixed effects (missing values allowed), "
    + "Geisser-Greenhouse ε, and group comparisons at each time as one family.",
  sheetName: (t) => `Tumour growth model of ${t}`,
  defaultOptions: ({ table }) => normalizeMixed({}, table),
  normalizeOptions: (raw, { table }) => normalizeMixed(raw, table),
  run: runTumourMixed,
  defaultGraph: G_TUMOUR_CURVES,
  ControlsPanel: TumourControls,
  ResultsPanel: MixedResults,
  MethodsPanel: MixedMethods,
});

export const tumourAuc = defineAnalysis<TumourAucOptions, R>({
  id: A_TUMOUR_AUC,
  label: "Tumour growth: area under each subject's curve",
  short: "AUC per subject",
  description: "Trapezoid area under each subject's curve, summarised per group "
    + "and compared (t test or one-way ANOVA), with a linked column table.",
  sheetName: (t) => `AUC per subject of ${t}`,
  defaultOptions: ({ table }) => normalizeTumourAuc({}, table),
  normalizeOptions: (raw, { table }) => normalizeTumourAuc(raw, table),
  run: runTumourAuc,
  defaultGraph: G_TUMOUR_AUC,
  ControlsPanel: TumourControls,
  ResultsPanel: TumourAucResults,
  MethodsPanel: TumourAucMethods,
  derivedOnDemand: true,
  derivedTable: (result) => {
    if (result.error || !result.table) return null;
    return columnTable(result);
  },
  derivedName: (t) => `AUC per subject of ${t}`,
});

/** The per-subject AUCs as a column table, one data set per group. */
export function columnTable(result: R): DataTableModel {
  return columnFromValues(result.table.datasets, result.per_time ? "Mean level (AUC / time)" : "AUC");
}

export const tumourEndpoint = defineAnalysis<TumourEndpointOptions, R>({
  id: A_TUMOUR_ENDPOINT,
  label: "Tumour growth: time to endpoint (Kaplan-Meier)",
  short: "Time to endpoint",
  description: "The time each subject takes to reach an endpoint volume (censored "
    + "if it never does), as a linked survival table with Kaplan-Meier curves "
    + "and the log-rank test.",
  sheetName: (t) => `Time to endpoint of ${t}`,
  defaultOptions: ({ table }) => normalizeEndpoint({}, table),
  normalizeOptions: (raw, { table }) => normalizeEndpoint(raw, table),
  run: runTumourEndpoint,
  defaultGraph: G_TUMOUR_ENDPOINT,
  ControlsPanel: TumourControls,
  ResultsPanel: EndpointResults,
  MethodsPanel: EndpointMethods,
  derivedOnDemand: true,
  derivedTable: (result) => (result.error || !result.survival ? null : result.survival),
  derivedName: (t) => `Time to endpoint of ${t}`,
});

const curves = (id: string, analysis: string, label: string, stem: string): GraphKindDef => defineGraph<TumourBase, R>({
  id, label, group: "tumour", analysis,
  autoTitles: (t, o) => ({
    x: o ? timeTitle(t, o) : "Time",
    y: o ? valueTitle(t, o) : "Value",
  }),
  exportName: "tumour-growth",
  PlotPanel: TumourCurvesPlot,
  OptionsPanel: TumourCurvesOptions,
  formatFeatures: { points: true, lines: true, errorBars: true },
  formatDatasets: (t: DataTableModel, _g: GraphSheet, o: TumourBase | null) => groupsOf(t, o),
  sheetName: (t) => `${stem} of ${t}`,
});

const tumourGraphs: GraphKindDef[] = [
  curves(G_TUMOUR_CURVES, A_TUMOUR_MIXED, "Mean ± SEM per group over time (or each subject)", "Growth curves"),
  curves(G_TUMOUR_AUC_CURVES, A_TUMOUR_AUC, "Growth curves (mean ± SEM or each subject)", "Growth curves (AUC)"),
  defineGraph<TumourAucOptions, R>({
    id: G_TUMOUR_AUC, label: "AUC of each subject by group", group: "tumour",
    analysis: A_TUMOUR_AUC,
    autoTitles: (_t, o) => ({ x: "", y: o?.perTime ? "Mean level (AUC / time)" : "Area under the curve" }),
    showXTitle: false,
    exportName: "auc-per-subject",
    PlotPanel: TumourAucPlot,
    formatFeatures: { categorical: true, points: true, errorBars: true },
    formatDatasets: (t, _g, o) => groupsOf(t, o),
    sheetName: (t) => `AUC graph of ${t}`,
  }),
  curves(G_TUMOUR_ENDPOINT, A_TUMOUR_ENDPOINT, "Growth curves with the endpoint", "Endpoint curves"),
];

const analyses = [tumourMixed, tumourAuc, tumourEndpoint];

export const tumourAssay: AssayModule = {
  id: "tumour",
  label: "Tumour growth and longitudinal studies",
  analyses: { multivariable: analyses, grouped: analyses, xy: analyses },
  graphs: { multivariable: tumourGraphs, grouped: tumourGraphs, xy: tumourGraphs },
  templates: [{
    id: "tumour-growth",
    name: "Tumour growth study (long format)",
    description: "One row per measurement: mouse, group, day and tumour volume, as exported "
      + "from a study log. A mixed-effects model of log volume compares the arms over time; "
      + "add the area under each mouse's curve or the time to an endpoint volume from the "
      + "results.",
    tableName: "Tumour growth study",
    table: tumourSample,
    analysis: A_TUMOUR_MIXED,
  }],
};
