// Analysis replay: apply a project (the plan: its tables' layouts, every
// analysis with its options, every graph with its format, every page
// layout) to new data, and log which numbers changed. Pure: reading files
// and running the engine happen in share/ReplayDialog.tsx.
//
// 1. The plan comes from the open project, a project file, or a
//    provenance.json from an export bundle (its replay_plan, or for older
//    bundles the analyses it lists).
// 2. New data (CSV / TSV / pasted text, worksheets of an .xlsx, tables of
//    a .pzfx) are matched to the plan's tables: one table and one source
//    pair up; otherwise by name, then by shape; what stays ambiguous is
//    left to the user's mapping.
// 3. Each matched table is refilled in its own layout (import "replace"),
//    so results, graphs and layouts that hang off it are kept as they are
//    and recompute.
// 4. The replay log compares each results sheet's numbers before and
//    after (project/replayDiff.ts).
import {
  applyImport, datasetTitle, DEFAULT_FILTER, DEFAULT_SOURCE, defaultRoles, detectTitlesRow,
  importWidth, prepareImport,
} from "./importText.ts";
import type { IdFactory } from "./ids.ts";
import { FILE_MARKER, projectFromJson, serializeProject } from "./persist.ts";
import { tableShape } from "./table.ts";
import { clearYValues } from "./templates.ts";
import type {
  DataSheet, DataTableModel, Project, ProjectPrefs, TableType,
} from "./types.ts";
import {
  describeChange, diffResults, keyChanges, type ChangeKind,
} from "./replayDiff.ts";

// ------------------------------------------------------------ the plan

export const PLAN_KEY = "replay_plan";

export interface PlanTable { id: string; name: string; table: DataTableModel }

/** Tables new data can go into: data sheets that are not derived (those
 *  follow their source) and not frozen. */
export function planTables(p: Project): PlanTable[] {
  return p.sheets
    .filter((s): s is DataSheet => s.kind === "data" && !s.derived && !s.frozen)
    .map((s) => ({ id: s.id, name: s.name, table: s.table }));
}

/** The plan as written into provenance.json (`replay_plan`): the project
 *  file without data values (X, titles and layout kept, Y cleared), cached
 *  results or frozen snapshots. Enough to rebuild every table layout,
 *  analysis, graph and page layout. */
export function replayPlanOf(p: Project): Record<string, unknown> {
  const sheets = p.sheets.map((s) => {
    if (s.kind === "data") return { ...s, table: clearYValues(s.table) };
    if (s.kind === "results") {
      const { cached: _c, cachedKey: _k, frozen: _f, ...rest } = s;
      void _c; void _k; void _f;
      return rest;
    }
    if (s.kind === "graph") {
      const { snapshot: _s, frozen: _f, ...rest } = s;
      void _s; void _f;
      return rest;
    }
    return s;
  });
  return JSON.parse(serializeProject({ ...p, sheets })) as Record<string, unknown>;
}

interface LoadContext { prefs: ProjectPrefs; ids: IdFactory }

export interface LoadedPlan {
  project: Project;
  kind: "project" | "provenance";
  /** The file carries results to compare against. */
  hasResults: boolean;
  /** Rebuilt from an older provenance file: analyses and graphs, but
   *  default graph formats and no page layouts. */
  partial?: boolean;
}

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A provenance.json from before replay plans: its families' tables
 *  (type and data set names), analyses (with options) and graphs. */
