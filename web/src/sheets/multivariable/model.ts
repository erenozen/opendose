// Multiple-variables tables as the engine sees them, plus the option
// shapes and defaults of every analysis on them. Pure (no React, no DOM),
// so it is unit-tested with node --test (see __tests__/model.test.ts).
//
// Table layout: one dataset per variable, one row per observation, a
// single subcolumn; `varType` says continuous or categorical. Row titles
// are optional observation labels (subject IDs).
import { datasetLetter, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel, VarType } from "../../project/types.ts";

export type MvValue = number | string | null;

/** One variable in the engine's multiple-variables payload. */
export interface MvVariable {
  name: string;
  kind: VarType;
  values: MvValue[];
}

export function variableName(t: DataTableModel, i: number): string {
  return t.datasets[i]?.name.trim() || `Variable ${datasetLetter(i)}`;
}

/** Engine payload `data.variables`: excluded cells blank, continuous cells
 *  parsed as numbers (text that is not a number counts as missing),
 *  categorical cells trimmed text. */
export function mvVariables(table: DataTableModel): MvVariable[] {
  const t = withExclusionsBlanked(table);
  return t.datasets.map((d, i) => {
    const kind: VarType = d.varType ?? "continuous";
    const values = d.rows.map((row): MvValue => {
      const raw = (row[0] ?? "").trim();
      if (raw === "") return null;
      if (kind === "categorical") return raw;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    });
    return { name: variableName(t, i), kind, values };
  });
}

export function mvPayload(table: DataTableModel): { variables: MvVariable[] } {
  return { variables: mvVariables(table) };
}

export interface VarInfo {
  name: string;
  kind: VarType;
  /** Values present (not blank / not excluded). */
  n: number;
  /** Categorical: levels in order of first appearance. Continuous with at
   *  most two distinct values: those values as text. */
  levels: string[];
  /** Two distinct values: 0/1 numbers or two text levels. */
  binary: boolean;
}

export function variableInfo(table: DataTableModel): VarInfo[] {
  return mvVariables(table).map((v) => {
    const present = v.values.filter((x): x is number | string => x !== null);
    const distinct: string[] = [];
    for (const x of present) {
      const s = String(x);
      if (!distinct.includes(s)) distinct.push(s);
      if (v.kind === "continuous" && distinct.length > 2) break;
    }
    const binary = v.kind === "categorical"
      ? distinct.length === 2
      : distinct.length === 2 && distinct.every((s) => s === "0" || s === "1");
    return {
      name: v.name,
      kind: v.kind,
      n: present.length,
      levels: v.kind === "categorical" || distinct.length <= 2 ? distinct : [],
      binary,
    };
  });
}

/** Names that occur more than once (the engine addresses variables by
 *  name, so these must be renamed before analyzing). */
export function duplicateNames(table: DataTableModel): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  table.datasets.forEach((_, i) => {
    const n = variableName(table, i);
    if (seen.has(n)) dup.add(n);
    seen.add(n);
  });
  return [...dup];
}

/** Label of observation `r`: its row title, else "Row r+1". */
export function rowLabel(table: DataTableModel, r: number): string {
  return table.rowTitles[r]?.trim() || `Row ${r + 1}`;
}

// ------------------------------------------------------------ options

export interface DescriptiveOptions { ciLevel: string }

export type CorrMethod = "pearson" | "spearman";
export interface CorrelationOptions {
  /** Variables to include; empty = every continuous variable. */
  variables: string[];
  method: CorrMethod;
  missing: "pairwise" | "listwise";
  tails: 1 | 2;
  ciLevel: string;
}

export interface RegressionOptions {
  outcome: string;
  predictors: string[];
  interactions: [string, string][];
  /** Categorical predictor -> reference level ("" or missing = first). */
  referenceLevels: Record<string, string>;
  ciLevel: string;
}

export interface LogisticOptions extends RegressionOptions {
  /** Level of a text outcome counted as 1 ("" = the second level seen). */
  positiveLevel: string;
  ciMethod: "profile" | "wald";
  cutoff: string;
  hlGroups: string;
}

export type PcaSelection =
  | "parallel_analysis" | "kaiser" | "variance" | "all" | "number";
export interface PcaOptions {
  variables: string[];       // empty = every continuous variable
  standardize: boolean;
  selection: PcaSelection;
  nComponents: string;
  varianceThreshold: string;
  nSimulations: string;
  percentile: string;
  seed: string;
}

export type FilterOp =
  | "==" | "!=" | "<" | "<=" | ">" | ">=" | "between" | "in" | "not_in"
  | "is_missing" | "not_missing";
export interface RowFilter { variable: string; op: FilterOp; value: string }
export type TransformFunc =
  | "log10" | "ln" | "sqrt" | "square" | "reciprocal" | "center" | "zscore"
  | "rank";
