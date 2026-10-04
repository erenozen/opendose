// Standard curve / ELISA: reading standards, blanks and unknowns from the
// input table, the engine payload (assay_stdcurve.standard_curve_qc, one
// fit per plate) and the linked concentrations table. Pure, unit-tested.
//
// Input layouts:
// - the module's own multiple-variables table, one row per standard
//   level, blank or unknown sample dilution: Type (Standard / Blank /
//   Unknown), Name, Group, Concentration, Dilution, Plate and one column
//   per replicate signal (Signal 1, Signal 2 ...);
// - an XY table as a curve fit would take it: X = concentration of the
//   standards (0 = blank), rows without X are unknowns named by their
//   row title, the first data set holds the replicate signals and a data
//   set called "Dilution" (optional) the dilution factor.
import { normalizeTable, parseCell, withExclusionsBlanked } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import {
  cellOf, columnNames, distinctValues, numberColumn, resolveColumns, textColumn,
  type ColumnChoice, type RoleSpec,
} from "../kit/columns.ts";

export type StdRole = "type" | "name" | "group" | "conc" | "dilution" | "plate";

export const STD_ROLES: RoleSpec<StdRole>[] = [
  { key: "type", label: "Row type (Standard / Blank / Unknown)", required: false,
    patterns: [/^(type|row type|kind|role|sample type|well type)$/i],
    hint: "Without it, rows with a concentration are standards." },
  { key: "name", label: "Sample name", required: false,
    patterns: [/^(name|sample|sample name|sample id|id|label)$/i] },
  { key: "group", label: "Group (for the concentrations table)", required: false,
    patterns: [/^(group|treatment|condition|arm|cohort)$/i] },
  { key: "conc", label: "Standard concentration", required: true,
    patterns: [/^(conc|concentration|nominal|standard|std conc|expected)/i] },
  { key: "dilution", label: "Dilution factor", required: false,
    patterns: [/^(dilution|dil|dilution factor|df)/i] },
  { key: "plate", label: "Plate", required: false,
    patterns: [/^(plate|run|batch|assay)$/i], hint: "One curve per plate when given." },
];

const SIGNAL_RE = /^(signal|od|abs|absorbance|rep|replicate|read|rfu|rlu|lum|fluor|mfi|value|response)/i;

export type StdModel = "4pl" | "5pl" | "linear" | "loglog";

export const MODEL_LABELS: Record<StdModel, string> = {
  "4pl": "Four-parameter logistic (4PL), X = log(concentration)",
  "5pl": "Five-parameter asymmetric logistic (5PL)",
  linear: "Straight line",
  loglog: "Log-log straight line (log signal vs log concentration)",
};

export type Weighting = "none" | "1/Y" | "1/Y2";

export interface StdOptions {
  columns: ColumnChoice<StdRole>;
  /** Replicate signal columns (empty = every column named Signal / OD /
   *  Rep ...). */
  signals: string[];
  model: StdModel;
  weighting: Weighting;
  /** Straight-line models: fit on log10 concentration. */
  logX: boolean;
  blank: "zero_standard" | "none" | "value";
  blankValue: string;
  /** Bottom held constant ("" = fitted). */
  bottom: string;
  accuracy: number;
  accuracyEnds: number;
  precision: number;
  precisionEnds: number;
  minFraction: number;
  minLevels: number;
  cvLimit: number;
  cvBasis: "concentration" | "signal";
  parallelismCv: number;
  unit: string;
  /** Standard concentrations left out of the fit (ICH M10: a failing
   *  standard inside the range is rejected and the curve refitted). */
  excludeLevels: number[];
  output?: string;
}

export const DEFAULT_STD_OPTIONS: StdOptions = {
  columns: {}, signals: [], model: "4pl", weighting: "none", logX: true,
  blank: "zero_standard", blankValue: "", bottom: "",
  accuracy: 20, accuracyEnds: 25, precision: 20, precisionEnds: 25,
  minFraction: 0.75, minLevels: 6, cvLimit: 20, cvBasis: "concentration",
  parallelismCv: 30, unit: "pg/mL", excludeLevels: [],
};