export function projectFromProvenance(doc: Record<string, unknown>, ctx: LoadContext): Project {
  const sheets: Record<string, unknown>[] = [];
  for (const f of Array.isArray(doc.families) ? doc.families : []) {
    const t = obj(obj(f).table);
    const dataId = str(t.sheet_id) || ctx.ids();
    const names = Array.isArray(t.data_sets) ? t.data_sets.map(str) : [];
    const rows = Math.max(1, Number(t.rows) || 1);
    sheets.push({
      kind: "data", id: dataId, name: str(t.name) || "Data",
      table: {
        type: str(t.type) || "xy",
        x: Array(rows).fill(""),
        datasets: (names.length ? names : ["Data set A"]).map((name) => ({
          name, rows: Array.from({ length: rows }, () => [""]),
        })),
      },
    });
    const steps = Array.isArray(obj(f).steps) ? obj(f).steps as unknown[] : [];
    const analyses = new Map<string, string>();
    for (const raw of steps) {
      const s = obj(raw);
      if (s.kind !== "analysis") continue;
      const id = str(s.sheet_id) || ctx.ids();
      analyses.set(str(s.sheet), id);
      const options: Record<string, unknown> = {};
      for (const [k, e] of Object.entries(obj(s.options))) options[k] = obj(e).value ?? null;
      sheets.push({ kind: "results", id, parentId: dataId, name: str(s.sheet) || "Results",
        analysis: str(s.analysis), options });
    }
    for (const raw of steps) {
      const s = obj(raw);
      if (s.kind !== "graph") continue;
      sheets.push({ kind: "graph", id: str(s.sheet_id) || ctx.ids(), parentId: dataId,
        name: str(s.sheet) || "Graph", graphType: str(s.graph),
        resultsId: analyses.get(str(s.draws)) ?? null,
        settings: s.settings ?? { titles: { x: "", y: "" } } });
    }
  }
  return projectFromJson({ [FILE_MARKER]: 2, version: 2, title: "Replayed project",
    prefs: ctx.prefs, sheets }, ctx);
}

/** A plan from a file: a project file (.json) or a provenance.json. */
export function planFromJson(raw: unknown, ctx: LoadContext): LoadedPlan {
  const r = obj(raw);
  if (r.opendose_provenance !== undefined) {
    if (r[PLAN_KEY]) {
      return { project: projectFromJson(r[PLAN_KEY], ctx), kind: "provenance", hasResults: false };
    }
    return { project: projectFromProvenance(r, ctx), kind: "provenance", hasResults: false,
      partial: true };
  }
  const project = projectFromJson(raw, ctx);
  const hasResults = project.sheets.some((s) => s.kind === "results" && s.cached !== undefined);
  return { project, kind: "project", hasResults };
}

// ------------------------------------------------------------ new data

/** One table of new data. */
export interface IncomingTable {
  /** Name to match by: the file name without extension, a worksheet's
   *  name, a Prism table's title. */
  name: string;
  /** Where it came from, for the log ("week2.xlsx › Plate 1"). */
  origin: string;
  /** Delimited text, or a worksheet's cells. */
  source?: string | string[][];
  /** A whole table (read from a .pzfx file). */
  table?: DataTableModel;
}

/** The new data shaped as the plan's table. */
export interface Fit {
  table: DataTableModel;
  /** Same number of data sets and subcolumns as the plan's table. */
  exact: boolean;
  rows: number;
  datasets: number;
  /** Data set titles in the file that differ from the table's (the
   *  table's names are kept when the shape matches). */
  renamed: string[];
}

/** Rows holding any value or title. */
export function usedRows(t: DataTableModel): number {
  let n = 0;
  for (let r = 0; r < t.x.length; r++) {
    const any = (t.x[r] ?? "").trim() !== "" || (t.rowTitles[r] ?? "").trim() !== ""
      || t.datasets.some((d) => d.rows[r]?.some((v) => (v ?? "").trim() !== ""));
    if (any) n = r + 1;
  }
  return n;
}

/** Any Y value at all (a plan from provenance.json keeps only X). */
export function hasYValues(t: DataTableModel): boolean {
  return t.datasets.some((d) => d.rows.some((r) => r.some((v) => (v ?? "").trim() !== "")));
}

/** Y subcolumns per data set (replicates) of a table. */
export function perDataset(t: DataTableModel): number {
  return Math.max(1, ...t.datasets.map((d) => d.rows[0]?.length ?? 1));
}