export interface VarTransform { variable: string; func: TransformFunc; newName: string }
export interface RearrangeOptions {
  select: string[];          // empty = every variable, in table order
  filters: RowFilter[];
  combine: "and" | "or";
  transforms: VarTransform[];
  tableName: string;         // "" = automatic
}

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  "==": "equals", "!=": "does not equal", "<": "is less than",
  "<=": "is at most", ">": "is greater than", ">=": "is at least",
  between: "is between", in: "is one of", not_in: "is none of",
  is_missing: "is blank", not_missing: "is not blank",
};

export const TRANSFORM_LABELS: Record<TransformFunc, string> = {
  log10: "log10(X)", ln: "ln(X)", sqrt: "√X", square: "X²",
  reciprocal: "1/X", center: "X − mean", zscore: "z score (X − mean)/SD",
  rank: "rank",
};

/** Text inputs holding a number, falling back when blank or invalid. */
export function num(s: string, fallback: number): number {
  const n = Number(String(s).trim());
  return String(s).trim() !== "" && Number.isFinite(n) ? n : fallback;
}

/** "95" (percent) -> 0.95, clamped to a sensible range. */
export function ciFraction(s: string): number {
  const v = num(s, 95);
  const pct = v < 1 ? v * 100 : v;
  return Math.min(99.99, Math.max(50, pct)) / 100;
}

const nonBinaryContinuous = (info: VarInfo[]) =>
  info.filter((v) => v.kind === "continuous" && !v.binary);

/** Outcome a regression starts with: the last continuous variable with
 *  more than two values (binary columns are logistic outcomes). */
function defaultOutcome(info: VarInfo[]): string {
  const c = nonBinaryContinuous(info);
  return c[c.length - 1]?.name
    ?? info.filter((v) => v.kind === "continuous").pop()?.name ?? "";
}

export function defaultDescriptive(): DescriptiveOptions {
  return { ciLevel: "95" };
}

export function defaultCorrelation(): CorrelationOptions {
  return { variables: [], method: "pearson", missing: "pairwise", tails: 2, ciLevel: "95" };
}

export function defaultRegression(t: DataTableModel): RegressionOptions {
  const info = variableInfo(t);
  const outcome = defaultOutcome(info);
  return {
    outcome,
    predictors: info.filter((v) => v.name !== outcome && !(v.kind === "continuous" && v.binary))
      .map((v) => v.name),
    interactions: [],
    referenceLevels: {},
    ciLevel: "95",
  };
}

export function defaultLogistic(t: DataTableModel): LogisticOptions {
  const info = variableInfo(t);
  // Prefer a 0/1 column, then a two-level text column, as the outcome.
  const outcome = info.filter((v) => v.binary && v.kind === "continuous").pop()?.name
    ?? info.filter((v) => v.binary).pop()?.name ?? "";
  // One continuous predictor: the fit can then be drawn as a curve.
  const first = nonBinaryContinuous(info).find((v) => v.name !== outcome);
  return {
    outcome,
    predictors: first ? [first.name] : [],
    interactions: [],
    referenceLevels: {},
    ciLevel: "95",
    positiveLevel: "",
    ciMethod: "profile",
    cutoff: "0.5",
    hlGroups: "10",
  };
}

export function defaultPca(): PcaOptions {
  return {
    variables: [], standardize: true, selection: "parallel_analysis",
    nComponents: "2", varianceThreshold: "75", nSimulations: "1000",
    percentile: "95", seed: "0",
  };
}

export function defaultRearrange(): RearrangeOptions {
  return { select: [], filters: [], combine: "and", transforms: [], tableName: "" };
}

/** Merge stored options over defaults, keeping only well-typed fields. */
export function mergeOptions<O extends object>(defaults: O, raw: unknown): O {
  if (!raw || typeof raw !== "object") return defaults;
  const out = { ...defaults } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const d = out[k];
    if (Array.isArray(d) ? Array.isArray(v)
      : d !== null && typeof d === "object" ? v && typeof v === "object" && !Array.isArray(v)
        : typeof v === typeof d) {
      out[k] = v;
    }
  }
  return out as O;
}

// ------------------------------------------------------------ payloads

const keepKnown = (names: string[], known: Set<string>) =>
  names.filter((n) => known.has(n));

/** Engine options for multiple_regression / logistic_regression, with
 *  names that no longer exist in the table dropped. Returns an error
 *  string when the model cannot be specified. */
export function regressionPayload(t: DataTableModel, o: RegressionOptions):
  { error: string } | { options: Record<string, unknown> } {
  const info = variableInfo(t);
  const known = new Set(info.map((v) => v.name));
  if (!o.outcome || !known.has(o.outcome)) {
    return { error: "Choose the outcome (dependent) variable" };
  }
  const predictors = keepKnown(o.predictors, known).filter((p) => p !== o.outcome);
  if (!predictors.length) return { error: "Choose at least one predictor variable" };
  const interactions = o.interactions.filter(([a, b]) =>
    a !== b && predictors.includes(a) && predictors.includes(b));
  const referenceLevels: Record<string, string> = {};
  for (const p of predictors) {
    const v = info.find((x) => x.name === p);
    const ref = o.referenceLevels[p];
    if (v?.kind === "categorical" && ref && v.levels.includes(ref)) referenceLevels[p] = ref;
  }
  return {
    options: {
      outcome: o.outcome, predictors, interactions,
      reference_levels: referenceLevels, ci_level: ciFraction(o.ciLevel),
    },
  };
}

