// Templates: a data table saved together with the analyses run on it and
// the graphs drawn from it, to start the next experiment from. A template
// is a family in miniature: the table (with its data, or with the Y
// values cleared so only X, titles and shape remain), each results
// sheet's analysis and options, and each graph's kind and settings
// (including its Format Graph / Format Axes settings). Info sheets linked
// to the table come along too.
//
// Templates live outside projects: in this browser (app/templates.ts) and
// as downloadable `.odtemplate.json` files. Using one adds a new family to
// the open project.
//
// Plain data + pure functions, like the rest of this folder.
import type { IdFactory } from "./ids.ts";
import {
  addSheets, findSheet, familyChildren, makeDataSheet, makeGraphSheet,
  makeInfoSheet, makeResultsSheet, uniqueName,
} from "./ops.ts";
import { parseGraphSettings } from "./persist.ts";
import { normalizeTable } from "./table.ts";
import type {
  DataSheet, DataTableModel, GraphSettings, InfoConstant, InfoSheet, Project,
  Sheet,
} from "./types.ts";

export const TEMPLATE_MARKER = "opendose_template";
export const TEMPLATE_VERSION = 1;
export const TEMPLATE_EXTENSION = ".odtemplate.json";
/** Stands for the data table's name inside the stored sheet names. */
export const TABLE_TOKEN = "{table}";

export interface TemplateResults {
  key: string;              // local id, referenced by graphs
  name: string;             // may contain TABLE_TOKEN
  analysis: string;
  options: unknown;
}

export interface TemplateGraph {
  name: string;             // may contain TABLE_TOKEN
  graphType: string;
  resultsKey: string | null;
  settings: GraphSettings;
}

export interface TemplateInfo {
  name: string;             // may contain TABLE_TOKEN
  notes: string;
  constants: InfoConstant[];
}

export interface SheetTemplate {
  id: string;
  name: string;
  /** Shown when the template is chosen: what it is for, how to use it. */
  description: string;
  savedAt: number;          // epoch ms
  builtin?: boolean;
  /** True when `table` holds the original values. */
  withData: boolean;
  tableName: string;
  table: DataTableModel;
  results: TemplateResults[];
  graphs: TemplateGraph[];
  info: TemplateInfo[];
}

function cloneJson<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v)) as T;
}

/** Keep X values, titles and shape; clear the Y values (and exclusions). */
export function clearYValues(t: DataTableModel): DataTableModel {
  return {
    ...t,
    datasets: t.datasets.map((d) => ({
      ...d,
      rows: d.rows.map((row) => row.map(() => "")),
      excluded: undefined,
    })),
  };
}

function tokenize(name: string, tableName: string): string {
  return tableName && name.includes(tableName) ? name.split(tableName).join(TABLE_TOKEN) : name;
}

function untokenize(name: string, tableName: string): string {
  return name.split(TABLE_TOKEN).join(tableName);
}

/** A template from the family of `dataId` (any sheet of it works). */
export function templateFromFamily(p: Project, dataId: string, o: {
  id: string; name: string; description?: string; withData: boolean; now?: number;
}): SheetTemplate | null {
  const start = findSheet(p, dataId);
  const rootId = start?.kind === "data" ? start.id
    : start && (start.kind === "results" || start.kind === "graph") ? start.parentId
      : start?.kind === "info" ? start.parentId : null;
  const data = findSheet(p, rootId) as DataSheet | undefined;
  if (!data || data.kind !== "data") return null;
  const table = cloneJson(data.table);
  const kids = familyChildren(p, data.id);
  const keyOf = new Map<string, string>();
  const results: TemplateResults[] = [];
  for (const k of kids) {
    if (k.kind !== "results") continue;
    const key = `r${results.length + 1}`;
    keyOf.set(k.id, key);
    results.push({
      key, name: tokenize(k.name, data.name), analysis: k.analysis,
      options: cloneJson(k.options ?? {}),
    });
  }
  const graphs: TemplateGraph[] = kids.filter((k) => k.kind === "graph").map((g) => ({
    name: tokenize(g.name, data.name),
    graphType: g.graphType,
    resultsKey: g.resultsId ? keyOf.get(g.resultsId) ?? null : null,
    settings: cloneJson(g.settings),
  }));
  const info: TemplateInfo[] = p.sheets
    .filter((s): s is InfoSheet => s.kind === "info" && s.parentId === data.id)
    .map((s) => ({
      name: tokenize(s.name, data.name), notes: s.notes, constants: cloneJson(s.constants),
    }));
  return {
    id: o.id,
    name: o.name.trim() || data.name,
    description: (o.description ?? "").trim(),
    savedAt: o.now ?? Date.now(),
    withData: o.withData,
    tableName: data.name,
    table: o.withData ? table : clearYValues(table),
    results, graphs, info,
  };
}

/** The sheets a template creates: data table, results, graphs and linked
 *  info sheets, with fresh ids and the table's name substituted into the
 *  stored names. `withData: false` clears the template's Y values. */
