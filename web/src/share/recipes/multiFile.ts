// Many per-image (or per-well, per-sample) tables at once: the CSVs that
// Fiji / ImageJ ("Analyze Particles" → Results, saved once per image),
// CellProfiler (ExportToSpreadsheet per image group) or QuPath (one
// measurement file per image) leave in a folder. They are stacked into
// one long table with the file name as its first column, the condition,
// replicate and image are read from the names with a template such as
// "{condition}_rep{replicate}_img{image}.csv" (or by splitting the names
// at "_"), and the records then go through the usual recipe steps:
// aggregate cells per image, pivot to a column or grouped table with the
// replicate map set so SuperPlots and statistics on replicate means work.
// Pure (fflate's unzip is synchronous and runs in node).
import { unzipSync } from "fflate";
import { cellNumber } from "../tidy.ts";
import { TABLE_FILE } from "./dropKind.ts";
import {
  compileTemplate, guessDelimiter, guessParts, matchTemplate, templateFit, templateParts,
  type NamePattern,
} from "./pattern.ts";
import type { Recipe, Staged } from "./presets.ts";
import { parseText as parseSource } from "./source.ts";
import { makeStaging, type Role, type Staging } from "./staging.ts";

/** One file's text with its name (a path inside a zip keeps its folders). */
export interface NamedText { name: string; text: string }

export { TABLE_FILE };

/** The template offered first: the naming most image pipelines suggest. */
export const DEFAULT_TEMPLATE = "{condition}_rep{replicate}_img{image}.csv";

/** Column holding the file name in the stacked table. */
export const FILE_COLUMN = "File";
export const FOLDER_COLUMN = "Folder";

/** Text of a file's bytes: UTF-8 (a byte-order mark dropped), UTF-16 when
 *  the file starts with its byte-order mark. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

/** Whether a zip entry is worth reading: a table file, not a folder or
 *  the resource forks macOS adds (__MACOSX/, ._name). */
export function isTableEntry(path: string): boolean {
  const base = baseName(path);
  return TABLE_FILE.test(base) && !path.startsWith("__MACOSX/") && !base.startsWith("._")
    && !path.endsWith("/");
}

/** The table files inside a zip, in natural name order. */
export function unzipTables(bytes: Uint8Array): NamedText[] {
  const entries = unzipSync(bytes, { filter: (f) => isTableEntry(f.name) });
  return sortNatural(Object.entries(entries).map(([name, data]) => ({ name, text: decodeText(data) })));
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function folderOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.slice(0, -1).join("/");
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Natural order: img2 before img10. */
export function sortNatural<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}

export interface StackResult {
  /** Header row then one row per record, the file name first. */
  matrix: string[][];
  files: number;
  /** Files that held no rows below their header. */
  empty: string[];
  /** Files whose columns differ from the first file's. */
  differing: string[];
}

/** A file's header row: its first non-empty row, unless every cell of it
 *  is a number (a file without titles: "Column 1", "Column 2" …). */
function splitHeader(m: string[][]): { header: string[]; rows: string[][] } {
  const start = m.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (start < 0) return { header: [], rows: [] };
  const first = m[start];
  const numeric = first.every((c) => c.trim() === "" || cellNumber(c) !== null);
  const rows = m.slice(numeric ? start : start + 1).filter((r) => r.some((c) => c.trim() !== ""));
  if (numeric) return { header: first.map((_, i) => `Column ${i + 1}`), rows };
  // Fiji's Results table has an untitled first column (the row number).
  return { header: first.map((c, i) => c.trim() || (i === 0 ? "#" : `Column ${i + 1}`)), rows };
}

/** Stack the files into one table: their columns matched by title (in
 *  order of first appearance), the file name in a "File" column first and
 *  the folder in a "Folder" column when any file sits in one. */
export function stackTables(files: NamedText[]): StackResult {
  const sorted = sortNatural(files);
  const titles: string[] = [];
  const parsed = sorted.map((f) => {
    const { header, rows } = splitHeader(parseSource(f.text));
    // repeated titles within a file get " 2", " 3"
    const seen = new Map<string, number>();
    const names = header.map((h) => {
      const k = (seen.get(h) ?? 0) + 1;
      seen.set(h, k);
      return k === 1 ? h : `${h} ${k}`;
    });
    for (const n of names) if (!titles.includes(n)) titles.push(n);
    return { file: f, names, rows };
  });
  const withFolder = sorted.some((f) => folderOf(f.name) !== "");
  const head = [FILE_COLUMN, ...(withFolder ? [FOLDER_COLUMN] : []), ...titles];
  const out: string[][] = [head];
  const empty: string[] = [];
  const differing: string[] = [];
  const firstNames = parsed[0]?.names.join("\u0001") ?? "";
  for (const p of parsed) {
    const name = baseName(p.file.name);
    if (!p.rows.length) empty.push(name);
    if (p.names.join("\u0001") !== firstNames) differing.push(name);
    const at = titles.map((t) => p.names.indexOf(t));
    for (const r of p.rows) {
      out.push([name, ...(withFolder ? [folderOf(p.file.name)] : []),
        ...at.map((i) => (i >= 0 ? (r[i] ?? "").trim() : ""))]);
    }
  }
  return { matrix: out, files: sorted.length, empty, differing };
}