const DATA_FIELDS = ["x", "xExcluded", "rowTitles", "datasets", "subcolumnFormat"] as const;

/** Fill the plan's table with new data in its own layout, or null when
 *  the data cannot go into a table of that type. */
export function fitIncoming(plan: DataTableModel, src: IncomingTable): Fit | null {
  if (src.table) {
    const t = src.table;
    if (t.type !== plan.type) return null;
    const exact = t.datasets.length === plan.datasets.length
      && t.subcolumnFormat === plan.subcolumnFormat && perDataset(t) === perDataset(plan);
    const next: DataTableModel = { ...plan };
    for (const k of DATA_FIELDS) (next as unknown as Record<string, unknown>)[k] = t[k];
    if (!t.xExcluded) delete next.xExcluded;
    const renamed: string[] = [];
    if (exact) {
      next.datasets = t.datasets.map((d, i) => {
        if (d.name !== plan.datasets[i].name) renamed.push(d.name);
        return { ...d, name: plan.datasets[i].name };
      });
    }
    return { table: next, exact, rows: usedRows(t), datasets: t.datasets.length, renamed };
  }
  if (src.source === undefined) return null;
  const titlesRow = detectTitlesRow(src.source, DEFAULT_SOURCE);
  const preview = prepareImport(src.source, { ...DEFAULT_SOURCE, titlesRow }, DEFAULT_FILTER);
  if (!preview.rows.length) return null;
  const roles = defaultRoles(plan, preview);
  const per = perDataset(plan);
  const width = importWidth(plan, per);
  const ys = roles.map((r, i) => (r === "y" ? i : -1)).filter((i) => i >= 0);
  if (!ys.length) return null;
  const nDs = Math.ceil(ys.length / width);
  const exact = ys.length % width === 0 && nDs === plan.datasets.length;
  let table = applyImport(plan, preview, roles, {
    mode: "replace", row: 0, col: 0, perDataset: per, useTitles: !exact && !!preview.titles,
  }, { skipBlankX: false, asteriskExcluded: true });
  // a file without row titles keeps the table's (group names of a
  // contingency or grouped table)
  const shape = tableShape(plan.type);
  if (shape.hasRowTitles && !roles.includes("rowTitle")
    && table.rowTitles.length === plan.rowTitles.length) {
    table = { ...table, rowTitles: [...plan.rowTitles] };
  }
  const renamed: string[] = [];
  if (exact && preview.titles) {
    for (let d = 0; d < nDs; d++) {
      const title = datasetTitle(ys.slice(d * width, d * width + width)
        .map((c) => preview.titles?.[c] ?? ""));
      if (title && title !== plan.datasets[d]?.name) renamed.push(title);
    }
  }
  return { table, exact, rows: usedRows(table), datasets: table.datasets.length, renamed };
}

/** Lower case letters and digits only, for comparing names. */
export function normName(s: string): string {
  return s.normalize("NFKD").toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** How well a source name matches a table name: 3 equal, 2 one contains
 *  the other, 0 no. */
export function nameScore(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 3;
  if (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))) return 2;
  return 0;
}

export type MatchHow = "only" | "name" | "shape" | "manual";

export interface Matching {
  /** Plan table id -> source index. */
  assign: Map<string, { source: number; how: MatchHow }>;
  /** Sources that could go into an unmatched table, but which one is not
   *  clear: the user picks (the mapping dialog). */
  ambiguous: boolean;
  /** Sources not assigned to any table. */
  unused: number[];
  /** fits[plan index][source index] */
  fits: (Fit | null)[][];
}

/** Pair new data with the plan's tables: a single table and a single
 *  source pair up; then by name; then a source whose shape fits exactly
 *  one remaining table (and that table no other source) goes there. */
