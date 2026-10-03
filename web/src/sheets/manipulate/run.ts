// Data manipulations: engine payloads, and engine output -> data table.
// Each manipulation is a table-producing analysis: its result carries the
// output grid, which the shell writes into a derived data sheet.
import type { EngineBridge } from "../../lib/engine";
import { normalizeTable, numericData, parseCell } from "../../project/table";
import type { DataTableModel, TableType } from "../../project/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Num = number | null;
export interface ApiDataset { name: string; ys: Num[][] }

/** What every manipulation returns. */
export interface ManipResult {
  error?: string;
  x: Num[];
  datasets: ApiDataset[];
  rowTitles?: string[];
  /** Plain-language remarks shown with the results. */
  notes: string[];
  /** Output table format, when it differs from the source's. */
  outputType?: TableType;
  xTitle?: string;
  yTitle?: string;
  /** Anything else worth showing (totals, CIs, baseline lines). */
  extra?: Record<string, unknown>;
}

const fail = (error: string): ManipResult => ({ error, x: [], datasets: [], notes: [] });

/** Number -> cell text, without float noise (1e-9 -> "1e-9", -9 -> "-9"). */
export function fmtCell(v: Num | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return String(Number(v.toPrecision(12)));
}

function call(engine: EngineBridge, payload: unknown): any {
  const r = engine.analyze(payload) as any;
  if (r && typeof r === "object" && r.error) throw new Error(String(r.error));
  return r;
}

