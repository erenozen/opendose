// Incucyte live-cell analysis: the text file written by "Export Data"
// (Incucyte ZOOM, S3 and SX5 software; graph/export → "Export data as
// text"). Layout, as in Sartorius' user manuals and the example exports
// circulated with them:
//
//   Vessel Name: 2024-03-01 HeLa scratch          <- metadata block,
//   Metric: Phase Object Confluence (Percent)        "Key: value" lines
//   Cell Type: HeLa                                  (the key may sit in
//   Analysis: phase mask                             its own cell)
//   (blank line)
//   Date Time  Elapsed  B2   B3   B4   C2 …        <- tab-separated table
//   01/03/2024 10:00:00  0  5.1  4.8  5.3  …
//   01/03/2024 12:00:00  2  7.9  7.2  8.0  …
//
// "Elapsed" is in hours (some versions write 0d02h00m or 2:00). After it
// comes one column per well (A1 … P24), per well and image ("B2, Image 1")
// or, for data grouped by a plate-map label, one per group ("HeLa 1K"),
// often followed by a standard-error column ("HeLa 1K (Std Err Well)").
// Standard-error columns are not imported: they summarise wells or
// images, and the replicates are the wells themselves. Columns that share
// a label become replicates (subcolumns) of one data set.
//
// The recipe gives an XY table: X = elapsed hours, one data set per well
// or group label, wells as replicates; a plate map can group the wells.
import type { Recipe, Staged } from "./presets.ts";
import { makeStaging } from "./staging.ts";
import { cellNumber } from "../tidy.ts";

const WELL_RE = /^([A-P])0?([1-9]|1\d|2[0-4])$/i;
const WELL_PART_RE = /^([A-P])0?([1-9]|1\d|2[0-4])\b[\s,;:_-]*(.*)$/i;
const STDERR_RE = /std\.?\s*err|stderr|std\.?\s*dev|\bs\.?e\.?m\b|\(\s*se\s*\)/i;

/** "A01" -> "A1"; null when the text is not a well name. */
export function wellId(text: string): string | null {
  const m = WELL_RE.exec(text.trim());
  return m ? `${m[1].toUpperCase()}${Number(m[2])}` : null;
}

/** Elapsed time in hours: 2, 2.5, "0d02h30m", "2:30" (h:mm) or
 *  "2:30:00" (h:mm:ss). */
