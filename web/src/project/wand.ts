// "Analyze and graph like…": give a data table the same analyses and
// graphs another table of the same type already has (results sheets with
// their analysis and options, graph sheets with their kind and settings,
// Format Graph included), and "make graphs consistent": copy one graph's
// look onto every other graph of the same kind.
//
// Plain data + pure functions, like the rest of this folder.
import type { IdFactory } from "./ids.ts";
import {
  addSheets, familyChildren, findSheet, makeGraphSheet, makeResultsSheet, uniqueName,
} from "./ops.ts";
import type {
  DataSheet, GraphSheet, Project, ResultsSheet, Sheet,
} from "./types.ts";

function cloneJson<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v)) as T;
}

/** Data tables a table can copy its analyses from: same table type,
 *  not itself, with at least one results or graph sheet. */
export function wandSources(p: Project, targetId: string): DataSheet[] {
  const t = findSheet(p, targetId);
  if (!t || t.kind !== "data") return [];
  return p.sheets.filter((s): s is DataSheet => s.kind === "data" && s.id !== t.id
    && s.table.type === t.table.type && familyChildren(p, s.id).length > 0);
}

/** Copy the results and graph sheets of `exampleId`'s family onto
 *  `targetId`. New sheets get fresh ids, the target's name in place of
 *  the example's (plus an optional prefix), and land after the target's
 *  family. Returns the new sheets so the caller can add what the
 *  registry knows about (output tables of chains). */
export function wandCopy(p: Project, targetId: string, exampleId: string,
  ids: IdFactory, o: { prefix?: string } = {}): { project: Project; created: Sheet[] } {
  const target = findSheet(p, targetId);
  const example = findSheet(p, exampleId);
  if (!target || target.kind !== "data" || !example || example.kind !== "data"
    || target.id === example.id || target.table.type !== example.table.type) {
    return { project: p, created: [] };
  }
  const prefix = o.prefix ?? "";
  const rename = (n: string) => {
    const base = example.name && n.includes(example.name)
      ? n.split(example.name).join(target.name) : `${n} (${target.name})`;
    return `${prefix}${base}`;
  };
  const kids = familyChildren(p, example.id);
  const idMap = new Map<string, string>();
  for (const k of kids) idMap.set(k.id, ids());
  let acc = p;
  const created: Sheet[] = [];
  for (const k of kids) {
    let s: ResultsSheet | GraphSheet;
    if (k.kind === "results") {
      s = makeResultsSheet(idMap.get(k.id)!, target.id, k.analysis,
        cloneJson(k.options), uniqueName(acc, rename(k.name)));
    } else {
      s = makeGraphSheet(idMap.get(k.id)!, target.id,
        k.resultsId ? idMap.get(k.resultsId) ?? null : null,
        k.graphType, cloneJson(k.settings), uniqueName(acc, rename(k.name)));
    }
    created.push(s);
    acc = addSheets(acc, [s]);
  }
  if (!created.length) return { project: p, created };
  const fam = [target.id, ...familyChildren(p, target.id).map((s) => s.id)];
  const after = fam[fam.length - 1];
  return { project: addSheets(p, created, after), created };
}

/** Graphs a "make consistent" from `sourceId` would restyle: the other
 *  graphs of the same kind that are not frozen. */
export function consistentTargets(p: Project, sourceId: string): GraphSheet[] {
  const src = findSheet(p, sourceId);
  if (!src || src.kind !== "graph") return [];
  return p.sheets.filter((s): s is GraphSheet => s.kind === "graph" && s.id !== src.id
    && s.graphType === src.graphType && !s.frozen);
}

/** Copy the look of each source graph (its Format Graph / Format Axes
 *  settings and colour scheme; not its titles, which describe its own
 *  data) onto every other graph of the same kind. When two sources share
 *  a kind, the first wins; sources are never restyled. */
export function makeGraphsConsistent(p: Project, sourceIds: string[]): { project: Project; changed: number } {
  const sources = new Set(sourceIds);
  const byKind = new Map<string, GraphSheet>();
  for (const id of sourceIds) {
    const s = findSheet(p, id);
    if (s?.kind === "graph" && !byKind.has(s.graphType)) byKind.set(s.graphType, s);
  }
  let changed = 0;
  const sheets = p.sheets.map((s): Sheet => {
    if (s.kind !== "graph" || s.frozen || sources.has(s.id)) return s;
    const src = byKind.get(s.graphType);
    if (!src) return s;
    const { format: _f, ...rest } = s.settings;
    void _f;
    const settings = {
      ...rest,
      scheme: src.settings.scheme,
      ...(src.settings.format !== undefined ? { format: cloneJson(src.settings.format) } : {}),
    };
    if (JSON.stringify(settings) === JSON.stringify(s.settings)) return s;
    changed++;
    return { ...s, settings };
  });
  return changed ? { project: { ...p, sheets }, changed } : { project: p, changed: 0 };
}