export function normalizeStdOptions(raw: unknown): StdOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_STD_OPTIONS;
  const n = (k: keyof StdOptions) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? o[k] as number : d[k] as number);
  const s = (k: keyof StdOptions) => (typeof o[k] === "string" ? o[k] as string : d[k] as string);
  return {
    columns: o.columns && typeof o.columns === "object" ? { ...(o.columns as ColumnChoice<StdRole>) } : {},
    signals: Array.isArray(o.signals) ? o.signals.filter((x): x is string => typeof x === "string") : [],
    model: ["4pl", "5pl", "linear", "loglog"].includes(o.model as string) ? o.model as StdModel : d.model,
    weighting: ["none", "1/Y", "1/Y2"].includes(o.weighting as string) ? o.weighting as Weighting : d.weighting,
    logX: o.logX !== false,
    blank: o.blank === "none" || o.blank === "value" ? o.blank : "zero_standard",
    blankValue: s("blankValue"), bottom: s("bottom"),
    accuracy: n("accuracy"), accuracyEnds: n("accuracyEnds"), precision: n("precision"),
    precisionEnds: n("precisionEnds"), minFraction: n("minFraction"), minLevels: n("minLevels"),
    cvLimit: n("cvLimit"), cvBasis: o.cvBasis === "signal" ? "signal" : "concentration",
    parallelismCv: n("parallelismCv"), unit: s("unit"),
    excludeLevels: Array.isArray(o.excludeLevels)
      ? o.excludeLevels.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : [],
    ...(typeof o.output === "string" ? { output: o.output } : {}),
  };
}

// ------------------------------------------------------------ reading the table

export type RowKind = "standard" | "blank" | "unknown";

export interface StdRow {
  kind: RowKind;
  name: string;
  group: string;
  conc: number | null;
  dilution: number;
  plate: string;
  signals: (number | null)[];
}

export function kindOf(type: string, conc: number | null): RowKind | null {
  const t = type.trim().toLowerCase();
  if (/^(blank|zero|bkg|background|b0|nsb)/.test(t)) return "blank";
  if (/^(std|standard|cal|calibrator)/.test(t)) return conc === 0 ? "blank" : "standard";
  if (/^(unk|unknown|sample|test|qc|smp)/.test(t)) return "unknown";
  if (/^(skip|exclude|empty|ignore)/.test(t)) return null;
  if (conc === null) return "unknown";
  return conc === 0 ? "blank" : "standard";
}

/** Indices of the replicate signal columns of a long table. */
export function signalColumns(t: DataTableModel, o: StdOptions, taken: number[]): number[] {
  const names = columnNames(t);
  if (o.signals.length) {
    return o.signals.map((s) => names.indexOf(s)).filter((i) => i >= 0 && !taken.includes(i));
  }
  return names.map((n, i) => (SIGNAL_RE.test(n.trim()) && !taken.includes(i) ? i : -1)).filter((i) => i >= 0);
}

export function readRows(t: DataTableModel, o: StdOptions): { rows: StdRow[]; problem: string | null } {
  if (t.type === "xy") return readXY(t);
  const idx = resolveColumns(t, STD_ROLES, o.columns);
  if (idx.conc < 0) return { rows: [], problem: "Choose the column with the standard concentrations." };
  const sig = signalColumns(t, o, Object.values(idx));
  if (!sig.length) return { rows: [], problem: "Choose the replicate signal columns." };
  const type = textColumn(t, idx.type);
  const name = textColumn(t, idx.name);
  const group = textColumn(t, idx.group);
  const conc = numberColumn(t, idx.conc);
  const dil = numberColumn(t, idx.dilution);
  const plate = textColumn(t, idx.plate);
  const sigs = sig.map((c) => numberColumn(t, c));
  const rows: StdRow[] = [];
  for (let r = 0; r < t.x.length; r++) {
    const s = sigs.map((col) => col[r]);
    if (!s.some((v) => v !== null)) continue;
    const kind = kindOf(type[r], conc[r]);
    if (!kind) continue;
    rows.push({
      kind, conc: conc[r], plate: plate[r],
      name: name[r] || (kind === "unknown" ? `Sample ${r + 1}` : kind === "blank" ? "Blank" : `Std ${conc[r]}`),
      group: group[r], dilution: dil[r] && dil[r]! > 0 ? dil[r]! : 1, signals: s,
    });
  }
  return { rows, problem: rows.some((x) => x.kind === "standard") ? null : "No standards: rows need a concentration." };
}

