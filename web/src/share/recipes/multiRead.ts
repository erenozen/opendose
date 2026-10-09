// Multi-read plate runs: several plate grids in one file, each below a
// line naming the read. Absorbance at two wavelengths, fluorescence and
// absorbance of one plate, or a kinetic run read every few minutes, as
// Gen5 (BioTek), SoftMax Pro (Molecular Devices, plate format, blocks
// stacked down the file), Tecan i-control / Magellan and SpectraMax text
// exports lay them out:
//
//   Read 1:450                      <- the read's label line
//   (blank)  1     2     3   …  12  <- optional column header
//   A        0.051 0.049 …
//   …
//   H        …
//   (blank)
//   Read 2:620
//   …
//
// Kinetic exports name each read by its time ("Time 0:05:00", "Cycle 2
// (300 s)"). Each grid is found with the plate rule shared with the
// engine (findPlateGrid in plate.ts, a port of plate_io.locate_plate),
// applied again below the previous grid, so a run reads exactly as its
// plates would one at a time. Plates laid side by side (SoftMax Pro's
// wavelengths in one row band) are not split; save them stacked.
//
// The recipe gives a grouped table (one row per read, wells as data sets)
// or an XY table (X = the time or wavelength in each read's label); a
// plate map (the plate assay's editor) groups wells into conditions with
// the wells as replicates.
import { shortConc, type PlateMap, type WellInfo } from "../../sheets/assays/plate/model.ts";
import { findPlateGrid, ROW_LABELS, type PlateGrid } from "./plate.ts";
import type { Recipe, RecipeParams, Staged } from "./presets.ts";
import { makeStaging, type Staging } from "./staging.ts";

export interface PlateRead {
  /** The read's label line ("Read 1:450"), or "Read n" when none. */
  label: string;
  grid: PlateGrid;
  /** Sheet row of well A1. */
  top: number;
}

/** First non-empty line above a grid (its column header skipped) that
 *  holds text, within four lines. */
function labelAbove(m: string[][], g: PlateGrid): string {
  const headerRow = g.labelledColumns ? g.top - 1 : g.top;
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 4); r--) {
    const cells = (m[r] ?? []).map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    if (cells.every((c) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(c))) return "";
    return cells.join(" ");
  }
  return "";
}

/** Every plate grid in reading order, with its label. */
export function findReads(m: string[][]): PlateRead[] {
  const out: PlateRead[] = [];
  const collect = (part: string[][], offset: number, depth: number) => {
    if (depth > 128 || !part.length) return;
    const g = findPlateGrid(part);
    if (!g) return;
    // the largest bare grid is found first: read the ones above it before
    if (g.left < 0) collect(part.slice(0, Math.max(0, g.top - (g.labelledColumns ? 1 : 0))), offset, depth + 1);
    out.push({ label: labelAbove(part, g), grid: g, top: offset + g.top });
    const next = g.top + g.blockRows;
    collect(part.slice(next), offset + next, depth + 1);
  };
  collect(m, 0, 0);
  // unique labels: "Read 3" for an unlabelled grid, "(2)" for a repeat
  const seen = new Map<string, number>();
  return out.map((r, i) => {
    const base = r.label || `Read ${i + 1}`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    return { ...r, label: k === 1 ? base : `${base} (${k})` };
  });
}

export type ReadKind = "time" | "wavelength" | "number";

/** The number a read's label stands for: a time (in minutes: h:mm:ss,
 *  h:mm, "300 s", "5 min", "2 h"), a wavelength ("450 nm", "Read 1:450"),
 *  or the last number in it. */
export function readValue(label: string): { x: number; kind: ReadKind } | null {
  const hms = /(\d+):(\d{2})(?::(\d{2}(?:\.\d+)?))?(?!\d)/.exec(label);
  if (hms && !/read\s*\d+\s*:\s*\d+$/i.test(label.trim())) {
    return { x: Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3] ?? 0) / 60, kind: "time" };
  }
  const unit = /(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|min|mins|minutes?|h|hr|hrs|hours?)\b/i.exec(label);
  if (unit) {
    const v = Number(unit[1]);
    const u = unit[2].toLowerCase();
    return { x: u.startsWith("s") ? v / 60 : u.startsWith("h") ? v * 60 : v, kind: "time" };
  }
  const nm = /(\d{3,4}(?:\.\d+)?)\s*nm\b/i.exec(label) ?? /read\s*\d+\s*:\s*(\d{3,4})\b/i.exec(label);
  if (nm) return { x: Number(nm[1]), kind: "wavelength" };
  const nums = label.match(/[+-]?\d+(?:\.\d+)?/g);
  return nums ? { x: Number(nums[nums.length - 1]), kind: "number" } : null;
}