/** Distinct values in order (the file names of a stacked table). */
function distinctNames(m: string[][], col: number): string[] {
  const seen = new Set<string>();
  for (const r of m.slice(1)) if (r[col]) seen.add(r[col]);
  return [...seen];
}

/** The name pattern for the file names: the template when it fits every
 *  name, else the names split at their usual separator. */
export function filePattern(names: string[], template = DEFAULT_TEMPLATE): NamePattern {
  if (names.length && templateFit(template, names) === 1) {
    return { column: 0, delimiter: "_", stripExtension: true, template, parts: templateParts(template) };
  }
  const delimiter = guessDelimiter(names);
  return { column: 0, delimiter, stripExtension: true, parts: guessParts(names, delimiter, true) };
}

/** First five names with the parts a pattern reads from them, for the
 *  live preview (null parts: the name does not fit the template). */
export function previewNames(names: string[], template: string, n = 5): {
  name: string; parts: string[] | null;
}[] {
  const c = compileTemplate(template);
  return names.slice(0, n).map((name) => ({ name, parts: c ? matchTemplate(c, name) : null }));
}

// Columns of a per-object table that are not measurements: row numbers,
// object and image counters, positions and bounding boxes.
const INDEX_RE = /^(#|index|row|label|id|objectnumber|imagenumber|object id|slice|frame|ch|channel)$/i;
const POSITION_RE = /^(x|y|z|xm|ym|bx|by|width|height|xstart|ystart|centroid.*|location_.*|.*_center_[xyz]|areashape_center_[xyz])$/i;

/** Role of a measurement file's column in the stacked table. */
function columnRole(name: string): Role {
  if (name === FILE_COLUMN) return "level";
  if (name === FOLDER_COLUMN) return "meta";
  if (INDEX_RE.test(name.trim())) return "meta";
  if (POSITION_RE.test(name.trim())) return "skip";
  return "meta";
}

export interface ImageStaging {
  staging: Staging;
  pattern: NamePattern;
  /** The file names, in order. */
  names: string[];
}

/** Stage a stacked table: File is the hierarchy level (one image per
 *  file), the first measurement column is the value, and the names are
 *  read with the template (or split at "_"). */
export function stageStacked(m: string[][], template = DEFAULT_TEMPLATE): ImageStaging {
  const headers = m[0] ?? [FILE_COLUMN];
  const roles = headers.map(columnRole);
  const st = makeStaging(headers, m.slice(1), roles);
  const v = st.columns.findIndex((c, i) => c.numeric && roles[i] === "meta" && headers[i] !== FOLDER_COLUMN
    && !INDEX_RE.test(headers[i].trim()));
  if (v >= 0) st.columns[v].role = "value";
  const names = distinctNames(m, 0);
  return { staging: st, pattern: filePattern(names, template), names };
}

export const imagesRecipe: Recipe = {
  id: "images",
  label: "Per-image tables (many files)",
  description: "Many CSVs or a zip of them, one per image (Fiji Results, CellProfiler, QuPath), "
    + "stacked with the file name as a column. Condition, replicate and image come from the names; "
    + "values are averaged per image and the replicates kept for a SuperPlot.",
  layouts: "A folder of per-image CSV / TSV files (or a zip) whose names carry the condition and "
    + "replicate, e.g. ctrl_rep1_img03.csv; the files may differ in their columns.",
  // A stacked table starts with the File column; the dialog chooses this
  // recipe for several files at once.
  detect: (m) => ((m[0]?.[0] ?? "") === FILE_COLUMN && m.length > 2 ? 0.3 : 0),
  stage: (m): Staged => {
    const s = stageStacked(m);
    const value = s.staging.columns.find((c) => c.role === "value");
    return {
      recipe: "images", staging: s.staging, pattern: s.pattern,
      aggregate: [{ level: FILE_COLUMN, fn: "mean" }],
      output: "column", replicateMap: true, name: "Image tables",
      ...(value ? { yTitle: value.name } : {}),
      notes: [`${s.staging.rows.length} rows from ${s.names.length} files`
        + `${s.pattern.template ? ` named like ${s.pattern.template}` : ""}.`],
    };
  },
};