function readXY(t: DataTableModel): { rows: StdRow[]; problem: string | null } {
  const b = withExclusionsBlanked(t);
  const dIdx = b.datasets.findIndex((d) => /dilut/i.test(d.name));
  const sIdx = b.datasets.findIndex((_, i) => i !== dIdx);
  if (sIdx < 0) return { rows: [], problem: "The XY table needs a data set of signals." };
  const rows: StdRow[] = [];
  for (let r = 0; r < b.x.length; r++) {
    const signals = (b.datasets[sIdx].rows[r] ?? []).map(parseCell);
    if (!signals.some((v) => v !== null)) continue;
    const conc = parseCell(b.x[r] ?? "");
    const dil = dIdx >= 0 ? parseCell(b.datasets[dIdx].rows[r]?.[0] ?? "") : null;
    const kind: RowKind = conc === null ? "unknown" : conc === 0 ? "blank" : "standard";
    rows.push({
      kind, conc, group: "", plate: "", signals, dilution: dil && dil > 0 ? dil : 1,
      name: b.rowTitles[r]?.trim() || (kind === "unknown" ? `Sample ${r + 1}` : `Std ${conc}`),
    });
  }
  return { rows, problem: rows.some((x) => x.kind === "standard") ? null : "No standards: give their concentrations as X." };
}

// ------------------------------------------------------------ engine

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StdRun {
  error?: string;
  unit?: string;
  plates?: { plate: string; res: any }[];
  /** sample name -> group */
  groups?: Record<string, string>;
  notes?: string[];
}

export function stdPayloads(rows: StdRow[], o: StdOptions): { plate: string; payload: unknown; note?: string }[] {
  const plates = distinctValues(rows.map((r) => r.plate));
  const keys = plates.length ? plates : [""];
  return keys.map((plate) => {
    const mine = rows.filter((r) => (plates.length ? r.plate === plate : true));
    const levels = new Map<number, (number | null)[]>();
    const blanks: (number | null)[] = [];
    for (const r of mine) {
      if (r.kind === "standard" && r.conc !== null) levels.set(r.conc, [...(levels.get(r.conc) ?? []), ...r.signals]);
      if (r.kind === "blank") blanks.push(...r.signals);
    }
    const standards: any[] = [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([c, s]) => ({
      concentration: c, signals: s.filter((v) => v !== null),
      ...(o.excludeLevels.includes(c) ? { exclude: true } : {}),
    }));
    let blank: unknown = null;
    let note: string | undefined;
    if (o.blank === "zero_standard") {
      const vals = blanks.filter((v) => v !== null);
      if (vals.length) standards.unshift({ concentration: 0, signals: vals });
      else note = "No blank rows: signals were used as read (no blank subtracted).";
      blank = vals.length ? "zero_standard" : null;
    } else if (o.blank === "value") {
      const v = Number(o.blankValue);
      blank = Number.isFinite(v) && o.blankValue.trim() !== "" ? v : null;
    }
    const unknowns = mine.filter((r) => r.kind === "unknown").map((r) => ({
      name: r.name, signals: r.signals.filter((v) => v !== null), dilution: r.dilution,
    }));
    const bottom = o.bottom.trim() === "" ? null : Number(o.bottom);
    const options: Record<string, unknown> = {
      model: o.model, weighting: o.weighting, blank,
      accuracy_limit: o.accuracy, accuracy_limit_ends: o.accuracyEnds,
      precision_limit: o.precision, precision_limit_ends: o.precisionEnds,
      min_fraction: o.minFraction, min_levels: o.minLevels, cv_limit: o.cvLimit,
      cv_basis: o.cvBasis, parallelism_cv_limit: o.parallelismCv,
    };
    if (o.model === "linear") options.log_x = o.logX;
    if (bottom !== null && Number.isFinite(bottom) && (o.model === "4pl" || o.model === "5pl")) {
      options.constraints = { Bottom: bottom };
    }
    return { plate, payload: { analysis: "stdcurve_qc", data: { standards, unknowns }, options }, note };
  });
}

