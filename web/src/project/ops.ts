// Pure project-level operations: sheet lookup, families, add / rename /
// duplicate / delete / reorder / freeze. Each takes a Project and returns a
// new one (or the same object when nothing changed).
import type { IdFactory } from "./ids.ts";
import { forgetGraphs } from "./layout.ts";
import { clearValues } from "./table.ts";
import type {
  DataSheet, DataTableModel, GraphSheet, GraphSettings, HighlightColor,
  InfoSheet, LayoutSheet, Project, ProjectPrefs, ResultsSheet, Sheet,
  SheetKind,
} from "./types.ts";

// ------------------------------------------------------------ factories

export function makeProject(prefs: ProjectPrefs, sheets: Sheet[] = [],
  title = "Untitled project"): Project {
  return { version: 2, title, sheets, prefs };
}

export function makeDataSheet(id: string, name: string, table: DataTableModel): DataSheet {
  return { id, kind: "data", name, table };
}

export function makeResultsSheet(id: string, parentId: string, analysis: string,
  options: unknown, name: string): ResultsSheet {
  return { id, kind: "results", parentId, analysis, options, name };
}

export function makeGraphSheet(id: string, parentId: string,
  resultsId: string | null, graphType: string, settings: GraphSettings,
  name: string): GraphSheet {
  return { id, kind: "graph", parentId, resultsId, graphType, settings, name };
}

export function makeInfoSheet(id: string, name = "Project info",
  parentId: string | null = null): InfoSheet {
  return {
    id, kind: "info", name, parentId, notes: "",
    constants: DEFAULT_INFO_CONSTANTS.map((n) => ({ name: n, value: "" })),
  };
}

export const DEFAULT_INFO_CONSTANTS = [
  "Experiment date", "Experiment ID", "Notebook reference", "Project",
  "Experimenter", "Protocol",
];

export function makeLayoutSheet(id: string, name = "Layout 1"): LayoutSheet {
  return { id, kind: "layout", name, graphIds: [], grid: { rows: 1, cols: 2 } };
}

// ------------------------------------------------------------ lookup

export function findSheet(p: Project, id: string | null | undefined): Sheet | undefined {
  return id ? p.sheets.find((s) => s.id === id) : undefined;
}

export function sheetsOfKind<K extends SheetKind>(p: Project, kind: K):
  Extract<Sheet, { kind: K }>[] {
  return p.sheets.filter((s) => s.kind === kind) as Extract<Sheet, { kind: K }>[];
}

/** The data sheet a sheet belongs to (itself for data sheets). */
export function familyRootId(p: Project, id: string): string | null {
  const s = findSheet(p, id);
  if (!s) return null;
  if (s.kind === "data") return s.id;
  if (s.kind === "results" || s.kind === "graph") return s.parentId;
  if (s.kind === "info") return s.parentId;
  return null;
}

/** Results and graphs analyzing / plotting a data sheet, in project order. */
export function familyChildren(p: Project, dataId: string): (ResultsSheet | GraphSheet)[] {
  return p.sheets.filter((s): s is ResultsSheet | GraphSheet =>
    (s.kind === "results" || s.kind === "graph") && s.parentId === dataId);
}

export function familyIds(p: Project, id: string): string[] {
  const root = familyRootId(p, id);
  if (!root) return [id];
  return [root, ...familyChildren(p, root).map((s) => s.id)];
}