export function matchTables(plan: PlanTable[], incoming: IncomingTable[]): Matching {
  const fits = plan.map((p) => incoming.map((s) => fitIncoming(p.table, s)));
  const assign = new Map<string, { source: number; how: MatchHow }>();
  const used = new Set<number>();
  const take = (j: number, i: number, how: MatchHow) => {
    assign.set(plan[j].id, { source: i, how });
    used.add(i);
  };
  if (plan.length === 1 && incoming.length === 1 && fits[0][0]) take(0, 0, "only");
  // by name: the best-scoring table, when it is the only one at that score
  for (let i = 0; i < incoming.length; i++) {
    if (used.has(i)) continue;
    const scored = plan.map((p, j) => ({ j, s: !assign.has(p.id) && fits[j][i]
      ? nameScore(incoming[i].name, p.name) : 0 })).filter((x) => x.s > 0);
    const best = Math.max(0, ...scored.map((x) => x.s));
    const top = scored.filter((x) => x.s === best);
    if (best && top.length === 1) take(top[0].j, i, "name");
  }
  // by shape, until nothing more pairs up
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < incoming.length; i++) {
      if (used.has(i)) continue;
      const tables = plan.map((_, j) => j).filter((j) => !assign.has(plan[j].id) && fits[j][i]?.exact);
      if (tables.length !== 1) continue;
      const j = tables[0];
      const rivals = incoming.map((_, k) => k).filter((k) => !used.has(k) && k !== i && fits[j][k]?.exact);
      if (rivals.length) continue;
      take(j, i, "shape");
      changed = true;
    }
  }
  const unused = incoming.map((_, i) => i).filter((i) => !used.has(i));
  const ambiguous = unused.some((i) => plan.some((p, j) => !assign.has(p.id) && fits[j][i]));
  return { assign, ambiguous, unused, fits };
}

/** The plan with the matched tables refilled; every other sheet as it
 *  was. */
export function replaceTables(p: Project, tables: ReadonlyMap<string, DataTableModel>): Project {
  return {
    ...p,
    sheets: p.sheets.map((s) => (s.kind === "data" && tables.has(s.id)
      ? { ...s, table: tables.get(s.id)! } : s)),
  };
}

// ------------------------------------------------------------ the log

export interface LogTable {
  name: string;
  type: TableType;
  /** "replaced": new data went in; "kept": no new data for it. */
  status: "replaced" | "kept";
  origin?: string;
  detail: string;
  warnings: string[];
}

export interface LogResult {
  id: string;
  name: string;
  table: string;
  status: "changed" | "same" | "error" | "frozen" | "new" | "pending";
  changes: { label: string; text: string; kind: ChangeKind }[];
  /** Further changed numbers not listed. */
  more: number;
  note?: string;
}

export interface ReplayLog {
  date: string;
  plan: string;
  tables: LogTable[];
  unused: { origin: string; reason: string }[];
  results: LogResult[];
  graphs: number;
  layouts: number;
}