const KIND_TITLE: Record<ReadKind, string> = {
  time: "Time (min)", wavelength: "Wavelength (nm)", number: "Read",
};

/** What one well holds, as a data-set name ("" for an empty well). */
export function wellGroup(w: WellInfo | undefined): string {
  if (!w) return "";
  switch (w.role) {
    case "blank": return "Blank";
    case "negative": return w.compound ? `Vehicle (${w.compound})` : "Vehicle";
    case "positive": return w.compound ? `Positive control (${w.compound})` : "Positive control";
    case "sample": return `${w.compound ?? "Sample"}${w.conc !== undefined ? ` ${shortConc(w.conc)}` : ""}`;
    default: return "";
  }
}

/** Records grouped by a plate map: each well's group column becomes what
 *  the map says the well holds; wells the map leaves empty are dropped.
 *  An empty map changes nothing. */
export function applyPlateMap(st: Staging, wellCol: number, map: PlateMap | null | undefined): Staging {
  if (!map || !Object.keys(map).length || wellCol < 0) return st;
  const g = st.columns.findIndex((c) => c.role === "group");
  if (g < 0) return st;
  const rows = st.rows.flatMap((r) => {
    const label = wellGroup(map[(r[wellCol] ?? "").toUpperCase()]);
    if (!label) return [];
    const out = [...r];
    out[g] = label;
    return [out];
  });
  return { columns: st.columns.map((c, i) => (i === g ? { ...c, numeric: false } : c)), rows };
}

const numText = (v: number) => String(Number(v.toPrecision(12)));

export const multiReadRecipe: Recipe = {
  id: "multiread",
  label: "Multi-read plate run (wavelengths or kinetic reads)",
  description: "Several plate grids in one file, each below a line naming the read (“Read 1:450”, "
    + "“Time 0:05:00”). One row per read and wells as data sets, or X = the read time.",
  layouts: "Gen5, SoftMax Pro (plate format, stacked), Tecan i-control and SpectraMax text exports "
    + "with several reads; each grid read by the same plate rule as single plates.",
  params: [
    { key: "reads", label: "Reads become", kind: "select", value: "auto",
      choices: [["auto", "Rows, or X when every read names a time"], ["rows", "Rows (grouped table)"],
        ["x", "X values (XY table)"]] },
  ],
  detect: (m) => (findReads(m).length >= 2 ? 0.97 : 0),
  stage: (m, params?: RecipeParams): Staged => {
    const reads = findReads(m);
    if (reads.length < 1) throw new Error("No plate block (rows A, B, C … with numbers beside them) was found.");
    const values = reads.map((r) => readValue(r.label));
    const kinds = new Set(values.map((v) => v?.kind ?? null));
    const sameKind = kinds.size === 1 && !kinds.has(null) ? [...kinds][0] as ReadKind : null;
    const want = params?.reads ?? "auto";
    const asX = want === "x" || (want === "auto" && sameKind === "time" && reads.length > 1);
    const xs = values.map((v, i) => (sameKind && v ? v.x : i + 1));
    const xTitle = sameKind ? KIND_TITLE[sameKind] : "Read number";
    const rows: string[][] = [];
    reads.forEach((r, i) => {
      const g = r.grid;
      for (let row = 0; row < g.rows; row++) {
        for (let c = 0; c < g.cols; c++) {
          const v = g.values[row][c];
          const well = `${ROW_LABELS[row]}${c + 1}`;
          rows.push([r.label, numText(xs[i]), well, well, ROW_LABELS[row], String(c + 1),
            v === null ? "" : String(v)]);
        }
      }
    });
    const st = makeStaging(["Read", xTitle, "Well", "Group", "Row", "Column", "Value"], rows,
      asX ? ["meta", "time", "subject", "group", "meta", "meta", "value"]
        : ["time", "meta", "subject", "group", "meta", "meta", "value"]);
    const fmt = reads[0].grid.format;
    const warnings = [...new Set(reads.flatMap((r) => r.grid.warnings))];
    const formats = new Set(reads.map((r) => r.grid.format));
    return {
      recipe: "multiread", staging: st, pattern: null, aggregate: [],
      output: asX ? "xy" : "grouped",
      name: "Plate reads",
      notes: [
        `${reads.length} read${reads.length === 1 ? "" : "s"} of a ${fmt ?? `${reads[0].grid.rows} x ${reads[0].grid.cols}`}`
        + `${fmt ? "-well" : ""} plate: ${reads.slice(0, 6).map((r) => r.label).join(", ")}${reads.length > 6 ? " …" : ""}.`,
        ...(formats.size > 1 ? ["The reads are not all the same plate format."] : []),
        ...warnings,
      ],
      ...(fmt === 96 || fmt === 384 ? { wells: { column: 2, format: fmt } } : {}),
    };
  },
};