function guard(fn: () => ManipResult): ManipResult {
  try {
    return fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

function hasValues(table: DataTableModel): boolean {
  return table.datasets.some((d) => d.rows.some((r) => r.some((v) => v.trim() !== "")));
}

const emptyNote = "The source table has no values yet.";

/** Engine output -> a data table of the source's (or the given) type,
 *  carrying over titles where the shape still matches. */
export function resultToTable(r: ManipResult, source: DataTableModel): DataTableModel | null {
  if (r.error) return null;
  const type = r.outputType ?? source.type;
  const nRows = Math.max(r.x.length, ...r.datasets.map((d) => d.ys.length), 1);
  const sameRows = nRows === source.x.length;
  const datasets = r.datasets.map((d, i) => {
    const src = source.datasets[i];
    const width = Math.max(1, ...d.ys.map((row) => row.length));
    const rows = Array.from({ length: nRows }, (_, ri) => {
      const row = d.ys[ri] ?? [];
      return Array.from({ length: width }, (_, s) => fmtCell(row[s]));
    });
    const col: { name: string; rows: string[][]; subTitles?: string[] } = { name: d.name, rows };
    if (src?.subTitles && src.subTitles.length === width && !r.outputType) {
      col.subTitles = [...src.subTitles];
    }
    return col;
  });
  const x = type === "xy" ? Array.from({ length: nRows }, (_, i) => fmtCell(r.x[i])) : [];
  const rowTitles = r.rowTitles
    ?? (sameRows && !r.outputType ? source.rowTitles : undefined);
  return normalizeTable({
    type,
    x: x.length ? x : Array(nRows).fill(""),
    xTitle: r.xTitle ?? (type === "xy" ? source.xTitle || "X" : ""),
    xUnit: type === "xy" ? source.xUnit : "",
    yTitle: r.yTitle ?? source.yTitle,
    rowTitles,
    datasets,
  }, type);
}

// ------------------------------------------------------------ Transform

/** transform.py's standard functions (same id, same behavior). */
export const BUILTIN_FUNCS: { id: string; y: string; x: string; k?: boolean }[] = [
  { id: "log10", y: "Y = log(Y)", x: "X = log(X)" },
  { id: "ln", y: "Y = ln(Y)", x: "X = ln(X)" },
  { id: "log2", y: "Y = log2(Y)", x: "X = log2(X)" },
  { id: "pow10", y: "Y = 10^Y", x: "X = 10^X" },
  { id: "exp", y: "Y = e^Y", x: "X = e^X" },
  { id: "reciprocal", y: "Y = 1/Y", x: "X = 1/X" },
  { id: "sqrt", y: "Y = √Y", x: "X = √X" },
  { id: "square", y: "Y = Y²", x: "X = X²" },
  { id: "multiply_k", y: "Y = Y × K", x: "X = X × K", k: true },
  { id: "divide_k", y: "Y = Y / K", x: "X = X / K", k: true },
  { id: "add_k", y: "Y = Y + K", x: "X = X + K", k: true },
  { id: "subtract_k", y: "Y = Y − K", x: "X = X − K", k: true },
];

/** More standard Y functions, run through the formula engine. `xy`
 *  marks those that use X (offered on XY tables only). */
export const EXTRA_Y_FUNCS: { id: string; label: string; formula: string; k?: boolean; xy?: boolean }[] = [
  { id: "pow_k", label: "Y = Y^K", formula: "Y^K", k: true },
  { id: "k_pow", label: "Y = K^Y", formula: "K^Y", k: true },
  { id: "abs", label: "Y = |Y|", formula: "ABS(Y)" },
  { id: "round_k", label: "Y = Y rounded to K decimals", formula: "ROUND(Y, K)", k: true },
  { id: "zscore", label: "Y = z score of Y within its data set", formula: "STANDARDIZE(Y)" },
  { id: "logit", label: "Y = logit(Y)", formula: "LOGIT(Y)" },
  { id: "probit", label: "Y = probit(Y)", formula: "PROBIT(Y)" },
  { id: "sin", label: "Y = sin(Y)", formula: "SIN(Y)" },
  { id: "cos", label: "Y = cos(Y)", formula: "COS(Y)" },
  { id: "tan", label: "Y = tan(Y)", formula: "TAN(Y)" },
  { id: "arcsin", label: "Y = arcsin(Y)", formula: "ARCSIN(Y)" },
  { id: "gauss_k", label: "Y = Y + Gaussian noise with SD K", formula: "Y + GAUSS(0, K)", k: true },
  { id: "y_times_x", label: "Y = Y × X", formula: "Y*X", xy: true },
  { id: "y_over_x", label: "Y = Y / X", formula: "Y/X", xy: true },
  { id: "x_over_y", label: "Y = X / Y", formula: "X/Y", xy: true },
  { id: "y_minus_x", label: "Y = Y − X", formula: "Y-X", xy: true },
  { id: "x_minus_y", label: "Y = X − Y", formula: "X-Y", xy: true },
  { id: "y_plus_x", label: "Y = Y + X", formula: "Y+X", xy: true },
];

/** Pharmacology and biochemistry plots, as X and Y formulas. */
export const PHARM_FUNCS: { id: string; label: string; x: string; y: string; k?: string; note: string }[] = [
  { id: "eadie_hofstee", label: "Eadie-Hofstee", x: "Y/X", y: "Y",
    note: "X becomes Y/X (velocity over substrate); Y stays velocity." },
  { id: "hanes_woolf", label: "Hanes-Woolf", x: "X", y: "X/Y",
    note: "Y becomes X/Y (substrate over velocity)." },
  { id: "lineweaver_burk", label: "Lineweaver-Burk", x: "1/X", y: "1/Y",
    note: "Double reciprocal: both X and Y become their reciprocals." },
  { id: "log_log", label: "Log-log", x: "LOG(X)", y: "LOG(Y)",
    note: "Base-10 logarithm of both X and Y." },
  { id: "scatchard", label: "Scatchard", x: "Y", y: "Y/X",
    note: "X becomes bound (Y); Y becomes bound/free (Y/X)." },
  { id: "hill", label: "Hill", x: "LOG(X)", y: "LOG(Y/(K-Y))", k: "Ymax",
    note: "X becomes log(X); Y becomes log(Y/(Ymax − Y)). Enter Ymax as K." },
];

/** `info`: hooked to the info-sheet constant of that name; its value is
 *  kept in sync by the shell (project/infoLinks.ts). */
export interface NamedValue { name: string; value: string; info?: string }

export interface TransformOptions {
  mode: "standard" | "pharm" | "user";
  xFunc: string;          // "none" or a BUILTIN_FUNCS id
  xK: string;
  yFunc: string;          // "none", a BUILTIN_FUNCS id or an EXTRA_Y_FUNCS id
  yK: string;
  kPerDataset: boolean;   // a separate Y constant K for each data set
  yKs: string[];
  pharm: string;
  pharmK: string;
  xFormula: string;
  yFormula: string;
  constants: NamedValue[];
  constantsPerDataset: boolean;
  /** [data set][constant] values when constantsPerDataset. */
  constantValues: string[][];
  seed: string;           // for GAUSS / RND, so the table does not change on every recompute
}

export const DEFAULT_TRANSFORM: TransformOptions = {
  mode: "standard",
  xFunc: "none", xK: "1",
  yFunc: "log10", yK: "1",
  kPerDataset: false, yKs: [],
  pharm: "lineweaver_burk", pharmK: "100",
  xFormula: "", yFormula: "Y = Y*K",
  constants: [{ name: "K", value: "2" }],
  constantsPerDataset: false, constantValues: [],
  seed: "1",
};

function num(v: string, what: string): number {
  const n = parseCell(v);
  if (n === null) throw new Error(`Enter a number for ${what}`);
  return n;
}

/** Name -> value for the constants of data set `d`. */
export function constantsFor(o: TransformOptions, d: number | null): Record<string, number> {
  const out: Record<string, number> = {};
  o.constants.forEach((c, i) => {
    const name = c.name.trim();
    if (!name) return;
    const raw = d !== null && o.constantsPerDataset ? (o.constantValues[d]?.[i] ?? c.value) : c.value;
    out[name] = num(raw === "" ? c.value : raw, `constant ${name}`);
  });
  return out;
}

export function runTransform(engine: EngineBridge, table: DataTableModel,
  o: TransformOptions): ManipResult {
  return guard(() => {
    if (table.subcolumnFormat !== "replicates") {
      return fail("Transforms work on replicate values; this table holds summary data (mean / SD / N)");
    }
    if (!hasValues(table)) return { ...numericData(table), notes: [emptyNote] };
    const data = numericData(table);
    const isXY = table.type === "xy";
    const notes: string[] = [];
    let x = data.x;
    let datasets: ApiDataset[] = data.datasets;
    let xTitle: string | undefined;
    let staggered = false;

    if (o.mode === "standard") {
      const yb = BUILTIN_FUNCS.find((f) => f.id === o.yFunc);
      const ye = EXTRA_Y_FUNCS.find((f) => f.id === o.yFunc && (isXY || !f.xy));
      const kOf = (d: number) => num(o.kPerDataset ? (o.yKs[d] || o.yK) : o.yK, "K");
      if (yb) {
        // transform.py: one call, or one per data set when K differs.
        const needK = !!yb.k;
        if (needK && o.kPerDataset) {
          datasets = datasets.map((ds, d) => call(engine, {
            analysis: "transform", data: { x, datasets: [ds] },
            options: { func: yb.id, k: kOf(d), target: "y" },
          }).datasets[0]);
        } else {
          datasets = call(engine, {
            analysis: "transform", data: { x, datasets },
            options: { func: yb.id, k: needK ? kOf(0) : null, target: "y" },
          }).datasets;
        }
      } else if (ye) {
        const r = call(engine, {
          analysis: "formula_transform", data: { x, datasets },
          options: {
            y_formula: `Y = ${ye.formula}`,
            constants: ye.k ? { K: kOf(0) } : {},
            constants_by_dataset: ye.k && o.kPerDataset
              ? datasets.map((_, d) => ({ K: kOf(d) })) : undefined,
            seed: parseCell(o.seed) ?? undefined,
          },
        });
        datasets = r.datasets;
      }
      const xb = isXY ? BUILTIN_FUNCS.find((f) => f.id === o.xFunc) : undefined;
      if (xb) {
        x = call(engine, {
          analysis: "transform", data: { x, datasets: [] },
          options: { func: xb.id, k: xb.k ? num(o.xK, "the X constant K") : null, target: "x" },
        }).x;
        xTitle = xb.x.replace("X = ", "").replace("X", table.xTitle || "X");
      }
      if (!yb && !ye && !xb) notes.push("No function chosen: the output is a copy of the data.");
    } else {
      let xf = "";
      let yf = "";
      let constants: Record<string, number> = {};
      let byDataset: Record<string, number>[] | undefined;
      if (o.mode === "pharm") {
        const f = PHARM_FUNCS.find((p) => p.id === o.pharm) ?? PHARM_FUNCS[0];
        if (!isXY) return fail(`${f.label} transforms need an XY table`);
        xf = f.x === "X" ? "" : `X = ${f.x}`;
        yf = f.y === "Y" ? "" : `Y = ${f.y}`;
        if (f.k) constants = { K: num(o.pharmK, f.k) };
        notes.push(f.note);
      } else {
        xf = isXY ? o.xFormula.trim() : "";
        yf = o.yFormula.trim();
        if (!xf && !yf) return { x, datasets, notes: ["Enter an X or Y formula."] };
        constants = constantsFor(o, null);
        if (o.constantsPerDataset) byDataset = datasets.map((_, d) => constantsFor(o, d));
      }
      const r = call(engine, {
        analysis: "formula_transform", data: { x, datasets },
        options: {
          x_formula: xf || undefined, y_formula: yf || undefined,
          constants, constants_by_dataset: byDataset,
          seed: parseCell(o.seed) ?? undefined,
        },
      });
      x = r.x;
      datasets = r.datasets;
      staggered = !!r.staggered;
      if (xf) xTitle = xf.replace(/^\s*X\s*=\s*/i, "");
    }
    if (staggered) {
      notes.push("The X formula uses Y, so each data set gets its own X values: "
        + "the data sets are staggered down the table.");
    }
    return { x, datasets, notes, xTitle };
  });
}

// --------------------------------------------- Transform concentrations

export interface ConcOptions {
  zero: "blank" | "value" | "auto";
  zeroValue: string;
  units: "none" | "multiply" | "divide";
  factor: string;
  log: "log10" | "ln" | "none";
}

export const DEFAULT_CONC: ConcOptions = {
  zero: "blank", zeroValue: "1e-11", units: "none", factor: "1000", log: "log10",
};

export function runConc(engine: EngineBridge, table: DataTableModel, o: ConcOptions): ManipResult {
  return guard(() => {
    const data = numericData(table);
    const r = call(engine, {
      analysis: "transform_concentrations", data,
      options: {
        zero: o.zero,
        zero_value: o.zero === "value" ? num(o.zeroValue, "the value used for zero") : undefined,
        units: o.units === "none" ? null : o.units,
        factor: o.units === "none" ? undefined : num(o.factor, "the unit factor"),
        log: o.log === "none" ? null : o.log,
      },
    });
    const notes: string[] = [];
    if (r.zero_replacement !== null && r.zero_replacement !== undefined) {
      notes.push(`X = 0 was replaced by ${fmtCell(r.zero_replacement)} before taking logarithms.`);
    } else if (o.log !== "none" && data.x.some((v) => v === 0)) {
      notes.push("X = 0 has no logarithm: those rows have a blank X and are left out of fits.");
    }
    const base = table.xTitle || "X";
    const xTitle = o.log === "log10" ? `log(${base})` : o.log === "ln" ? `ln(${base})` : base;
    return { x: r.x, datasets: r.datasets, notes, xTitle };
  });
}

// ------------------------------------------------------ Remove baseline

export interface BaselineOptions {
  baseline: "column" | "alternate" | "first_row" | "last_row" | "first_rows"
    | "last_rows" | "first_last_rows" | "value";
  baselineDataset: number;
  k: string;
  value: string;
  operation: "subtract" | "divide" | "fraction_difference" | "percent_difference"
    | "percent_of_baseline" | "add" | "multiply";
  replicates: "mean" | "each";
  pairs: "total_first" | "baseline_first";
  linearBaseline: boolean;
}

export const DEFAULT_BASELINE: BaselineOptions = {
  baseline: "first_row", baselineDataset: 0, k: "2", value: "0",
  operation: "subtract", replicates: "mean", pairs: "total_first", linearBaseline: false,
};

export function runBaseline(engine: EngineBridge, table: DataTableModel,
  o: BaselineOptions): ManipResult {
  return guard(() => {
    if (!hasValues(table)) return { ...numericData(table), notes: [emptyNote] };
    const r = call(engine, {
      analysis: "remove_baseline", data: numericData(table),
      options: {
        baseline: o.baseline,
        baseline_dataset: o.baselineDataset,
        k: Math.max(1, Math.round(num(o.k, "the number of rows"))),
        value: o.baseline === "value" ? num(o.value, "the baseline value") : undefined,
        operation: o.operation,
        replicates: o.replicates,
        pairs: o.pairs,
        linear_baseline: o.linearBaseline && table.type === "xy",
      },
    });
    const notes: string[] = [];
    if (o.baseline === "column" || o.baseline === "alternate") {
      notes.push("Baseline data sets are left out of the output table.");
    }
    return { x: r.x, datasets: r.datasets, notes,
      extra: r.baseline_lines ? { baselineLines: r.baseline_lines } : undefined };
  });
}

// ------------------------------------------------------------ Normalize

export interface NormalizeOptions {
  zeroMode: "smallest" | "first" | "value";
  zeroValue: string;
  hundredMode: "largest" | "last" | "value" | "sum";
  hundredValue: string;
  asPercent: boolean;
  subcolumns: "mean" | "separate";
}

export const DEFAULT_NORMALIZE: NormalizeOptions = {
  zeroMode: "smallest", zeroValue: "0", hundredMode: "largest", hundredValue: "100",
  asPercent: true, subcolumns: "mean",
};

export function runNormalize(engine: EngineBridge, table: DataTableModel,
  o: NormalizeOptions): ManipResult {
  return guard(() => {
    if (!hasValues(table)) return { ...numericData(table), notes: [emptyNote] };
    const data = numericData(table);
    const r = call(engine, {
      analysis: "normalize", data,
      options: {
        zero_mode: o.zeroMode,
        zero_value: o.zeroMode === "value" ? num(o.zeroValue, "0%") : 0,
        hundred_mode: o.hundredMode,
        hundred_value: o.hundredMode === "value" ? num(o.hundredValue, "100%") : 100,
        as_percent: o.asPercent,
        subcolumns: o.subcolumns,
      },
    });
    return { x: data.x, datasets: r.datasets, notes: [],
      yTitle: o.asPercent ? "Normalized response (%)" : "Normalized response" };
  });
}

// ------------------------------------------------------------ Transpose

export interface TransposeOptions {
  columnTitles: "row_titles" | "x" | "numbers";
  replicates: "keep" | "mean";
  outputType: "same" | "xy" | "column" | "grouped";
}

export const DEFAULT_TRANSPOSE: TransposeOptions = {
  columnTitles: "row_titles", replicates: "keep", outputType: "same",
};

export function runTranspose(engine: EngineBridge, table: DataTableModel,
  o: TransposeOptions): ManipResult {
  return guard(() => {
    const data = numericData(table);
    const r = call(engine, {
      analysis: "transpose",
      data: { ...data, row_titles: table.rowTitles },
      options: { column_titles: o.columnTitles, replicates: o.replicates },
    });
    const outputType = o.outputType === "same" ? table.type : o.outputType;
    return {
      x: r.x, datasets: r.datasets, rowTitles: r.row_titles, notes: [
        `${table.datasets.length} data set${table.datasets.length === 1 ? "" : "s"} became `
        + `${r.x.length} row${r.x.length === 1 ? "" : "s"}; ${r.datasets.length} `
        + `row${r.datasets.length === 1 ? "" : "s"} became data sets.`,
      ],
      outputType, xTitle: outputType === "xy" ? "Data set" : "",
    };
  });
}

// ------------------------------------------------------------ Prune rows

export interface PruneOptions {
  useRange: boolean;
  xMin: string;
  xMax: string;
  mode: "none" | "keep_every" | "average";
  k: string;
  start: string;
  average: "keep_replicates" | "mean";
  partial: "keep" | "drop";
}

export const DEFAULT_PRUNE: PruneOptions = {
  useRange: false, xMin: "", xMax: "", mode: "keep_every", k: "2", start: "1",
  average: "keep_replicates", partial: "keep",
};

export function runPrune(engine: EngineBridge, table: DataTableModel, o: PruneOptions): ManipResult {
  return guard(() => {
    const data = numericData(table);
    const range = o.useRange && table.type === "xy";
    const r = call(engine, {
      analysis: "prune_rows",
      data: { ...data, row_titles: table.rowTitles },
      options: {
        x_min: range ? parseCell(o.xMin) : null,
        x_max: range ? parseCell(o.xMax) : null,
        mode: o.mode,
        k: Math.max(1, Math.round(num(o.k, "K"))),
        start: Math.max(1, Math.round(num(o.start, "the first row"))),
        average: o.average,
        partial: o.partial,
      },
    });
    const kept = (r.x as Num[]).length;
    return {
      x: r.x, datasets: r.datasets, rowTitles: r.row_titles,
      notes: [`${kept} of ${table.x.length} rows remain.`],
    };
  });
}

// ----------------------------------------------------- Fraction of total

export interface FractionOptions {
  divideBy: "column" | "row" | "grand";
  asPercent: boolean;
  ci: boolean;
  ciMethod: "wilson_brown" | "wilson" | "clopper_pearson";
  ciLevel: string;   // percent
}

export const DEFAULT_FRACTION: FractionOptions = {
  divideBy: "column", asPercent: false, ci: false, ciMethod: "wilson_brown", ciLevel: "95",
};

export function runFraction(engine: EngineBridge, table: DataTableModel,
  o: FractionOptions): ManipResult {
  return guard(() => {
    if (table.datasets.some((d) => (d.rows[0]?.length ?? 1) > 1)) {
      return fail("Fraction of total works on tables without subcolumns (one value per cell)");
    }
    const data = numericData(table);
    const level = num(o.ciLevel, "the confidence level") / 100;
    const r = call(engine, {
      analysis: "fraction_of_total_table", data,
      options: {
        divide_by: o.divideBy, as_percent: o.asPercent, ci: o.ci,
        ci_method: o.ciMethod, ci_level: level,
      },
    });
    return {
      x: data.x,
      datasets: r.datasets.map((d: any) => ({ name: d.name, ys: d.ys })),
      notes: [],
      yTitle: o.asPercent ? "Percent of total" : "Fraction of total",
      extra: {
        columnTotals: r.column_totals, rowTotals: r.row_totals, grandTotal: r.grand_total,
        ci: o.ci ? r.datasets.map((d: any) => ({ lower: d.ci_lower, upper: d.ci_upper })) : null,
      },
    };
  });
}
