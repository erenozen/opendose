// Time course assay module: any measurement followed over time in the same
// subjects (a glucose tolerance test, body weight, a signal), in groups.
// Long records, a grouped table with time rows, or an XY table with
// subjects as subcolumns; three analyses with one controls panel (model.ts).
import type { EngineBridge } from "../../../lib/engine";
import type { DataTableModel, GraphSheet } from "../../../project/types";
import { lazyPart } from "../../lazy";
import { defineAnalysis, defineGraph, type GraphKindDef } from "../../types";
import type { AssayModule } from "../index";
import { emptyLayout } from "../kit/columns";
import { subjectSeries, tumourRecords, type TumourBase } from "../tumourModel";
import { timeTitle, valueTitle } from "../tumour";
import {
  A_TC_AUC, A_TC_MIXED, A_TC_WINDOW, G_TC_AUC, G_TC_MEANS, G_TC_WINDOW, mixedPayload, normalizeTcAuc,
  normalizeTcMixed, normalizeTcWindow, prepare, tcColumnTable, windowPayload, WINDOW_LABELS,
  type TcAucOptions, type TcMixedOptions, type TcWindowOptions,
} from "./model";
import { timecourseSample } from "./sample";

const panels = () => import("./panels");
const TcControls = lazyPart(panels, "TcControls");
const TcMixedResults = lazyPart(panels, "TcMixedResults");
const TcMixedMethods = lazyPart(panels, "TcMixedMethods");
const TcAucResults = lazyPart(panels, "TcAucResults");
const TcAucMethods = lazyPart(panels, "TcAucMethods");
const TcWindowResults = lazyPart(panels, "TcWindowResults");
const TcWindowMethods = lazyPart(panels, "TcWindowMethods");
const plots = () => import("./plot");
const TcMeansPlot = lazyPart(plots, "TcMeansPlot");
const TcMeansOptions = lazyPart(plots, "TcMeansOptions");
const dots = () => import("../tumourPlot");
const TumourAucPlot = lazyPart(dots, "TumourAucPlot");

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const info = (p: ReturnType<typeof prepare>) => ({
  source: p.source, timeFromOrder: p.timeFromOrder, nSubjects: p.nSubjects, groups: p.groups,
  dropped: p.dropped,
});

/** Labels the shared dot plot shows per subject. */
const labelsOf = (p: ReturnType<typeof prepare>) => Object.fromEntries([...p.names.values()].map((n) => [n, n]));

export function runTcMixed(engine: EngineBridge, table: DataTableModel, o: TcMixedOptions): R {
  const p = prepare(table, o);
  if (p.error) return { error: p.error };
  if (p.groups.length < 2) return { error: "The time-course model compares groups over time: it needs at least two groups" };
  const r = engine.analyze(mixedPayload(p, o)) as R;
  if (!r || r.error) return r;
  return { ...r, info: info(p) };
}

export function runTcAuc(engine: EngineBridge, table: DataTableModel, o: TcAucOptions): R {
  const p = prepare(table, o);
  if (p.error) return { error: p.error };
  const r = engine.analyze({
    analysis: "auc",
    data: {
      subject: p.records.map((x) => p.names.get(x.subject)), group: p.records.map((x) => x.group),
      time: p.records.map((x) => x.time), value: p.records.map((x) => x.value),
    },
    options: { baseline: o.baseline, per_time: o.perTime, equal_var: !o.welch },
  }) as R;
  if (!r || r.error) return r;
  return { ...r, labels: labelsOf(p), info: info(p) };
}

export function runTcWindow(engine: EngineBridge, table: DataTableModel, o: TcWindowOptions): R {
  const p = prepare(table, o);
  if (p.error) return { error: p.error };
  const payload = windowPayload(p, o);
  if ("error" in payload) return { error: payload.error };
  const r = engine.analyze(payload) as R;
  if (!r || r.error) return r;
  return { ...r, labels: labelsOf(p), info: info(p), summary: o.summary };
}

/** Group names of a family's graph, in plotting order. */
function groupsOf(table: DataTableModel, options: unknown): string[] {
  const o = options as TumourBase | null;
  if (!o?.columns) return [];
  return subjectSeries(tumourRecords(table, o.columns).records).groups;
}

const windowTitle = (o: TcWindowOptions | null) => (o ? WINDOW_LABELS[o.summary].replace(/ \(.*\)$/, "") : "Summary");

export const tcMixed = defineAnalysis<TcMixedOptions, R>({
  id: A_TC_MIXED,
  label: "Time course: mixed model (group × time, covariance choice)",
  short: "Time course model",
  description: "The same subjects measured over time, in groups: a mixed model with "
    + "compound symmetry, AR(1), unstructured or random-slope covariance (compared by AIC), "
    + "group means and group differences at each time.",
  sheetName: (t) => `Time course model of ${t}`,
  defaultOptions: ({ table }) => normalizeTcMixed({}, table),
  normalizeOptions: (raw, { table }) => normalizeTcMixed(raw, table),
  run: runTcMixed,
  defaultGraph: G_TC_MEANS,
  ControlsPanel: TcControls,
  ResultsPanel: TcMixedResults,
  MethodsPanel: TcMixedMethods,
});

