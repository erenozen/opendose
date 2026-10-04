// Plate reader → dose-response: the plate map (what each well holds),
// layout templates, reading plates from the input table, the engine
// payload (assay_plate.plate_qc) and the normalised dose-response tables
// made from its result. Pure (no React), unit-tested.
//
// The input table is a multiple-variables table holding the readings as
// they come off the reader: columns "1".."12" (or "1".."24"), rows A–H
// (A–P), and further plates stacked below the first (row titles "P2 A"
// ...). One plate map serves every plate.
import { findPlateGrid } from "../../../share/recipes/plate.ts";
import { normalizeTable, parseCell, withExclusionsBlanked } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { cellOf } from "../kit/columns.ts";

export const ROW_LETTERS = "ABCDEFGHIJKLMNOP";

export type WellRole = "blank" | "negative" | "positive" | "sample" | "empty";

export interface WellInfo {
  role: WellRole;
  compound?: string;
  conc?: number;
  rep?: number;
}

/** "A1" -> what the well holds (wells not listed are empty). */
export type PlateMap = Record<string, WellInfo>;

export type PlateFormat = 96 | 384;

export const FORMAT_DIMS: Record<PlateFormat, [number, number]> = { 96: [8, 12], 384: [16, 24] };

export type Normalization =
  | "percent_of_control" | "percent_activity" | "percent_inhibition"
  | "inhibition_vs_blank" | "none";

export const NORMALIZATION_LABELS: Record<Normalization, string> = {
  percent_of_control: "% of vehicle control (blank-subtracted): viability",
  percent_activity: "% activity: vehicle = 100%, positive control = 0%",
  percent_inhibition: "% inhibition: vehicle = 0%, positive control = 100%",
  inhibition_vs_blank: "100 − % of vehicle control (inhibition without a positive control)",
  none: "Blank-subtracted signal (no normalisation)",
};

export type OutputMode = "pooled" | "combined" | "per_plate";

export type EdgeRole = "negative" | "positive" | "sample" | "all";

export interface PlateOptions {
  format: PlateFormat;
  wells: PlateMap;
  normalization: Normalization;
  /** Concentration unit of the plate map (X unit of the output tables). */
  unit: string;
  zLimit: number;
  cvLimit: number;
  edgeRole: EdgeRole;
  outputMode: OutputMode;
  /** Fit with Top = 100 and Bottom = 0 held constant. */
  constrain: boolean;
  /** Which linked table this results sheet feeds (kit/create.ts). */
  output?: string;
}

export const DEFAULT_PLATE_OPTIONS: PlateOptions = {
  format: 96,
  wells: {},
  normalization: "percent_of_control",
  unit: "µM",
  zLimit: 0.5,
  cvLimit: 15,
  edgeRole: "negative",
  outputMode: "pooled",
  constrain: false,
};

const ROLES: WellRole[] = ["blank", "negative", "positive", "sample", "empty"];
const NORMS = Object.keys(NORMALIZATION_LABELS) as Normalization[];

export function normalizePlateOptions(raw: unknown): PlateOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PLATE_OPTIONS;
  const numOr = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  const wells: PlateMap = {};
  if (o.wells && typeof o.wells === "object") {
    for (const [k, v] of Object.entries(o.wells as Record<string, unknown>)) {
      const w = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const role = ROLES.includes(w.role as WellRole) ? w.role as WellRole : null;
      if (!role || role === "empty" || !parseWell(k)) continue;
      const info: WellInfo = { role };
      if (typeof w.compound === "string" && w.compound) info.compound = w.compound;
      if (typeof w.conc === "number" && Number.isFinite(w.conc)) info.conc = w.conc;
      if (typeof w.rep === "number" && Number.isFinite(w.rep)) info.rep = w.rep;
      wells[k.toUpperCase()] = info;
    }
  }
  return {
    format: o.format === 384 ? 384 : 96,
    wells,
    normalization: NORMS.includes(o.normalization as Normalization)
      ? o.normalization as Normalization : d.normalization,
    unit: typeof o.unit === "string" ? o.unit : d.unit,
    zLimit: numOr(o.zLimit, d.zLimit),
    cvLimit: numOr(o.cvLimit, d.cvLimit),
    edgeRole: ["negative", "positive", "sample", "all"].includes(o.edgeRole as string)
      ? o.edgeRole as EdgeRole : d.edgeRole,
    outputMode: o.outputMode === "combined" || o.outputMode === "per_plate"
      ? o.outputMode : "pooled",
    constrain: o.constrain === true,
    ...(typeof o.output === "string" ? { output: o.output } : {}),
  };
}

