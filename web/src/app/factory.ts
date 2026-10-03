// Registry-aware project construction: new families, sample project, blank
// project, Prism-file import. Pure (ids come from an injected factory).
import type { IdFactory } from "../project/ids";
import {
  addSheets, findSheet, makeDataSheet, makeGraphSheet, makeInfoSheet,
  makeProject, makeResultsSheet, nextNumberedName, uniqueName,
} from "../project/ops";
import { makeDerivedSheet } from "../project/derived";
import { clearValues, normalizeTable } from "../project/table";
import type {
  DataSheet, DataTableModel, Project, ProjectPrefs, Sheet, SubcolumnFormat,
} from "../project/types";
import { analysisDef, tableDef } from "../sheets/registry";

/** Data sheet + (optionally) one results sheet + its default graph. */
export function familySheets(p: Project, table: DataTableModel, name: string,
  ids: IdFactory, opts: { analysis?: string | null } = {}): Sheet[] {
  const def = tableDef(table.type);
  const dataId = ids();
  const dataName = uniqueName(p, name);
  let acc = addSheets(p, [makeDataSheet(dataId, dataName, table)]);
  const out: Sheet[] = [findSheet(acc, dataId)!];
  const a = opts.analysis === null ? undefined
    : opts.analysis ? def.analyses.find((x) => x.id === opts.analysis) : def.analyses[0];
  if (a) {
    const more = analysisSheets(acc, dataId, a.id, ids);
    acc = addSheets(acc, more);
    out.push(...more);
  }
  return out;
}

/** A results sheet for `analysisId` on data sheet `dataId`, plus the
 *  analysis' default graph bound to it. */
export function analysisSheets(p: Project, dataId: string, analysisId: string,
  ids: IdFactory): Sheet[] {
  const data = findSheet(p, dataId) as DataSheet | undefined;
  if (!data || data.kind !== "data") return [];
  const a = analysisDef(data.table.type, analysisId);
  if (!a) return [];
  const rid = ids();
  const results = makeResultsSheet(rid, dataId, a.id,
    a.defaultOptions({ table: data.table, prefs: p.prefs }),
    uniqueName(p, a.sheetName(data.name)));
  const out: Sheet[] = [results];
  if (a.derivedTable) {
    // Output table of a chain: filled in by the derived-table sync.
    out.push(makeDerivedSheet(ids(), uniqueName(addSheets(p, [results]),
      a.derivedName?.(data.name) ?? `${a.short} of ${data.name}`),
    clearValues(data.table), { sourceId: dataId, resultsId: rid }));
  }
  if (a.defaultGraph) {
    const withResults = addSheets(p, [results]);
    out.push(makeGraphSheet(ids(), dataId, rid, a.defaultGraph,
      { titles: { x: "", y: "" }, scheme: p.prefs.scheme },
      uniqueName(withResults, `Graph of ${data.name}`)));
  }
  return out;
}

/** After results sheets were copied in (template, "analyze like"): give
 *  each table-producing analysis among them its output table, right after
 *  the results sheet, as adding the analysis by hand would. */
export function addDerivedOutputs(p: Project, created: Sheet[], ids: IdFactory): Project {
  let next = p;
  for (const s of created) {
    if (s.kind !== "results") continue;
    const data = findSheet(next, s.parentId) as DataSheet | undefined;
    if (!data || data.kind !== "data") continue;
    const a = analysisDef(data.table.type, s.analysis);
    if (!a?.derivedTable) continue;
    const out = makeDerivedSheet(ids(), uniqueName(next,
      a.derivedName?.(data.name) ?? `${a.short} of ${data.name}`),
    clearValues(data.table), { sourceId: data.id, resultsId: s.id });
    const after = [...created].reverse().find((c) => next.sheets.some((x) => x.id === c.id))?.id;
    next = addSheets(next, [out], after);
  }
  return next;
}

export function addFamily(p: Project, table: DataTableModel, name: string,
  ids: IdFactory, opts?: { analysis?: string | null }): { project: Project; dataId: string } {
  const sheets = familySheets(p, table, name, ids, opts);
  return { project: addSheets(p, sheets), dataId: sheets[0].id };
}

/** First-run project: one family per classic table type with example
 *  data, plus an info sheet, so every workflow is one click away. */
export function sampleProject(prefs: ProjectPrefs, ids: IdFactory): Project {
  let p = makeProject(prefs, [], "Getting started");
  for (const type of ["xy", "contingency", "survival"] as const) {
    const def = tableDef(type);
    p = addFamily(p, def.sampleTable!(), def.sampleName ?? def.label, ids).project;
  }
  const info = makeInfoSheet(ids(), "Project info");
  info.notes = "Example project. Each data table in the navigator has its "
    + "results and graphs nested under it. Create your own with “New data "
    + "table”, or open a saved project or a Prism file.";
  return addSheets(p, [info]);
}