export function runStdCurve(analyze: (p: unknown) => unknown, t: DataTableModel, o: StdOptions): StdRun {
  const { rows, problem } = readRows(t, o);
  if (problem) return { error: problem };
  const groups: Record<string, string> = {};
  for (const r of rows) if (r.kind === "unknown" && r.group && !groups[r.name]) groups[r.name] = r.group;
  const notes: string[] = [];
  const plates = stdPayloads(rows, o).map(({ plate, payload, note }) => {
    if (note) notes.push(plate ? `Plate ${plate}: ${note}` : note);
    let res: any;
    try { res = analyze(payload); } catch (e) { res = { error: String(e) }; }
    return { plate, res };
  });
  if (plates.every((p) => p.res?.error)) return { error: String(plates[0].res.error) };
  return { unit: o.unit, plates, groups, notes };
}

// ------------------------------------------------------------ outputs

/** Linked column table of reportable concentrations: one column per
 *  group (sample means, dilution-corrected, in-range dilutions only;
 *  samples without a group, such as a QC pool, stay in the results), or
 *  one column per sample (its corrected replicates) without groups. */
export function concentrationTable(run: StdRun, o: StdOptions): DataTableModel | null {
  if (run.error || !run.plates) return null;
  const groups = run.groups ?? {};
  const byGroup = new Map<string, number[]>();
  const perSample = new Map<string, number[]>();
  const anyGroup = Object.keys(groups).length > 0;
  for (const { res } of run.plates) {
    if (!res || res.error) continue;
    for (const s of res.samples ?? []) {
      if (s.status !== "ok" || typeof s.mean !== "number") continue;
      const g = groups[s.name];
      if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), s.mean]);
    }
    for (const u of res.unknowns ?? []) {
      if (u.status !== "ok") continue;
      const reps = (u.corrected_replicates ?? []).filter((v: unknown) => typeof v === "number") as number[];
      perSample.set(u.name, [...(perSample.get(u.name) ?? []), ...reps]);
    }
  }
  const cols = anyGroup ? byGroup : perSample;
  if (!cols.size) return null;
  const n = Math.max(1, ...[...cols.values()].map((v) => v.length));
  return normalizeTable({
    type: "column",
    x: Array<string>(n).fill(""),
    yTitle: `Concentration (${o.unit || "units"})`,
    datasets: [...cols.entries()].map(([name, vals]) => ({
      name, rows: Array.from({ length: n }, (_, i) => [cellOf(vals[i] ?? null)]),
    })),
  });
}

/** Column analysis for the concentrations: unpaired t test for two
 *  groups, one-way ANOVA (Tukey) for more, statistics otherwise. */
export function columnSettings(prev: unknown, table: DataTableModel | null): unknown {
  const p = (prev && typeof prev === "object" ? prev : {}) as Record<string, unknown>;
  const k = table?.datasets.length ?? 0;
  if (k === 2) return { ...p, analysis: "ttest", ttestKind: "unpaired", datasetA: 0, datasetB: 1 };
  if (k > 2) return { ...p, analysis: "anova", anovaKind: "parametric", comparisons: "tukey" };
  return p;
}