// ------------------------------------------------------------ wells

export function wellName(r: number, c: number): string {
  return `${ROW_LETTERS[r]}${c + 1}`;
}

export function parseWell(name: string): [number, number] | null {
  const m = /^\s*([A-Pa-p])\s*0*(\d{1,2})\s*$/.exec(name);
  if (!m) return null;
  const c = Number(m[2]) - 1;
  return c >= 0 && c < 24 ? [ROW_LETTERS.indexOf(m[1].toUpperCase()), c] : null;
}

export interface Rect { r0: number; c0: number; r1: number; c1: number }

export function normRect(a: Rect): Rect {
  return {
    r0: Math.min(a.r0, a.r1), r1: Math.max(a.r0, a.r1),
    c0: Math.min(a.c0, a.c1), c1: Math.max(a.c0, a.c1),
  };
}

/** Wells of a rectangle, row by row. */
export function rectWells(rect: Rect): string[] {
  const r = normRect(rect);
  const out: string[] = [];
  for (let i = r.r0; i <= r.r1; i++) for (let j = r.c0; j <= r.c1; j++) out.push(wellName(i, j));
  return out;
}

/** Give every well of the rectangle one role (compound and
 *  concentration cleared); "empty" removes the wells from the map. */
export function assignRole(map: PlateMap, rect: Rect, role: WellRole, compound?: string): PlateMap {
  const next = { ...map };
  for (const w of rectWells(rect)) {
    if (role === "empty") delete next[w];
    else next[w] = compound && role !== "blank" ? { role, compound } : { role };
  }
  return next;
}

export type Direction = "right" | "left" | "down" | "up";

export const DIRECTION_LABELS: Record<Direction, string> = {
  right: "Left to right (highest first)",
  left: "Right to left (highest first)",
  down: "Top to bottom (highest first)",
  up: "Bottom to top (highest first)",
};

export interface SeriesSpec {
  compound: string;
  /** Top concentration and dilution factor, or an explicit list. */
  mode: "dilution" | "list";
  top: number;
  factor: number;
  list: number[];
  direction: Direction;
}

/** Concentrations of a series, highest first, rounded to 6 significant
 *  digits (what the grid shows is what is fitted). */
export function seriesConcentrations(spec: SeriesSpec, n: number): number[] {
  if (spec.mode === "list") return spec.list.slice(0, n);
  return Array.from({ length: n }, (_, i) => Number((spec.top / spec.factor ** i).toPrecision(6)));
}

/** Concentrations run along the direction; the lines across it are the
 *  replicates (replicate 1 = first row or column of the rectangle). */
export function assignSeries(map: PlateMap, rect: Rect, spec: SeriesSpec): PlateMap {
  const r = normRect(rect);
  const along = spec.direction === "right" || spec.direction === "left";
  const nConc = along ? r.c1 - r.c0 + 1 : r.r1 - r.r0 + 1;
  const concs = seriesConcentrations(spec, nConc);
  const next = { ...map };
  for (let i = r.r0; i <= r.r1; i++) {
    for (let j = r.c0; j <= r.c1; j++) {
      const step = spec.direction === "right" ? j - r.c0 : spec.direction === "left" ? r.c1 - j
        : spec.direction === "down" ? i - r.r0 : r.r1 - i;
      const rep = along ? i - r.r0 + 1 : j - r.c0 + 1;
      const conc = concs[step];
      const w = wellName(i, j);
      if (conc === undefined || !Number.isFinite(conc)) delete next[w];
      else next[w] = { role: "sample", compound: spec.compound, conc, rep };
    }
  }
  return next;
}