/** "New project": one empty table of the preferred type. */
export function blankProject(prefs: ProjectPrefs, ids: IdFactory): Project {
  const def = tableDef(prefs.defaultTableType);
  const p = makeProject(prefs, [], "Untitled project");
  return addFamily(p, def.defaultTable(), "Data 1", ids).project;
}

export function defaultTableName(p: Project): string {
  return nextNumberedName(p, "Data");
}

// ------------------------------------------------------------ Prism import

export interface PrismTable {
  title: string;
  table_type: string;
  x: (number | null)[] | null;
  x_title: string;
  n_rows: number;
  datasets: { name: string; ys: (number | null)[][] }[];
  y_format?: string;
  row_titles?: string[];
}

const toCell = (v: number | null | undefined) => (v == null ? "" : String(v));

/** Prism's grouped-table formats: "TwoWay" in .pzfx, "Grouped" in .prism. */
export function isGroupedPrismTable(t: PrismTable): boolean {
  const type = t.table_type.toLowerCase();
  return (type === "twoway" || type === "grouped") && t.datasets.length > 0;
}

/** Prism Y formats with mean / error / N subcolumns -> our formats. */
const PRISM_SUMMARY_FORMATS: Record<string, SubcolumnFormat> = {
  sdn: "mean_sd_n", sen: "mean_sem_n", cvn: "mean_cv_n",
  sd: "mean_sd", se: "mean_sem",
  mean_sd_n: "mean_sd_n", mean_sem_n: "mean_sem_n", mean_cv_n: "mean_cv_n",
};

/** Map one table from a .pzfx/.prism file onto our table types. */
export function prismTableToFamily(p: Project, t: PrismTable, ids: IdFactory):
  { project: Project; dataId: string } {
  const name = t.title || "Imported data";
  if (t.table_type === "Survival" && t.x) {
    // X = time; each Y column = one group with an event code (1 = event,
    // 0 = censored) on that subject's row.
    const table = normalizeTable({
      type: "survival",
      datasets: t.datasets.map((ds) => ({
        name: ds.name || "Group",
        subTitles: ["Time", "Event"],
        rows: ds.ys
          .map((row, r) => [toCell(t.x![r]), toCell(row[0])])
          .filter((rw) => rw[0] !== "" && rw[1] !== ""),
      })),
    });
    return addFamily(p, table, name, ids);
  }
  if (t.table_type === "XY" && t.x) {
    const table = normalizeTable({
      type: "xy",
      x: t.x.map(toCell),
      xTitle: t.x_title || "X",
      datasets: t.datasets.map((ds) => ({
        name: ds.name || "Dataset",
        rows: ds.ys.map((row) => row.map(toCell)),
      })),
    });
    const res = addFamily(p, table, name, ids);
    // A negative X cannot be a concentration, so the column is already
    // log10. A zero is not evidence either way and must not count: a
    // vehicle-control row at dose 0 is ordinary in a raw dose table.
    const xIsLog = t.x.some((v) => v != null && v < 0);
    const project = {
      ...res.project,
      sheets: res.project.sheets.map((s) => (s.kind === "results" && s.parentId === res.dataId
        ? { ...s, options: { ...(s.options as object), xIsLog } } : s)),
    };
    return { project, dataId: res.dataId };
  }
  if (isGroupedPrismTable(t)) {
    // Rows × datasets × replicates: a grouped table, analyzed by two-way
    // ANOVA first (as it would be in Prism).
    const fmt = PRISM_SUMMARY_FORMATS[String(t.y_format ?? "").toLowerCase()] ?? "replicates";
    const table = normalizeTable({
      type: "grouped",
      x: Array(t.n_rows).fill(""),
      rowTitles: t.row_titles ?? [],
      subcolumnFormat: fmt,
      datasets: t.datasets.map((ds, i) => ({
        name: ds.name || `Dataset ${i + 1}`,
        rows: ds.ys.map((row) => row.map(toCell)),
      })),
    });
    return addFamily(p, table, name, ids);
  }
  const table = normalizeTable({
    type: "column",
    x: Array(t.n_rows).fill(""),
    datasets: t.datasets.map((ds) => ({
      name: ds.name || "Group",
      rows: ds.ys.map((row) => row.map(toCell)),
    })),
  });
  return addFamily(p, table, name, ids);
}