export interface LogInput {
  date: string;
  /** "this project" or the plan file's name. */
  plan: string;
  /** The project after the replay. */
  project: Project;
  replaced: { planId: string; origin: string; fit: Fit }[];
  incoming: IncomingTable[];
  unused: number[];
  /** Results before (sheet id -> result); absent when there was none. */
  before: ReadonlyMap<string, unknown>;
  after: ReadonlyMap<string, unknown>;
  /** Most changes listed per results sheet. */
  max?: number;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function buildReplayLog(o: LogInput): ReplayLog {
  const p = o.project;
  const byId = new Map(p.sheets.map((s) => [s.id, s]));
  const replaced = new Map(o.replaced.map((r) => [r.planId, r]));
  const tables: LogTable[] = [];
  for (const s of p.sheets) {
    if (s.kind !== "data" || s.derived) continue;
    const r = replaced.get(s.id);
    if (!r) {
      tables.push({ name: s.name, type: s.table.type, status: "kept", warnings: [],
        detail: s.frozen ? "frozen: kept as it was"
          : hasYValues(s.table) ? "no new data for this table: kept as it was"
            : "no new data for this table, and the plan holds no values: it is empty" });
      continue;
    }
    const warnings: string[] = [];
    if (!r.fit.exact) warnings.push(`the new data have ${plural(r.fit.datasets, "data set")} `
      + `in a different layout from the table's`);
    if (r.fit.renamed.length) warnings.push(`titles in the file (${r.fit.renamed.join(", ")}) differ `
      + "from the data set names, which were kept");
    tables.push({ name: s.name, type: s.table.type, status: "replaced", origin: r.origin, warnings,
      detail: `${plural(r.fit.rows, "row")}, ${plural(r.fit.datasets, "data set")}` });
  }
  const results: LogResult[] = [];
  for (const s of p.sheets) {
    if (s.kind !== "results") continue;
    const data = byId.get(s.parentId);
    const base = { id: s.id, name: s.name, table: data?.name ?? "", changes: [], more: 0 };
    if (s.frozen) {
      results.push({ ...base, status: "frozen", note: "frozen: keeps its stored result" });
      continue;
    }
    const after = o.after.get(s.id);
    if (after === undefined || after === null) {
      results.push({ ...base, status: "pending", note: "still computing; open the sheet to see it" });
      continue;
    }
    if (!o.before.has(s.id) || o.before.get(s.id) == null) {
      results.push({ ...base, status: "new", note: "no earlier numbers to compare with" });
      continue;
    }
    const d = diffResults(o.before.get(s.id), after);
    if (d.afterError) {
      results.push({ ...base, status: "error", note: `the analysis failed on the new data: ${d.afterError}` });
      continue;
    }
    const key = keyChanges(d, o.max ?? 8);
    results.push({
      ...base,
      status: d.changed.length ? "changed" : "same",
      changes: key.map((c) => ({ label: c.label, text: describeChange(c), kind: c.kind })),
      more: d.changed.length - key.length,
      ...(d.beforeError ? { note: "the earlier result was an error" } : {}),
    });
  }
  const unused = o.unused.map((i) => {
    const src = o.incoming[i];
    return { origin: src.origin, reason: "did not match any table by name or shape" };
  });
  return {
    date: o.date, plan: o.plan, tables, unused, results,
    graphs: p.sheets.filter((s) => s.kind === "graph").length,
    layouts: p.sheets.filter((s) => s.kind === "layout").length,
  };
}

/** One line per results sheet's status. */
export function resultHeadline(r: LogResult): string {
  switch (r.status) {
    case "changed": {
      const n = r.changes.length + r.more;
      return `${plural(n, "number")} changed`;
    }
    case "same": return "no number changed";
    default: return r.note ?? r.status;
  }
}

/** The log as plain text (Copy log, the info sheet). */
export function replayLogText(log: ReplayLog): string {
  const out: string[] = [
    `Replay log, ${log.date.slice(0, 16).replace("T", " ")} UTC`,
    `Plan: ${log.plan}`,
    "",
    "Tables",
  ];
  for (const t of log.tables) {
    out.push(t.status === "replaced"
      ? `- ${t.name}: new data from ${t.origin} (${t.detail})`
      : `- ${t.name}: ${t.detail}`);
    for (const w of t.warnings) out.push(`    note: ${w}`);
  }
  for (const u of log.unused) out.push(`- ${u.origin}: ${u.reason}`);
  out.push("", "Results");
  for (const r of log.results) {
    out.push(`- ${r.name}: ${resultHeadline(r)}`);
    for (const c of r.changes) out.push(`    ${c.label}: ${c.text}`);
    if (r.more > 0) out.push(`    and ${plural(r.more, "other number")}`);
  }
  out.push("", `${plural(log.graphs, "graph")} and ${plural(log.layouts, "page layout")} kept; `
    + "they redraw from the new numbers.");
  return out.join("\n");
}