/** A concentration short enough for a well: 100, 3.33, .041. */
export function shortConc(v: number): string {
  if (v >= 100) return String(Math.round(v));
  if (v >= 1) return String(Number(v.toPrecision(3)));
  return String(Number(v.toPrecision(2))).replace(/^0\./, ".");
}

/** Compounds in first-appearance order (row by row). */
export function compoundsOf(map: PlateMap): string[] {
  const out: string[] = [];
  const keys = Object.keys(map).sort((a, b) => {
    const pa = parseWell(a)!; const pb = parseWell(b)!;
    return pa[0] - pb[0] || pa[1] - pb[1];
  });
  for (const k of keys) {
    const c = map[k].role === "sample" ? map[k].compound ?? "Sample" : null;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function roleCounts(map: PlateMap): Record<WellRole, number> {
  const out: Record<WellRole, number> = { blank: 0, negative: 0, positive: 0, sample: 0, empty: 0 };
  for (const w of Object.values(map)) out[w.role]++;
  return out;
}

/** What is missing before QC can run, or null. */
export function mapProblem(map: PlateMap, norm: Normalization): string | null {
  const n = roleCounts(map);
  if (!n.sample) return "Mark at least one compound concentration series.";
  if (norm !== "none" && !n.negative) return "Mark the vehicle (negative control) wells.";
  if ((norm === "percent_activity" || norm === "percent_inhibition") && !n.positive) {
    return "This normalisation needs positive (kill / full-effect) control wells.";
  }
  const missingConc = Object.values(map).some((w) => w.role === "sample" && w.conc === undefined);
  if (missingConc) return "Some compound wells have no concentration.";
  return null;
}

// ------------------------------------------------------------ templates

export interface PlateTemplate {
  id: string;
  name: string;
  description: string;
  format: PlateFormat;
  wells: PlateMap;
  normalization?: Normalization;
  unit?: string;
  /** Saved by the user in this browser (can be deleted). */
  saved?: boolean;
}

const all = (rows: string, c0: number, c1: number): Rect => ({
  r0: ROW_LETTERS.indexOf(rows[0]), r1: ROW_LETTERS.indexOf(rows[rows.length - 1]),
  c0: c0 - 1, c1: c1 - 1,
});

const series = (compound: string, top: number, factor: number, direction: Direction = "right"): SeriesSpec =>
  ({ compound, mode: "dilution", top, factor, list: [], direction });

/** Columns 3–11: nine 1:3 concentrations from 10, highest left; column 1
 *  blank (medium), column 2 vehicle, column 12 kill control; compounds in
 *  triplicate rows A–C and D–F and duplicate rows G–H. The example plate
 *  uses this layout. */
export function rowsLayout(): PlateMap {
  let m: PlateMap = {};
  m = assignRole(m, all("ABCDEFGH", 1, 1), "blank");
  m = assignRole(m, all("ABCDEFGH", 2, 2), "negative");
  m = assignRole(m, all("ABCDEFGH", 12, 12), "positive");
  m = assignSeries(m, all("ABC", 3, 11), series("Drug A", 10, 3));
  m = assignSeries(m, all("DEF", 3, 11), series("Drug B", 10, 3));
  m = assignSeries(m, all("GH", 3, 11), series("Drug C", 10, 3));
  return m;
}

function duplicateBlocks(): PlateMap {
  let m: PlateMap = {};
  m = assignRole(m, all("ABCDEFGH", 1, 1), "negative");
  m = assignRole(m, all("ABCDEFGH", 12, 12), "positive");
  ["AB", "CD", "EF", "GH"].forEach((rows, i) => {
    m = assignSeries(m, all(rows, 2, 11), series(`Compound ${i + 1}`, 30, 3));
  });
  return m;
}

function columnsLayout(): PlateMap {
  let m: PlateMap = {};
  m = assignRole(m, all("A", 1, 12), "negative");
  m = assignRole(m, all("H", 1, 12), "positive");
  [[1, 3], [4, 6], [7, 9], [10, 12]].forEach(([a, b], i) => {
    m = assignSeries(m, all("BCDEFG", a, b), series(`Compound ${i + 1}`, 100, 4, "down"));
  });
  return m;
}

/** The SRB / MTT importer's layout (blank H3–H5, a vehicle column per
 *  cell line in column 2, doses 5 to 0.05 µM in columns 3–11). */
function srbLayout(): PlateMap {
  let m: PlateMap = {};
  m = assignRole(m, all("H", 3, 5), "blank");
  const list = [5, 3, 2, 1, 0.7, 0.5, 0.3, 0.1, 0.05];
  for (const [name, rows] of [["Line S", "BCD"], ["Line R", "EFG"]] as const) {
    m = assignRole(m, all(rows, 2, 2), "negative", name);
    m = assignSeries(m, all(rows, 3, 11), { compound: name, mode: "list", top: 5, factor: 1, list, direction: "right" });
  }
  return m;
}

function duplicate384(): PlateMap {
  let m: PlateMap = {};
  m = assignRole(m, all("ABCDEFGHIJKLMNOP", 1, 1), "negative");
  m = assignRole(m, all("ABCDEFGHIJKLMNOP", 24, 24), "positive");
  ["AB", "CD", "EF", "GH", "IJ", "KL", "MN", "OP"].forEach((rows, i) => {
    m = assignSeries(m, all(rows, 2, 23), series(`Compound ${i + 1}`, 100, 2));
  });
  return m;
}

export const BUILTIN_TEMPLATES: PlateTemplate[] = [
  { id: "rows", format: 96, name: "Concentrations across columns, compounds in rows",
    description: "Column 1 blank, 2 vehicle, 12 kill control; nine 1:3 concentrations "
      + "in columns 3–11; compounds in triplicate (A–C, D–F) and duplicate (G–H) rows.",
    wells: rowsLayout() },
  { id: "dup", format: 96, name: "Duplicate row blocks, four compounds",
    description: "Column 1 vehicle, 12 kill control; ten 1:3 concentrations in columns 2–11; "
      + "compounds in row pairs A–B, C–D, E–F, G–H.", wells: duplicateBlocks() },
  { id: "cols", format: 96, name: "Concentrations down rows, compounds in columns",
    description: "Row A vehicle, H kill control; six 1:4 concentrations down rows B–G; "
      + "compounds in triplicate columns 1–3, 4–6, 7–9, 10–12.", wells: columnsLayout() },
  { id: "srb", format: 96, name: "SRB / MTT viability (two cell lines)",
    description: "The SRB importer's layout: blank H3–H5, vehicle column 2, doses 5 to "
      + "0.05 µM in columns 3–11, cell lines in rows B–D and E–G with their own controls.",
    wells: srbLayout(), normalization: "percent_of_control", unit: "µM" },
  { id: "dup384", format: 384, name: "384 wells: duplicate row pairs, eight compounds",
    description: "Column 1 vehicle, 24 kill control; 22 1:2 concentrations in columns 2–23; "
      + "compounds in row pairs A–B … O–P.", wells: duplicate384() },
];

// ------------------------------------------------------------ plates in the table

/** Number of plate rows / columns the table holds per plate. */
export function dims(format: PlateFormat): [number, number] {
  return FORMAT_DIMS[format];
}

/** 384 when the table is wider than 12 columns or has 16-row plates. */
export function detectFormat(t: DataTableModel): PlateFormat {
  return t.datasets.length > 12 ? 384 : 96;
}

/** The plates held by the input table (excluded wells read as missing).
 *  Plates after the first start every 8 (16) rows; blank plates at the
 *  end are dropped. */
export function platesOf(t: DataTableModel, format: PlateFormat): (number | null)[][][] {
  const [nr, nc] = dims(format);
  const b = withExclusionsBlanked(t);
  const rows = b.x.length;
  const out: (number | null)[][][] = [];
  for (let k = 0; k * nr < rows; k++) {
    const grid = Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, c) => {
      const row = k * nr + r;
      const col = b.datasets[c];
      return row < rows && col ? parseCell(col.rows[row]?.[0] ?? "") : null;
    }));
    out.push(grid);
  }
  while (out.length > 1 && out[out.length - 1].every((r) => r.every((v) => v === null))) out.pop();
  return out.length ? out : [Array.from({ length: nr }, () => Array<number | null>(nc).fill(null))];
}

