// Import provenance (P-76): where a table's values came from. Each data
// sheet that an import built or refilled keeps one record: the source
// file's name, size and SHA-256 (or the pasted text's), how it was read
// (the plain Import dialog's settings, or a recipe with its settings and
// plate map), whether re-running those settings on the same file gives
// the table back exactly, and a copy of the values as imported, so the
// History panel can say which cells were edited by hand since. Imports
// before the last one are kept as a short list. Apply to new data re-runs
// a recipe it finds here (share/recipes/reimport.ts).
//
// Plain data + pure functions, like the rest of this folder. The hash is
// computed by the caller (lib/sha256.ts, Web Crypto).
import type { DataSheet, DataTableModel, Project } from "./types.ts";

/** How the values got in: the Import dialog, a recipe, or Apply to new
 *  data putting a file into the table in its own layout. */
export type ImportHow = "import" | "recipe" | "apply";

/** A new table, the table's values replaced, or rows added. */
export type ImportMode = "new" | "replace" | "append" | "insert";

export interface ImportSource {
  /** The file name as chosen, or "pasted text". */
  name: string;
  /** SHA-256 of the file's bytes (of the text's UTF-8 bytes when pasted). */
  sha256: string;
  bytes: number;
  /** The worksheet read, for a workbook. */
  worksheet?: string;
  pasted?: boolean;
}

/** The values as imported: X, row titles and every Y cell (y[d][r][s]). */
export interface CellSnapshot {
  x: string[];
  rowTitles: string[];
  y: string[][][];
}

/** An import before the current one, with the cells edited by hand
 *  between it and the next (null: too large a table to count). */
export interface EarlierImport {
  at: string;
  how: ImportHow;
  mode: ImportMode;
  basis: string;
  recipeName?: string;
  sources: ImportSource[];
  editedCells: number | null;
}

export interface ImportRecord {
  /** ISO date-time of the import. */
  at: string;
  how: ImportHow;
  mode: ImportMode;
  sources: ImportSource[];
  /** "Plain import", or the recipe's name ("Plate reader grid …"). */
  basis: string;
  /** The saved recipe applied, if one was. */
  recipeName?: string;
  /** The settings: share/recipes/saved.ts SavedSpec (normalizeSpec reads it). */
  spec?: Record<string, unknown>;
  /** How the file was read: text encoding, rows hidden in a workbook. */
  read?: { encoding?: string; keepFiltered?: boolean; skipHidden?: boolean };
  /** Re-running the settings on the same file gave this table exactly
   *  (checked when the record was made); otherwise `why` says why not. */
  replayable: boolean;
  why?: string;
  /** Fingerprint of the values as imported (cellsFingerprint). */
  cells: string;
  /** The values as imported, kept up to SNAPSHOT_CELLS cells. */
  snapshot?: CellSnapshot;
  earlier?: EarlierImport[];
}

/** Tables larger than this keep only the fingerprint: History then says
 *  whether any value changed, not how many. */
export const SNAPSHOT_CELLS = 50000;
const MAX_EARLIER = 50;

export function cellSnapshot(t: DataTableModel): CellSnapshot {
  return {
    x: [...t.x],
    rowTitles: [...t.rowTitles],
    y: t.datasets.map((d) => d.rows.map((r) => [...r])),
  };
}

const cellCount = (t: DataTableModel) => t.x.length * (2 + t.datasets.reduce((n, d) =>
  n + (d.rows[0]?.length ?? 1), 0));

/** A fingerprint of the cells (two 32-bit FNV-1a hashes over their UTF-16
 *  code units, cells and sections separated): spots any change, fast
 *  enough for a table of half a million rows. Not a cryptographic hash. */
export function cellsFingerprint(t: DataTableModel): string {
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  const feed = (s: string, sep: number) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000193);
    }
    a = Math.imul(a ^ sep, 0x01000193);
    b = Math.imul(b ^ sep, 0x01000193);
  };
  for (const v of t.x) feed(v, 0x1f);
  feed("", 0x1e);
  for (const v of t.rowTitles) feed(v, 0x1f);
  for (const d of t.datasets) {
    feed("", 0x1e);
    for (const r of d.rows) {
      for (const v of r) feed(v, 0x1f);
      feed("", 0x1d);
    }
  }
  const hex = (h: number) => (h >>> 0).toString(16).padStart(8, "0");
  return `fnv1a32x2:${hex(a)}${hex(b)}`;
}

