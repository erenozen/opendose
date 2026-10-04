// Project edits the guidance performs: open a recommended analysis on the
// current table (pre-configured), create a table of the right type, the
// guided example project, and projects started from the start screen.
// Pure apart from ids (injected).
import { addFamily, analysisSheets, sampleProject } from "../app/factory";
import type { IdFactory } from "../project/ids";
import { derivedFrom } from "../project/derived";
import {
  addSheets, familyChildren, findSheet, makeProject, updateResultsOptions,
} from "../project/ops";
import type {
  DataSheet, DataTableModel, Project, ProjectPrefs, ResultsSheet, TableType,
} from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";
import type { Target } from "./recommend";

/** Can `target` run on this data sheet as it is? */
export function fitsTable(data: DataSheet | null | undefined, target: Target): boolean {
  if (!data || data.kind !== "data") return false;
  const t = data.table.type;
  if (!analysisDef(t, target.analysisId)) return false;
  return t === target.tableType || target.analysisId === "column";
}

function lastOfFamily(p: Project, dataId: string): string {
  const ids = new Set([...familyChildren(p, dataId), ...derivedFrom(p, dataId)].map((s) => s.id));
  const last = p.sheets.findLast((s) => ids.has(s.id));
  return last ? last.id : dataId;
}

/** Add the target's analysis to data sheet `dataId` with its options
 *  patched over the defaults. Returns the results sheet id. */
export function addConfiguredAnalysis(p: Project, dataId: string, target: Target,
  ids: IdFactory): { project: Project; resultsId: string | null } {
  const sheets = analysisSheets(p, dataId, target.analysisId, ids);
  if (!sheets.length) return { project: p, resultsId: null };
  const res = sheets[0] as ResultsSheet;
  const patched = sheets.map((s) => (s.id === res.id && s.kind === "results"
    ? { ...s, options: { ...(s.options as Record<string, unknown>), ...target.options } } : s));
  return { project: addSheets(p, patched, lastOfFamily(p, dataId)), resultsId: res.id };
}

/** A new, empty table of the target's type with the analysis set up. */
export function addTargetTable(p: Project, target: Target, name: string, ids: IdFactory):
  { project: Project; dataId: string; resultsId: string | null } {
  const def = tableDef(target.tableType as TableType);
  const { project, dataId } = addFamily(p, def.defaultTable(), name, ids, { analysis: null });
  const r = addConfiguredAnalysis(project, dataId, target, ids);
  return { project: r.project, dataId, resultsId: r.resultsId };
}

/** The example project of the start screen and the tour: the classic
 *  example families (XY dose-response, contingency, survival) plus a
 *  three-group column comparison analysed by one-way ANOVA with Tukey's
 *  comparisons, which the tour walks through. */
export function guidedExampleProject(prefs: ProjectPrefs, ids: IdFactory):
  { project: Project; dataId: string } {
  const base = sampleProject(prefs, ids);
  const col = tableDef("column");
  const { project, dataId } = addFamily(base, col.sampleTable!(), col.sampleName ?? "Group comparison",
    ids);
  const res = familyChildren(project, dataId).find((s): s is ResultsSheet => s.kind === "results");
  const p = res ? updateResultsOptions(project, res.id, (o) => ({
    ...(o as Record<string, unknown>), analysis: "anova", anovaKind: "parametric", anovaSd: "equal",
    comparisons: "tukey",
  })) : project;
  return { project: { ...p, title: "Getting started" }, dataId };
}

/** A fresh project holding one table (from a start-screen card or a
 *  paste): with example data, the type's example table. */
export function singleTableProject(prefs: ProjectPrefs, ids: IdFactory, type: TableType,
  opts: { example?: boolean; table?: DataTableModel; name?: string } = {}):
  { project: Project; dataId: string } {
  const def = tableDef(type);
  const table = opts.table ?? (opts.example && def.sampleTable ? def.sampleTable() : def.defaultTable());
  const name = opts.name ?? (opts.example ? def.sampleName ?? `${def.label} example` : "Data 1");
  const r = addFamily(makeProject(prefs, [], opts.example ? `${def.label} example` : "Untitled project"),
    table, name, ids);
  return r;
}

export function dataSheetOf(p: Project, id: string | null): DataSheet | null {
  const s = findSheet(p, id);
  if (!s) return null;
  if (s.kind === "data") return s;
  if (s.kind === "results" || s.kind === "graph") {
    const d = findSheet(p, s.parentId);
    return d?.kind === "data" ? d : null;
  }
  return null;
}