/** The input table for plates read off an export. */
export function plateTable(plates: (number | null)[][][], format: PlateFormat): DataTableModel {
  const [nr, nc] = dims(format);
  const n = Math.max(1, plates.length);
  const rowTitles: string[] = [];
  for (let k = 0; k < n; k++) {
    for (let r = 0; r < nr; r++) rowTitles.push(n > 1 ? `P${k + 1} ${ROW_LETTERS[r]}` : ROW_LETTERS[r]);
  }
  return normalizeTable({
    type: "multivariable",
    x: Array<string>(n * nr).fill(""),
    rowTitles,
    datasets: Array.from({ length: nc }, (_, c) => ({
      name: String(c + 1),
      varType: "continuous",
      rows: Array.from({ length: n * nr }, (_, i) => {
        const v = plates[Math.floor(i / nr)]?.[i % nr]?.[c];
        return [v === null || v === undefined ? "" : String(v)];
      }),
    })),
  });
}

/** Every plate block found in the given sheets (text or workbook), in
 *  order: plates stacked down a sheet, or one per worksheet. */
export function findPlates(matrices: string[][][]): { format: PlateFormat; plates: (number | null)[][][] } {
  const plates: (number | null)[][][] = [];
  let format: PlateFormat = 96;
  for (const m of matrices) {
    let rest = m;
    for (let guard = 0; guard < 64; guard++) {
      const g = findPlateGrid(rest);
      if (!g || (g.rows !== 8 && g.rows !== 16)) break;
      if (g.rows === 16) format = 384;
      plates.push(g.values);
      if (g.left < 0) break;            // a bare grid is the whole sheet
      rest = rest.slice(g.top + g.rows);
    }
  }
  return { format, plates: plates.filter((p) => p.length === dims(format)[0]) };
}