export function templateSheets(p: Project, t: SheetTemplate, tableName: string,
  ids: IdFactory, o: { withData?: boolean } = {}): Sheet[] {
  const dataId = ids();
  const name = uniqueName(p, tableName.trim() || t.tableName || t.name);
  const useData = o.withData ?? t.withData;
  const table = cloneJson(useData ? t.table : clearYValues(t.table));
  const out: Sheet[] = [makeDataSheet(dataId, name, table)];
  let acc = addSheets(p, out);
  const idOf = new Map<string, string>();
  for (const r of t.results) {
    const id = ids();
    idOf.set(r.key, id);
    const s = makeResultsSheet(id, dataId, r.analysis, cloneJson(r.options),
      uniqueName(acc, untokenize(r.name, name)));
    out.push(s);
    acc = addSheets(acc, [s]);
  }
  for (const g of t.graphs) {
    const s = makeGraphSheet(ids(), dataId, g.resultsKey ? idOf.get(g.resultsKey) ?? null : null,
      g.graphType, cloneJson(g.settings), uniqueName(acc, untokenize(g.name, name)));
    out.push(s);
    acc = addSheets(acc, [s]);
  }
  for (const i of t.info) {
    const s = makeInfoSheet(ids(), uniqueName(acc, untokenize(i.name, name)), dataId);
    s.notes = i.notes;
    s.constants = cloneJson(i.constants);
    out.push(s);
    acc = addSheets(acc, [s]);
  }
  return out;
}

/** Add a template's family to the end of the project. */
export function applyTemplate(p: Project, t: SheetTemplate, tableName: string,
  ids: IdFactory, o: { withData?: boolean } = {}): { project: Project; dataId: string } {
  const sheets = templateSheets(p, t, tableName, ids, o);
  return { project: addSheets(p, sheets), dataId: sheets[0].id };
}

// ------------------------------------------------------------ files

/** JSON text of a template file. */
export function serializeTemplate(t: SheetTemplate): string {
  const { builtin: _b, ...rest } = t;
  void _b;
  return JSON.stringify({ [TEMPLATE_MARKER]: TEMPLATE_VERSION, template: rest }, null, 2);
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** A template from parsed JSON: a template file, or a bare template object
 *  (as stored in the browser). Throws with a readable message. */
export function templateFromJson(raw: unknown, o: { id?: string; scheme?: GraphSettings["scheme"] } = {}): SheetTemplate {
  const r = obj(raw);
  const version = r[TEMPLATE_MARKER];
  if (typeof version === "number" && version > TEMPLATE_VERSION) {
    throw new Error("this template was saved by a newer version of OpenDose");
  }
  const t = version !== undefined ? obj(r.template) : r;
  if (!t.table || typeof t.table !== "object") {
    throw new Error(r.opendose_project !== undefined
      ? "this is a project file; open it with Open instead"
      : "not an OpenDose template file");
  }
  const table = normalizeTable(t.table);
  const scheme = o.scheme ?? "default";
  const keys = new Set<string>();
  const results: TemplateResults[] = [];
  for (const item of Array.isArray(t.results) ? t.results : []) {
    const x = obj(item);
    const analysis = str(x.analysis);
    if (!analysis) continue;
    let key = str(x.key) || `r${results.length + 1}`;
    while (keys.has(key)) key = `${key}_`;
    keys.add(key);
    results.push({ key, name: str(x.name) || analysis, analysis, options: x.options ?? {} });
  }
  const graphs: TemplateGraph[] = [];
  for (const item of Array.isArray(t.graphs) ? t.graphs : []) {
    const x = obj(item);
    const graphType = str(x.graphType);
    if (!graphType) continue;
    const rk = str(x.resultsKey);
    graphs.push({
      name: str(x.name) || `Graph of ${TABLE_TOKEN}`,
      graphType,
      resultsKey: rk && keys.has(rk) ? rk : null,
      settings: parseGraphSettings(x.settings, scheme),
    });
  }
  const info: TemplateInfo[] = (Array.isArray(t.info) ? t.info : []).map((item) => {
    const x = obj(item);
    return {
      name: str(x.name) || "Info",
      notes: str(x.notes),
      constants: Array.isArray(x.constants)
        ? x.constants.map((c) => ({ name: str(obj(c).name), value: str(obj(c).value) })) : [],
    };
  });
  const tableName = str(t.tableName) || "Data";
  return {
    id: o.id ?? (str(t.id) || "template"),
    name: str(t.name) || tableName,
    description: str(t.description),
    savedAt: typeof t.savedAt === "number" && Number.isFinite(t.savedAt) ? t.savedAt : 0,
    ...(t.builtin === true ? { builtin: true } : {}),
    withData: t.withData === true,
    tableName, table, results, graphs, info,
  };
}

export function parseTemplateFile(text: string, o: { id?: string; scheme?: GraphSettings["scheme"] } = {}): SheetTemplate {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("not a valid JSON file"); }
  return templateFromJson(raw, o);
}

/** File name for a template download. */
export function templateFileName(t: SheetTemplate): string {
  const slug = t.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "template";
  return `${slug}${TEMPLATE_EXTENSION}`;
}