export function elapsedHours(text: string): number | null {
  const s = text.trim();
  const n = cellNumber(s);
  if (n !== null) return n;
  const dhm = /^(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?$/i.exec(s);
  if (dhm && (dhm[1] || dhm[2] || dhm[3])) {
    return Number(dhm[1] ?? 0) * 24 + Number(dhm[2] ?? 0) + Number(dhm[3] ?? 0) / 60;
  }
  const hms = /^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/.exec(s);
  if (hms) return Number(hms[1]) + Number(hms[2]) / 60 + Number(hms[3] ?? 0) / 3600;
  return null;
}

export interface IncucyteSeries {
  /** Column in the sheet. */
  col: number;
  header: string;
  /** Data set the column belongs to: the well, or the group label. */
  group: string;
  /** The well, when the header names one. */
  well: string | null;
}

export interface IncucyteExport {
  /** The "Metric:" line ("" when absent). */
  metric: string;
  meta: [string, string][];
  headerRow: number;
  /** Elapsed hours per data row (null: unreadable). */
  hours: (number | null)[];
  dates: string[];
  series: IncucyteSeries[];
  /** Data rows (sheet rows below the header that hold an elapsed time). */
  rows: string[][];
  /** Standard-error columns left out. */
  skipped: string[];
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/** Row of the "Date Time … Elapsed …" header, or -1. */
export function incucyteHeader(m: string[][], maxScan = 60): number {
  for (let r = 0; r < Math.min(m.length, maxScan); r++) {
    const cells = m[r].map(norm);
    if (cells.some((c) => /^elapsed\b/.test(c)) && cells.some((c) => /^date\s*time$|^date$/.test(c))) return r;
  }
  return -1;
}

export function parseIncucyte(m: string[][]): IncucyteExport | null {
  const h = incucyteHeader(m);
  if (h < 0) return null;
  const meta: [string, string][] = [];
  for (const row of m.slice(0, h)) {
    const cells = row.map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;
    const kv = /^([^:]+):\s*(.*)$/.exec(cells[0]);
    if (kv) meta.push([kv[1].trim(), [kv[2], ...cells.slice(1)].filter(Boolean).join(" ").trim()]);
  }
  const metric = meta.find(([k]) => /^metric$/i.test(k))?.[1] ?? "";
  const header = m[h];
  const elapsedCol = header.findIndex((c) => /^elapsed\b/.test(norm(c)));
  const dateCol = header.findIndex((c) => /^date\s*time$|^date$/.test(norm(c)));
  const skipped: string[] = [];
  const series: IncucyteSeries[] = [];
  header.forEach((raw, col) => {
    const text = raw.trim();
    if (col === elapsedCol || col === dateCol || !text) return;
    if (STDERR_RE.test(text)) { skipped.push(text); return; }
    const well = wellId(text);
    if (well) { series.push({ col, header: text, group: well, well }); return; }
    const part = WELL_PART_RE.exec(text);
    if (part && part[3] && /image|img|field|site|\d/i.test(part[3])) {
      const w = `${part[1].toUpperCase()}${Number(part[2])}`;
      series.push({ col, header: text, group: w, well: w });
      return;
    }
    series.push({ col, header: text, group: text, well: null });
  });
  const rows: string[][] = [];
  const hours: (number | null)[] = [];
  const dates: string[] = [];
  for (const row of m.slice(h + 1)) {
    const e = elapsedHours(row[elapsedCol] ?? "");
    if (e === null) continue;
    rows.push(row);
    hours.push(e);
    dates.push(dateCol >= 0 ? (row[dateCol] ?? "").trim() : "");
  }
  return { metric, meta, headerRow: h, hours, dates, series, rows, skipped };
}

/** Plate format holding every well named (96 unless a well lies outside
 *  A–H × 1–12). */
export function formatOfWells(wells: string[]): 96 | 384 {
  return wells.some((w) => {
    const m = WELL_RE.exec(w);
    return !!m && ("ABCDEFGH".indexOf(m[1].toUpperCase()) < 0 || Number(m[2]) > 12);
  }) ? 384 : 96;
}

/** Number text without float noise. */
const numText = (v: number) => String(Number(v.toPrecision(12)));

export const incucyteRecipe: Recipe = {
  id: "incucyte",
  label: "Incucyte time series",
  description: "Export Data text file: metadata lines (Vessel Name, Metric …), then Date Time, "
    + "Elapsed and one column per well or group. X = elapsed hours, one data set per well or group.",
  layouts: "Incucyte ZOOM, S3 and SX5 “Export Data” text files (per well, per image or per "
    + "plate-map group; standard-error columns are left out).",
  detect: (m) => {
    const h = incucyteHeader(m);
    if (h < 0) return 0;
    const metric = m.slice(0, h).some((r) => /^(metric|vessel name)\s*:/i.test((r[0] ?? "").trim()));
    return metric ? 1 : 0.9;
  },
  stage: (m): Staged => {
    const x = parseIncucyte(m);
    if (!x) throw new Error("No Incucyte table found: no header row with “Date Time” and “Elapsed”.");
    if (!x.series.length) throw new Error("The Incucyte table has no well or group columns after Elapsed.");
    if (!x.rows.length) throw new Error("The Incucyte table has no rows with an elapsed time.");
    const rows: string[][] = [];
    // replicate slot of a column: its well, or its position among the
    // columns that share its label
    const slot = new Map<number, string>();
    const seen = new Map<string, number>();
    for (const s of x.series) {
      const k = (seen.get(s.group) ?? 0) + 1;
      seen.set(s.group, k);
      slot.set(s.col, s.well && wellId(s.header) ? s.well : s.well ? s.header : `${s.group} ${k}`);
    }
    x.rows.forEach((r, i) => {
      const hrs = x.hours[i]!;
      for (const s of x.series) {
        rows.push([x.dates[i], numText(hrs), s.group, slot.get(s.col)!, s.well ?? "", (r[s.col] ?? "").trim()]);
      }
    });
    const st = makeStaging(["Date Time", "Elapsed (h)", "Group", "Replicate", "Well", "Value"], rows,
      ["meta", "time", "group", "subject", "meta", "value"]);
    const wells = x.series.map((s) => s.well).filter((w): w is string => !!w);
    const allWells = wells.length === x.series.length;
    const metric = x.metric || "Incucyte";
    const groups = new Set(x.series.map((s) => s.group)).size;
    return {
      recipe: "incucyte", staging: st, pattern: null, aggregate: [], output: "xy",
      name: metric.replace(/\s*\([^)]*\)\s*$/, "") || "Incucyte",
      yTitle: metric,
      notes: [
        `${x.rows.length} time points (${numText(Math.min(...x.hours as number[]))} to `
        + `${numText(Math.max(...x.hours as number[]))} h), ${x.series.length} columns in ${groups} data set${groups === 1 ? "" : "s"}`
        + `${x.metric ? `; metric: ${x.metric}` : ""}.`,
        ...(x.skipped.length ? [`${x.skipped.length} standard-error column${x.skipped.length === 1 ? "" : "s"} `
          + "left out (they summarise images or wells; the wells are the replicates)."] : []),
      ],
      ...(allWells ? { wells: { column: 4, format: formatOfWells(wells) } } : {}),
    };
  },
};