// ------------------------------------------------------------ engine

export function plateMapPayload(map: PlateMap): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [w, info] of Object.entries(map)) {
    if (info.role === "empty") continue;
    out[w] = {
      role: info.role,
      compound: info.compound ?? null,
      concentration: info.conc ?? null,
      replicate: info.rep ?? null,
    };
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PlateRun {
  error?: string;
  format?: PlateFormat;
  plates?: any[];     // one assay_plate.plate_qc result per plate ({error} if it failed)
}

export function platePayloads(t: DataTableModel, o: PlateOptions): unknown[] {
  return platesOf(t, o.format).map((grid) => ({
    analysis: "plate_qc",
    data: { grid, plate_map: plateMapPayload(o.wells) },
    options: {
      normalization: o.normalization, plate_format: o.format,
      cv_limit: o.cvLimit, z_prime_limit: o.zLimit, edge_role: o.edgeRole,
    },
  }));
}

export function runPlateQc(analyze: (p: unknown) => unknown, t: DataTableModel,
  o: PlateOptions): PlateRun {
  const problem = mapProblem(o.wells, o.normalization);
  if (problem) return { error: `${problem} Open the setup wizard to edit the plate map.` };
  const plates = platePayloads(t, o).map((p) => {
    try { return analyze(p) as any; } catch (e) { return { error: String(e) }; }
  });
  if (plates.every((r) => r?.error)) return { error: String(plates[0]?.error ?? "plate QC failed") };
  return { format: o.format, plates };
}

// ------------------------------------------------------------ outputs

export function responseTitle(norm: Normalization): string {
  switch (norm) {
    case "percent_of_control": return "Viability (% of control)";
    case "percent_activity": return "Activity (%)";
    case "percent_inhibition":
    case "inhibition_vs_blank": return "Inhibition (%)";
    default: return "Signal (blank-subtracted)";
  }
}

/** True when the normalised response falls with dose. */
export function decreasing(norm: Normalization): boolean {
  return norm === "percent_of_control" || norm === "percent_activity" || norm === "none";
}

export function outputKeys(run: PlateRun, o: PlateOptions): string[] {
  const n = run.plates?.length ?? 0;
  if (o.outputMode === "per_plate") return Array.from({ length: Math.max(1, n) }, (_, k) => `plate:${k}`);
  return [o.outputMode];
}

export function outputName(key: string, tableName: string, nPlates: number): string {
  if (key.startsWith("plate:")) {
    const k = Number(key.slice(6));
    return nPlates > 1 ? `Dose-response of ${tableName}, plate ${k + 1}` : `Dose-response of ${tableName}`;
  }
  return `Dose-response of ${tableName}`;
}

interface Block { name: string; x: number[]; ys: (number | null)[][]; width: number }

function blocksOf(res: any, suffix = ""): Block[] {
  if (!res || res.error || !Array.isArray(res.dose_response)) return [];
  return res.dose_response.map((d: any) => ({
    name: `${d.compound}${suffix}`,
    x: d.x as number[],
    ys: d.datasets[0].ys as (number | null)[][],
    width: Math.max(1, d.n_replicates ?? 1),
  }));
}

function xyTable(blocks: Block[], o: PlateOptions): DataTableModel | null {
  if (!blocks.length) return null;
  const xs = [...new Set(blocks.flatMap((b) => b.x))].sort((a, b) => a - b);
  const width = Math.max(...blocks.map((b) => b.width));
  return normalizeTable({
    type: "xy",
    x: xs.map((v) => cellOf(v)),
    xTitle: "Concentration",
    xUnit: o.unit || "µM",
    yTitle: responseTitle(o.normalization),
    datasets: blocks.map((b) => ({
      name: b.name,
      rows: xs.map((x) => {
        const i = b.x.indexOf(x);
        const row = i >= 0 ? b.ys[i] : [];
        return Array.from({ length: width }, (_, s) => cellOf(row[s] ?? null));
      }),
    })),
  });
}

/** The linked XY table for one output key. */
export function doseResponseTable(run: PlateRun, o: PlateOptions, key: string): DataTableModel | null {
  const plates = run.plates ?? [];
  if (run.error || !plates.length) return null;
  if (key.startsWith("plate:")) return xyTable(blocksOf(plates[Number(key.slice(6))]), o);
  if (key === "combined") {
    return xyTable(plates.flatMap((p, k) => blocksOf(p, plates.length > 1 ? ` (plate ${k + 1})` : "")), o);
  }
  // pooled: each compound once, the plates' replicates side by side
  const byName = new Map<string, Block[]>();
  for (const p of plates) {
    for (const b of blocksOf(p)) byName.set(b.name, [...(byName.get(b.name) ?? []), b]);
  }
  const pooled: Block[] = [...byName.entries()].map(([name, bs]) => {
    const x = [...new Set(bs.flatMap((b) => b.x))].sort((a, b) => a - b);
    const width = bs.reduce((s, b) => s + b.width, 0);
    const ys = x.map((xv) => bs.flatMap((b) => {
      const i = b.x.indexOf(xv);
      return Array.from({ length: b.width }, (_, s) => (i >= 0 ? b.ys[i][s] ?? null : null));
    }));
    return { name, x, ys, width };
  });
  return xyTable(pooled, o);
}

/** Curve-fit settings for normalised dose-response data (the XY sheet's
 *  nonlin options): log(inhibitor) or log(agonist) vs. response, X as
 *  concentrations, Top = 100 / Bottom = 0 held only when asked. */
export function fitSettings<T extends Record<string, unknown>>(prev: T, o: PlateOptions): T {
  const p = prev as Record<string, any>;
  return {
    ...p,
    xIsLog: false,
    normalize: { ...(p.normalize ?? {}), enabled: false },
    model: decreasing(o.normalization) ? "log_inhibitor_vs_response_4pl" : "log_agonist_vs_response_4pl",
    top: { enabled: o.constrain && o.normalization !== "none", value: "100" },
    bottom: { enabled: o.constrain && o.normalization !== "none", value: "0" },
  } as unknown as T;
}