/** What the caller knows about an import; the cells come from the table. */
export type ImportFacts = Omit<ImportRecord, "cells" | "snapshot" | "earlier">;

/** The record of an import that left the table `t`. */
export function makeImportRecord(t: DataTableModel, facts: ImportFacts,
  earlier?: EarlierImport[]): ImportRecord {
  return {
    ...facts,
    cells: cellsFingerprint(t),
    ...(cellCount(t) <= SNAPSHOT_CELLS ? { snapshot: cellSnapshot(t) } : {}),
    ...(earlier?.length ? { earlier: earlier.slice(-MAX_EARLIER) } : {}),
  };
}

export interface EditedCell { where: string; before: string; after: string }

export interface HandEdits {
  /** Any value differs from the import. */
  changed: boolean;
  /** How many cells differ (null: the table was too large to keep a copy). */
  count: number | null;
  /** The first few, for the History panel. */
  cells: EditedCell[];
}

/** Cells whose value differs from the import: X, row titles and Y values.
 *  Calculated columns are rewritten by their formula and do not count. */
export function handEdits(rec: ImportRecord, t: DataTableModel, list = 20): HandEdits {
  const snap = rec.snapshot;
  if (!snap) {
    const changed = cellsFingerprint(t) !== rec.cells;
    return { changed, count: changed ? null : 0, cells: [] };
  }
  const cells: EditedCell[] = [];
  let count = 0;
  const note = (where: string, before: string, after: string) => {
    if (before === after) return;
    count++;
    if (cells.length < list) cells.push({ where, before, after });
  };
  const rows = Math.max(snap.x.length, t.x.length);
  const nDs = Math.max(snap.y.length, t.datasets.length);
  for (let r = 0; r < rows; r++) {
    note(`X, row ${r + 1}`, snap.x[r] ?? "", t.x[r] ?? "");
    note(`row title, row ${r + 1}`, snap.rowTitles[r] ?? "", t.rowTitles[r] ?? "");
    for (let d = 0; d < nDs; d++) {
      const ds = t.datasets[d];
      if (ds?.formula) continue;
      const subs = Math.max(snap.y[d]?.[0]?.length ?? 0, ds?.rows[0]?.length ?? 0);
      for (let s = 0; s < subs; s++) {
        const name = ds?.name || `data set ${d + 1}`;
        note(`${name}, row ${r + 1}${subs > 1 ? `, value ${s + 1}` : ""}`,
          snap.y[d]?.[r]?.[s] ?? "", ds?.rows[r]?.[s] ?? "");
      }
    }
  }
  return { changed: count > 0, count, cells };
}

/** "1 cell edited by hand", "no cell edited by hand", "values edited by
 *  hand (the table is too large to count them)". */
export function handEditsText(e: HandEdits): string {
  if (e.count === null) return e.changed ? "values edited by hand (too many cells to count them)"
    : "no cell edited by hand";
  if (!e.count) return "no cell edited by hand";
  return `${e.count} cell${e.count === 1 ? "" : "s"} edited by hand`;
}

/** The earlier-imports entry for `rec`, with the edits made since. */
export function summarize(rec: ImportRecord, t: DataTableModel): EarlierImport {
  return {
    at: rec.at, how: rec.how, mode: rec.mode, basis: rec.basis,
    ...(rec.recipeName ? { recipeName: rec.recipeName } : {}),
    sources: rec.sources, editedCells: handEdits(rec, t, 0).count,
  };
}

/** Edit a data table by an import and record it on the sheet, in one
 *  step. A replace keeps the earlier record in `earlier`, as does an
 *  append or insert (which cannot rebuild the table alone, so it is not
 *  replayable). Frozen and derived tables refuse, as updateTable does. */
export function importIntoSheet(p: Project, dataId: string,
  fn: (t: DataTableModel) => DataTableModel, facts: ImportFacts): Project {
  let changed = false;
  const sheets = p.sheets.map((s) => {
    if (s.id !== dataId || s.kind !== "data" || s.frozen || s.derived) return s;
    const table = fn(s.table);
    const prev = s.imported;
    const earlier = prev ? [...(prev.earlier ?? []), summarize(prev, s.table)] : undefined;
    const partial = facts.mode === "append" || facts.mode === "insert";
    const rec = makeImportRecord(table, partial
      ? { ...facts, replayable: false, why: "rows were added to a table that was already there" }
      : facts, earlier);
    changed = true;
    return { ...s, table, imported: rec };
  });
  return changed ? { ...p, sheets } : p;
}