export function uniqueName(p: Project, base: string, exceptId?: string): string {
  const taken = new Set(p.sheets.filter((s) => s.id !== exceptId).map((s) => s.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base} (${i})`;
    if (!taken.has(n)) return n;
  }
}

/** "Data 1", "Data 2", ... first free. */
export function nextNumberedName(p: Project, stem: string): string {
  const taken = new Set(p.sheets.map((s) => s.name));
  for (let i = 1; ; i++) {
    const n = `${stem} ${i}`;
    if (!taken.has(n)) return n;
  }
}

// ------------------------------------------------------------ edits

export function addSheets(p: Project, sheets: Sheet[], afterId?: string): Project {
  if (!sheets.length) return p;
  const list = [...p.sheets];
  const at = afterId ? list.findIndex((s) => s.id === afterId) : -1;
  if (at >= 0) list.splice(at + 1, 0, ...sheets);
  else list.push(...sheets);
  return { ...p, sheets: list };
}

export function updateSheet<S extends Sheet>(p: Project, id: string,
  fn: (s: S) => S): Project {
  let changed = false;
  const sheets = p.sheets.map((s) => {
    if (s.id !== id) return s;
    const next = fn(s as S);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...p, sheets } : p;
}

/** Edit a data table. Frozen tables refuse every change. */
export function updateTable(p: Project, id: string,
  fn: (t: DataTableModel) => DataTableModel): Project {
  return updateSheet<Sheet>(p, id, (s) => {
    if (s.kind !== "data" || s.frozen) return s;
    const table = fn(s.table);
    return table === s.table ? s : { ...s, table };
  });
}

/** Change a results sheet's options. Frozen sheets refuse. */
export function updateResultsOptions(p: Project, id: string,
  fn: (o: unknown) => unknown): Project {
  return updateSheet<Sheet>(p, id, (s) => {
    if (s.kind !== "results" || s.frozen) return s;
    const options = fn(s.options);
    return options === s.options ? s : { ...s, options };
  });
}

export function renameSheet(p: Project, id: string, name: string): Project {
  const clean = name.trim();
  if (!clean) return p;
  return updateSheet<Sheet>(p, id, (s) => (s.name === clean ? s : { ...s, name: clean }));
}

export function setTitle(p: Project, title: string): Project {
  return p.title === title ? p : { ...p, title };
}

export function setHighlight(p: Project, id: string,
  highlight: HighlightColor | null): Project {
  return updateSheet<Sheet>(p, id, (s) =>
    ((s.highlight ?? null) === highlight ? s : { ...s, highlight }));
}

/** Freeze or unfreeze. Freezing a results sheet stores the result it
 *  shows; freezing a graph stores the data/result it draws, so neither
 *  follows later edits. Unfreezing reconnects them. */
export function setFrozen(p: Project, id: string, frozen: boolean,
  capture?: { cached?: unknown; snapshot?: GraphSheet["snapshot"] }): Project {
  return updateSheet<Sheet>(p, id, (s) => {
    if (!!s.frozen === frozen) return s;
    if (s.kind === "results") {
      return frozen ? { ...s, frozen, cached: capture?.cached ?? s.cached }
        : { ...s, frozen: false };
    }
    if (s.kind === "graph") {
      if (frozen) return { ...s, frozen, snapshot: capture?.snapshot };
      const rest = { ...s, frozen: false };
      delete rest.snapshot;
      return rest;
    }
    return { ...s, frozen };
  });
}

/** Delete a sheet. Deleting a data table deletes its whole family; graphs
 *  that drew from a deleted results sheet are kept but unbound; layouts
 *  forget deleted graphs; info sheets linked to a deleted table become
 *  project-wide. */
export function deleteSheet(p: Project, id: string): Project {
  const s = findSheet(p, id);
  if (!s) return p;
  const doomed = new Set(s.kind === "data" ? familyIds(p, id) : [id]);
  const sheets = p.sheets
    .filter((x) => !doomed.has(x.id))
    .map((x): Sheet => {
      if (x.kind === "graph" && x.resultsId && doomed.has(x.resultsId)) {
        return { ...x, resultsId: null };
      }
      if (x.kind === "layout") return forgetGraphs(x, (g) => !doomed.has(g));
      if (x.kind === "info" && x.parentId && doomed.has(x.parentId)) {
        return { ...x, parentId: null };
      }
      return x;
    });
  return { ...p, sheets };
}

/** Sheets a delete would remove (for the confirmation message). */
export function deletionCount(p: Project, id: string): number {
  const s = findSheet(p, id);
  if (!s) return 0;
  return s.kind === "data" ? familyIds(p, id).length : 1;
}

/** Move a sheet one place up/down among the sheets of its own kind (and,
 *  for results and graphs, of its own family). */
export function moveSheet(p: Project, id: string, dir: -1 | 1): Project {
  const s = findSheet(p, id);
  if (!s) return p;
  const peers = p.sheets.filter((x) => x.kind === s.kind && (
    (x.kind !== "results" && x.kind !== "graph") ||
    (s.kind === x.kind && "parentId" in s && x.parentId === s.parentId)));
  const i = peers.findIndex((x) => x.id === id);
  const other = peers[i + dir];
  if (!other) return p;
  const a = p.sheets.indexOf(s);
  const b = p.sheets.indexOf(other);
  const sheets = [...p.sheets];
  sheets[a] = other;
  sheets[b] = s;
  return { ...p, sheets };
}

/** Sort one section's sheets by name (natural order: "Data 2" < "Data 10").
 *  Other sections keep their positions. */
export function sortSection(p: Project, kind: SheetKind): Project {
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const sorted = p.sheets.filter((s) => s.kind === kind)
    .sort((a, b) => coll.compare(a.name, b.name));
  let i = 0;
  const sheets = p.sheets.map((s) => (s.kind === kind ? sorted[i++] : s));
  return sheets.every((s, j) => s === p.sheets[j]) ? p : { ...p, sheets };
}

function cloneJson<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v)) as T;
}

/** Duplicate one sheet. A copied data table is unlinked (no results or
 *  graphs); a copied results sheet or graph stays bound to the same data. */
export function duplicateSheet(p: Project, id: string, ids: IdFactory): Project {
  const s = findSheet(p, id);
  if (!s) return p;
  const copy = cloneJson(s) as Sheet;
  copy.id = ids();
  copy.name = uniqueName(p, `${s.name} copy`);
  copy.frozen = false;
  if (copy.kind === "graph") delete copy.snapshot;
  if (copy.kind === "results") delete copy.cached;
  return addSheets(p, [copy], lastFamilyMemberId(p, s));
}

function lastFamilyMemberId(p: Project, s: Sheet): string {
  if (s.kind !== "data") return s.id;
  const ids = familyIds(p, s.id);
  return ids[ids.length - 1];
}

/** Duplicate a family: the data table and every results sheet and graph
 *  linked to it. Child names that contain the table's name get the new
 *  name substituted ("Fit of October" -> "Fit of November"); others get
 *  the new name as a prefix. `withData: false` keeps the table's shape
 *  and titles but no values. */
export function duplicateFamily(p: Project, id: string,
  opts: { name: string; withData: boolean }, ids: IdFactory): Project {
  const rootId = familyRootId(p, id);
  const root = findSheet(p, rootId) as DataSheet | undefined;
  if (!root || root.kind !== "data") return p;
  const newName = uniqueName(p, opts.name.trim() || `${root.name} copy`);
  const rename = (n: string) => (root.name && n.includes(root.name)
    ? n.split(root.name).join(newName) : `${newName}: ${n}`);

  const dataCopy: DataSheet = {
    ...cloneJson(root), id: ids(), name: newName, frozen: false,
  };
  if (!opts.withData) dataCopy.table = clearValues(dataCopy.table);
  const idMap = new Map<string, string>([[root.id, dataCopy.id]]);
  const children = familyChildren(p, root.id);
  for (const c of children) idMap.set(c.id, ids());
  const copies: Sheet[] = children.map((c) => {
    const k = cloneJson(c);
    k.id = idMap.get(c.id)!;
    k.parentId = dataCopy.id;
    k.name = rename(c.name);
    k.frozen = false;
    if (k.kind === "results") delete k.cached;
    if (k.kind === "graph") {
      delete k.snapshot;
      k.resultsId = k.resultsId ? idMap.get(k.resultsId) ?? null : null;
    }
    return k;
  });
  // Resolve name clashes among the new children too.
  let next = addSheets(p, [dataCopy], lastFamilyMemberId(p, root));
  let after = dataCopy.id;
  for (const c of copies) {
    c.name = uniqueName(next, c.name);
    next = addSheets(next, [c], after);
    after = c.id;
  }
  return next;
}

/** All ids referenced by a sheet must exist; drops dangling links. Used
 *  after loading files. */
export function repairLinks(p: Project): Project {
  const ids = new Set(p.sheets.map((s) => s.id));
  const dataIds = new Set(p.sheets.filter((s) => s.kind === "data").map((s) => s.id));
  const resultIds = new Set(p.sheets.filter((s) => s.kind === "results").map((s) => s.id));
  const graphIds = new Set(p.sheets.filter((s) => s.kind === "graph").map((s) => s.id));
  const sheets = p.sheets
    .filter((s) => (s.kind !== "results" && s.kind !== "graph") || dataIds.has(s.parentId))
    .map((s): Sheet => {
      if (s.kind === "graph" && s.resultsId && !resultIds.has(s.resultsId)) {
        return { ...s, resultsId: null };
      }
      if (s.kind === "layout") return forgetGraphs(s, (g) => graphIds.has(g));
      if (s.kind === "info" && s.parentId && !ids.has(s.parentId)) return { ...s, parentId: null };
      return s;
    });
  return { ...p, sheets };
}