export const tcAuc = defineAnalysis<TcAucOptions, R>({
  id: A_TC_AUC,
  label: "Time course: area under each subject's curve",
  short: "Subject AUC",
  description: "Trapezoid area under each subject's curve, compared between groups "
    + "(t test or one-way ANOVA), with a linked column table.",
  sheetName: (t) => `AUC per subject of ${t}`,
  defaultOptions: ({ table }) => normalizeTcAuc({}, table),
  normalizeOptions: (raw, { table }) => normalizeTcAuc(raw, table),
  run: runTcAuc,
  defaultGraph: G_TC_AUC,
  ControlsPanel: TcControls,
  ResultsPanel: TcAucResults,
  MethodsPanel: TcAucMethods,
  derivedOnDemand: true,
  derivedTable: (result) => (result.error || !result.table ? null
    : tcColumnTable(result, result.per_time ? "Mean level (AUC / time)" : "AUC")),
  derivedName: (t) => `AUC per subject of ${t}`,
});

export const tcWindow = defineAnalysis<TcWindowOptions, R>({
  id: A_TC_WINDOW,
  label: "Time course: summary of each subject over a time window",
  short: "Window summary",
  description: "Each subject's mean, peak, area or time-weighted mean over a chosen window "
    + "of time, compared between groups, with a linked column table.",
  sheetName: (t) => `Window summary of ${t}`,
  defaultOptions: ({ table }) => normalizeTcWindow({}, table),
  normalizeOptions: (raw, { table }) => normalizeTcWindow(raw, table),
  run: runTcWindow,
  defaultGraph: G_TC_WINDOW,
  ControlsPanel: TcControls,
  ResultsPanel: TcWindowResults,
  MethodsPanel: TcWindowMethods,
  derivedOnDemand: true,
  derivedTable: (result, _source, o) => (result.error || !result.table ? null
    : tcColumnTable(result, windowTitle(o))),
  derivedName: (t) => `Window summary of ${t}`,
});

const meansGraph = defineGraph<TcMixedOptions, R>({
  id: G_TC_MEANS, label: "Group means over time with model CIs (or each subject)", group: "timecourse",
  analysis: A_TC_MIXED,
  autoTitles: (t, o) => ({ x: o ? timeTitle(t, o) : "Time", y: o ? valueTitle(t, o) : "Value" }),
  exportName: "time-course",
  PlotPanel: TcMeansPlot,
  OptionsPanel: TcMeansOptions,
  formatFeatures: { points: true, lines: true, errorBars: true },
  formatDatasets: (t: DataTableModel, _g: GraphSheet, o: TcMixedOptions | null) => groupsOf(t, o),
  sheetName: (t) => `Time course of ${t}`,
});

const dotGraph = (id: string, analysis: string, label: string, y: (o: any) => string, stem: string): GraphKindDef =>
  defineGraph<any, R>({
    id, label, group: "timecourse_dots", analysis,
    autoTitles: (_t, o) => ({ x: "", y: y(o) }),
    showXTitle: false,
    exportName: stem.toLowerCase().replace(/\s+/g, "-"),
    PlotPanel: TumourAucPlot,
    formatFeatures: { categorical: true, points: true, errorBars: true },
    formatDatasets: (t, _g, o) => groupsOf(t, o),
    sheetName: (t) => `${stem} of ${t}`,
  });

const graphs: GraphKindDef[] = [
  meansGraph,
  dotGraph(G_TC_AUC, A_TC_AUC, "AUC of each subject by group",
    (o) => (o?.perTime ? "Mean level (AUC / time)" : "Area under the curve"), "AUC graph"),
  dotGraph(G_TC_WINDOW, A_TC_WINDOW, "Window summary of each subject by group",
    (o) => windowTitle(o), "Window graph"),
];

const TYPES = ["xy", "grouped", "multivariable"] as const;

export const timecourseAssay: AssayModule = {
  id: "timecourse",
  label: "Time course (the same subjects measured over time)",
  description: "Subjects followed over time in groups (a glucose tolerance test, weights, a "
    + "signal): a mixed model of group × time with a choice of covariance, the area under "
    + "each subject's curve and a summary over a time window, compared between groups.",
  tableType: "xy",
  tableName: "Glucose tolerance test",
  emptyTable: () => emptyLayout(timecourseSample()),
  sampleTable: timecourseSample,
  mainAnalysis: A_TC_MIXED,
  analyses: [tcMixed, tcAuc, tcWindow].map((def) => ({ def, types: [...TYPES] })),
  graphs: graphs.map((def) => ({ def, types: [...TYPES] })),
  templates: [{
    id: "timecourse-gtt",
    name: "Glucose tolerance test (time course)",
    description: "Blood glucose at 0 to 120 min in six mice per diet, one subcolumn per mouse: "
      + "a mixed model of diet × time, the area under each mouse's curve and a summary over "
      + "a time window, from the same table.",
    tableName: "Glucose tolerance test",
    table: timecourseSample,
    analysis: A_TC_MIXED,
  }],
};
