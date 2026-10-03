// Derived tables: the data-sheet half of a "chain of analyses".
//
// A table-producing analysis (Transform, Normalize, Remove baseline, ...)
// is an ordinary results sheet on its source data sheet. Its output is a
// second data sheet flagged `derived: {sourceId, resultsId}`. The shell
// keeps that table in sync with the source and the options (debounced,
// outside undo history: see app/useDerivedSync.ts), so analyses and
// graphs of the derived table re-run in turn: Transform -> Normalize ->
// Fit is three families linked head to tail.
//
// A derived table is read-only (edit the source instead) until the user
// unlinks it, which turns it into an ordinary table holding the values
// it had. Deleting the producing results sheet (or the source family)
// unlinks it too, so no work is ever lost silently.
//
// Plain data + pure functions, like the rest of this folder.
import type {
  DataSheet, DataTableModel, DerivedLink, Project, ResultsSheet, Sheet,
} from "./types.ts";

export function isDerived(s: Sheet | undefined | null): s is DataSheet & { derived: DerivedLink } {
  return !!s && s.kind === "data" && !!s.derived;
}

/** Derived data sheets fed by the results sheet `resultsId`. */
export function derivedOutputs(p: Project, resultsId: string): DataSheet[] {
  return p.sheets.filter((s): s is DataSheet =>
    s.kind === "data" && s.derived?.resultsId === resultsId);
}

/** Derived data sheets computed from the data sheet `sourceId`. */
export function derivedFrom(p: Project, sourceId: string): DataSheet[] {
  return p.sheets.filter((s): s is DataSheet =>
    s.kind === "data" && s.derived?.sourceId === sourceId);
}

/** The results sheet producing a derived table, if it still exists. */
export function producerOf(p: Project, dataId: string): ResultsSheet | undefined {
  const d = p.sheets.find((s) => s.id === dataId);
  if (!isDerived(d)) return undefined;
  const r = p.sheets.find((s) => s.id === d.derived.resultsId);
  return r?.kind === "results" ? r : undefined;
}

/** The chain above a data sheet, from the original table down to it:
 *  [{data, producer}] where producer made `data` (null for the root). */
export function chainOf(p: Project, dataId: string):
  { data: DataSheet; producer: ResultsSheet | null }[] {
  const out: { data: DataSheet; producer: ResultsSheet | null }[] = [];
  const seen = new Set<string>();
  let cur = p.sheets.find((s) => s.id === dataId);
  while (cur && cur.kind === "data" && !seen.has(cur.id)) {
    seen.add(cur.id);
    const producer = producerOf(p, cur.id) ?? null;
    out.unshift({ data: cur, producer });
    if (!cur.derived) break;
    const src = cur.derived.sourceId;
    cur = p.sheets.find((s) => s.id === src);
  }
  return out;
}

/** How many derived links sit above a data sheet (0 = original data). */
export function chainDepth(p: Project, dataId: string): number {
  return chainOf(p, dataId).length - 1;
}

/** Order producers so every one runs after the producers of its source
 *  (Transform before the Normalize of the transformed table). */
export function producerOrder(p: Project, producers: ResultsSheet[]): ResultsSheet[] {
  const depth = new Map(producers.map((r) => [r.id, chainDepth(p, r.parentId)]));
  return producers
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (depth.get(a.r.id)! - depth.get(b.r.id)!) || a.i - b.i)
    .map((x) => x.r);
}

export function makeDerivedSheet(id: string, name: string, table: DataTableModel,
  link: DerivedLink): DataSheet {
  return { id, kind: "data", name, table, derived: { ...link } };
}

const sameTable = (a: DataTableModel, b: DataTableModel) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/** Store a recomputed table in a derived sheet. Unchanged content (or a
 *  frozen / unlinked sheet) leaves the project object as it was, so a
 *  sync pass that finds nothing new causes no re-render. */
export function writeDerivedTable(p: Project, dataId: string,
  table: DataTableModel): Project {
  let changed = false;
  const sheets = p.sheets.map((s) => {
    if (s.id !== dataId || s.kind !== "data" || !s.derived || s.frozen) return s;
    if (sameTable(s.table, table)) return s;
    changed = true;
    return { ...s, table };
  });
  return changed ? { ...p, sheets } : p;
}

/** Turn a derived table into an ordinary, editable one. */
export function unlinkDerived(p: Project, dataId: string): Project {
  let changed = false;
  const sheets = p.sheets.map((s) => {
    if (s.id !== dataId || s.kind !== "data" || !s.derived) return s;
    changed = true;
    const copy = { ...s };
    delete copy.derived;
    return copy;
  });
  return changed ? { ...p, sheets } : p;
}

/** Point an existing derived table at another producer (or link an
 *  ordinary table to one). Refuses links that would make a cycle. */
export function linkDerived(p: Project, dataId: string, link: DerivedLink): Project {
  const res = p.sheets.find((s) => s.id === link.resultsId);
  if (!res || res.kind !== "results" || res.parentId !== link.sourceId) return p;
  if (chainOf(p, link.sourceId).some((c) => c.data.id === dataId)) return p;
  let changed = false;
  const sheets = p.sheets.map((s) => {
    if (s.id !== dataId || s.kind !== "data") return s;
    changed = true;
    return { ...s, derived: { ...link } };
  });
  return changed ? { ...p, sheets } : p;
}

/** Drop links whose producer or source is gone (or no longer matches),
 *  keeping the table's values. Used after deletes and file loads. */
export function pruneDerivedLinks(p: Project): Project {
  const byId = new Map(p.sheets.map((s) => [s.id, s]));
  let changed = false;
  const sheets = p.sheets.map((s) => {
    if (s.kind !== "data" || !s.derived) return s;
    const res = byId.get(s.derived.resultsId);
    const src = byId.get(s.derived.sourceId);
    const ok = res?.kind === "results" && src?.kind === "data"
      && res.parentId === src.id && src.id !== s.id;
    if (ok) return s;
    changed = true;
    const copy = { ...s };
    delete copy.derived;
    return copy;
  });
  return changed ? { ...p, sheets } : p;
}

/** Sanitize a `derived` value read from a file. */
export function parseDerivedLink(v: unknown): DerivedLink | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  return typeof o.sourceId === "string" && o.sourceId
    && typeof o.resultsId === "string" && o.resultsId
    ? { sourceId: o.sourceId, resultsId: o.resultsId } : undefined;
}