/** The sheet with a record of the import that made its table. */
export function withImportRecord(s: DataSheet, facts: ImportFacts): DataSheet {
  return { ...s, imported: makeImportRecord(s.table, facts) };
}

// ------------------------------------------------------------ files

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
const HOWS: ImportHow[] = ["import", "recipe", "apply"];
const MODES: ImportMode[] = ["new", "replace", "append", "insert"];
const strings = (v: unknown): string[] | null =>
  (Array.isArray(v) && v.every((x) => typeof x === "string") ? v as string[] : null);

function parseSources(v: unknown): ImportSource[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 1000).flatMap((raw) => {
    const o = obj(raw);
    const sha256 = str(o.sha256, 64).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) return [];
    return [{
      name: str(o.name, 260) || "unnamed", sha256,
      bytes: typeof o.bytes === "number" && o.bytes >= 0 ? Math.round(o.bytes) : 0,
      ...(str(o.worksheet, 120) ? { worksheet: str(o.worksheet, 120) } : {}),
      ...(o.pasted === true ? { pasted: true } : {}),
    }];
  });
}

function parseSnapshot(v: unknown): CellSnapshot | undefined {
  const o = obj(v);
  const x = strings(o.x);
  const rowTitles = strings(o.rowTitles);
  if (!x || !rowTitles || !Array.isArray(o.y)) return undefined;
  const y: string[][][] = [];
  for (const d of o.y) {
    if (!Array.isArray(d)) return undefined;
    const rows: string[][] = [];
    for (const r of d) {
      const row = strings(r);
      if (!row) return undefined;
      rows.push(row);
    }
    y.push(rows);
  }
  return { x, rowTitles, y };
}

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  (typeof v === "string" && (list as readonly string[]).includes(v) ? v as T : null);

/** A record from a file or a link (null when it is not one). Files saved
 *  before records existed have none, and load exactly as they did. */
export function parseImportRecord(raw: unknown): ImportRecord | null {
  const o = obj(raw);
  const how = oneOf(o.how, HOWS);
  const mode = oneOf(o.mode, MODES);
  const sources = parseSources(o.sources);
  const cells = str(o.cells, 80);
  if (!how || !mode || !sources.length || !cells) return null;
  const read = obj(o.read);
  const snapshot = parseSnapshot(o.snapshot);
  const earlier = Array.isArray(o.earlier) ? o.earlier.slice(-MAX_EARLIER).flatMap((e) => {
    const q = obj(e);
    const eh = oneOf(q.how, HOWS);
    const em = oneOf(q.mode, MODES);
    const es = parseSources(q.sources);
    if (!eh || !em || !es.length) return [];
    return [{
      at: str(q.at, 40), how: eh, mode: em, basis: str(q.basis, 200),
      ...(str(q.recipeName, 80) ? { recipeName: str(q.recipeName, 80) } : {}),
      sources: es,
      editedCells: typeof q.editedCells === "number" && q.editedCells >= 0 ? Math.round(q.editedCells) : null,
    }];
  }) : [];
  const spec = o.spec && typeof o.spec === "object" && !Array.isArray(o.spec)
    ? JSON.parse(JSON.stringify(o.spec)) as Record<string, unknown> : undefined;
  return {
    at: str(o.at, 40), how, mode, sources, basis: str(o.basis, 200),
    ...(str(o.recipeName, 80) ? { recipeName: str(o.recipeName, 80) } : {}),
    ...(spec ? { spec } : {}),
    ...(Object.keys(read).length ? { read: {
      ...(str(read.encoding, 40) ? { encoding: str(read.encoding, 40) } : {}),
      ...(typeof read.keepFiltered === "boolean" ? { keepFiltered: read.keepFiltered } : {}),
      ...(typeof read.skipHidden === "boolean" ? { skipHidden: read.skipHidden } : {}),
    } } : {}),
    replayable: o.replayable === true,
    ...(str(o.why, 300) ? { why: str(o.why, 300) } : {}),
    cells,
    ...(snapshot ? { snapshot } : {}),
    ...(earlier.length ? { earlier } : {}),
  };
}