export function rearrangePayload(t: DataTableModel, o: RearrangeOptions):
  Record<string, unknown> {
  const known = new Set(variableInfo(t).map((v) => v.name));
  const transforms = o.transforms.filter((tr) => known.has(tr.variable))
    .map((tr) => ({ variable: tr.variable, func: tr.func,
      new_name: tr.newName.trim() || undefined }));
  for (const tr of transforms) if (tr.new_name) known.add(tr.new_name);
  // Values go as text; the engine reads them as numbers for continuous
  // variables. A condition still missing its value is skipped.
  const filters = o.filters.filter((f) => known.has(f.variable)).flatMap(
    (f): Record<string, unknown>[] => {
    if (f.op === "is_missing" || f.op === "not_missing") {
      return [{ variable: f.variable, op: f.op }];
    }
    if (f.op === "between" || f.op === "in" || f.op === "not_in") {
      const parts = f.value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (f.op === "between" ? parts.length !== 2 : !parts.length) return [];
      return [{ variable: f.variable, op: f.op, value: parts }];
    }
    const v = f.value.trim();
    return v ? [{ variable: f.variable, op: f.op, value: v }] : [];
  });
  return {
    select: keepKnown(o.select, known),
    filters,
    combine: o.combine,
    transforms,
  };
}

/** A new multiple-variables table from an mv_rearrange result. Row titles
 *  of the kept rows travel along. */
export function tableFromRearranged(source: DataTableModel,
  result: { rows: number[]; variables: MvVariable[] }): DataTableModel {
  const nRows = Math.max(1, result.rows.length);
  const cell = (v: MvValue | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    type: "multivariable",
    x: Array<string>(nRows).fill(""),
    xTitle: "",
    xFormat: "numbers",
    xUnit: "",
    yTitle: "",
    rowTitles: Array.from({ length: nRows }, (_, i) =>
      result.rows[i] !== undefined ? source.rowTitles[result.rows[i]] ?? "" : ""),
    datasets: result.variables.map((v) => ({
      name: v.name,
      varType: v.kind,
      rows: Array.from({ length: nRows }, (_, i) => [cell(v.values[i])]),
    })),
    subcolumnFormat: "replicates",
    replicateLayout: "side_by_side",
  };
}

// ------------------------------------------------------------ geometry

/** Points on the ellipse that covers `level` of a bivariate normal
 *  population with the sample mean and covariance of (xs, ys): the
 *  chi-square(2) contour of the Mahalanobis distance. */
export function dataEllipse(xs: number[], ys: number[], level = 0.95, steps = 72):
  { x: number[]; y: number[] } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0; let syy = 0; let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
  if (!(sxx > 0) || !(syy > 0)) return null;
  // eigen decomposition of the 2x2 covariance matrix
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(tr * tr / 4 - det, 0));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(tr / 2 - disc, 0);
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const q = -2 * Math.log(1 - level); // chi-square(2) quantile
  const a = Math.sqrt(q * l1);
  const b = Math.sqrt(q * l2);
  const x: number[] = [];
  const y: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = (2 * Math.PI * k) / steps;
    const ex = a * Math.cos(t);
    const ey = b * Math.sin(t);
    x.push(mx + ex * Math.cos(theta) - ey * Math.sin(theta));
    y.push(my + ex * Math.sin(theta) + ey * Math.cos(theta));
  }
  return { x, y };
}

/** Convex hull (Andrew's monotone chain), closed (first point repeated). */
export function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.length ? [...hull, hull[0]] : hull;
}

export function meanSd(v: number[]): { mean: number; sd: number; n: number } {
  const n = v.length;
  const mean = n ? v.reduce((a, b) => a + b, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n };
}

/** PC scores of every complete row from a PCA result (all components,
 *  not only the selected ones): z = (x - mean) / sd (or centered only)
 *  times the eigenvectors. Rows with a blank are null. */
export function pcaScores(table: DataTableModel, r: {
  names: string[]; means: number[]; sds: number[]; standardized: boolean;
  eigenvectors: number[][];
}): (number[] | null)[] {
  const vars = mvVariables(table);
  const cols = r.names.map((nm) => vars.find((v) => v.name === nm)?.values ?? []);
  const nRows = table.x.length;
  const k = r.eigenvectors[0]?.length ?? 0;
  return Array.from({ length: nRows }, (_, i) => {
    const z: number[] = [];
    for (let j = 0; j < cols.length; j++) {
      const v = cols[j][i];
      if (typeof v !== "number") return null;
      const c = v - r.means[j];
      z.push(r.standardized ? c / r.sds[j] : c);
    }
    return Array.from({ length: k }, (_, pc) =>
      z.reduce((acc, zj, j) => acc + zj * r.eigenvectors[j][pc], 0));
  });
}
