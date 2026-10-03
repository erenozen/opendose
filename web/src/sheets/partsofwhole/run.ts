// Parts-of-whole analyses: engine payloads and option types. Pure (no
// React, no engine import) so the payload builders are unit-tested with
// node --test; see __tests__/run.test.ts.
//
// Engine handlers (engine/opendose/api.py): "chisq_goodness_of_fit"
// {datasets: [{name, values}], row_titles} + {dataset, expected,
// expected_as}; "fraction_of_total" {datasets: [{name, values}]} +
// {divide_by, as_percent, ci, ci_method, ci_level}.
import { parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

/** The slice of EngineBridge the analyses need. */
export interface Engine { analyze: (payload: unknown) => unknown }

export const ANALYSIS_FRACTION = "fraction_of_total";
export const ANALYSIS_GOF = "chisq_goodness_of_fit";

export const GRAPH_PIE = "pow_pie";
export const GRAPH_DONUT = "pow_donut";
export const GRAPH_STACKED = "pow_stacked";
export const GRAPH_STACKED100 = "pow_stacked100";

/** Automatic titles. Pie / donut have no axes: their Y title field is the
 *  chart title, which defaults to the data set's name. */
export function powAutoTitles(graphType: string) {
  return (table: DataTableModel) => {
    if (graphType === GRAPH_STACKED100) return { x: "", y: "Percent of total" };
    if (graphType === GRAPH_STACKED) return { x: "", y: table.yTitle || "Value" };
    return { x: "", y: "" };
  };
}

// ------------------------------------------------------------- shared

/** Row titles as the analyses and graphs label them. */
export function partNames(t: DataTableModel): string[] {
  return t.x.map((_, r) => t.rowTitles[r]?.trim() || `Part ${r + 1}`);
}

export function datasetName(t: DataTableModel, d: number): string {
  return t.datasets[d]?.name?.trim() || `Column ${d + 1}`;
}

/** One number per row of dataset `d` (first subcolumn), excluded → null. */
export function columnValues(t: DataTableModel, d: number): (number | null)[] {
  const b = withExclusionsBlanked(t);
  const ds = b.datasets[d];
  return b.x.map((_, r) => (ds ? parseCell(ds.rows[r]?.[0] ?? "") : null));
}

// ------------------------------------------------ chi-square goodness of fit

export type ExpectedAs = "counts" | "percent" | "fraction";

export const EXPECTED_AS_LABELS: Record<ExpectedAs, string> = {
  percent: "Percentages (sum to 100)",
  fraction: "Fractions (sum to 1)",
  counts: "Counts (sum to the observed total)",
};

export interface GofOptions {
  dataset: number;
  /** "equal": every category equally likely; "entered": the column below. */
  expectedMode: "equal" | "entered";
  expectedAs: ExpectedAs;
  /** One raw entry per row of the table. */
  expected: string[];
}

export const DEFAULT_GOF: GofOptions = {
  dataset: 0, expectedMode: "equal", expectedAs: "percent", expected: [],
};

export function normalizeGof(raw: unknown): GofOptions {
  const o = raw && typeof raw === "object" ? raw as Partial<GofOptions> : {};
  return {
    dataset: Number.isInteger(o.dataset) && (o.dataset as number) >= 0 ? o.dataset as number : 0,
    expectedMode: o.expectedMode === "entered" ? "entered" : "equal",
    expectedAs: o.expectedAs === "counts" || o.expectedAs === "fraction"
      ? o.expectedAs : "percent",
    expected: Array.isArray(o.expected) ? o.expected.map((v) => String(v ?? "")) : [],
  };
}

/** Equal expected values for the rows in `rows`, in the entered form. */
export function equalExpected(t: DataTableModel, o: GofOptions): string[] {
  const obs = columnValues(t, o.dataset);
  const rows = obs.map((v, r) => (v !== null ? r : -1)).filter((r) => r >= 0);
  const use = rows.length ? rows : t.x.map((_, r) => r);
  const k = use.length;
  const total = obs.reduce<number>((a, v) => a + (v ?? 0), 0);
  const each = o.expectedAs === "percent" ? 100 / k
    : o.expectedAs === "fraction" ? 1 / k
      : (total > 0 ? total / k : 1);
  const text = String(Number(each.toPrecision(6)));
  return t.x.map((_, r) => (use.includes(r) ? text : (o.expected[r] ?? "")));
}

export type Built = { payload: unknown; error?: undefined } | { payload?: undefined; error: string };

export function gofPayload(t: DataTableModel, o: GofOptions): Built {
  if (!t.datasets.length) return { error: "The table has no data columns" };
  const d = Math.min(o.dataset, t.datasets.length - 1);
  const obs = columnValues(t, d);
  const names = partNames(t);
  const kept = obs.map((v, r) => (v !== null ? r : -1)).filter((r) => r >= 0);
  if (kept.length < 2) {
    return { error: `Enter observed counts in at least two rows of "${datasetName(t, d)}"` };
  }
  if (kept.some((r) => (obs[r] as number) < 0)) {
    return { error: "Observed counts cannot be negative" };
  }
  let expected: number[];
  let expectedAs: ExpectedAs | "counts" = o.expectedAs;
  if (o.expectedMode === "equal") {
    expected = obs.map(() => 1);
    expectedAs = "counts";
  } else {
    const parsed = t.x.map((_, r) => parseCell(o.expected[r] ?? ""));
    const missing = kept.filter((r) => parsed[r] === null).map((r) => names[r]);
    if (missing.length) {
      return { error: `Enter an expected value for ${missing.join(", ")}` };
    }
    if (kept.some((r) => (parsed[r] as number) <= 0)) {
      return { error: "Every expected value must be greater than zero" };
    }
    expected = parsed.map((v) => v ?? 0);
  }
  return {
    payload: {
      analysis: "chisq_goodness_of_fit",
      data: {
        datasets: [{ name: datasetName(t, d), values: obs }],
        row_titles: names,
      },
      options: { dataset: 0, expected, expected_as: expectedAs },
    },
  };
}

export function runGof(engine: Engine, t: DataTableModel, o: GofOptions):
  Record<string, unknown> {
  const b = gofPayload(t, o);
  if (b.error !== undefined) return { error: b.error };
  return engine.analyze(b.payload) as Record<string, unknown>;
}

// ---------------------------------------------------------- fraction of total

export type DivideBy = "column" | "row" | "grand";
export type CIMethodPow = "wilson_brown" | "wilson" | "clopper_pearson";

export const DIVIDE_BY_LABELS: Record<DivideBy, string> = {
  column: "Column total",
  row: "Row total",
  grand: "Grand total",
};

export const CI_METHOD_LABELS: Record<CIMethodPow, string> = {
  wilson_brown: "Wilson/Brown (recommended)",
  wilson: "Wilson",
  clopper_pearson: "Clopper-Pearson (exact)",
};

export interface FractionOptions {
  divideBy: DivideBy;
  asPercent: boolean;
  ci: boolean;
  ciMethod: CIMethodPow;
  ciLevel: number;
}

export const DEFAULT_FRACTION: FractionOptions = {
  divideBy: "column", asPercent: true, ci: false,
  ciMethod: "wilson_brown", ciLevel: 0.95,
};

export function normalizeFraction(raw: unknown): FractionOptions {
  const o = raw && typeof raw === "object" ? raw as Partial<FractionOptions> : {};
  return {
    divideBy: o.divideBy === "row" || o.divideBy === "grand" ? o.divideBy : "column",
    asPercent: typeof o.asPercent === "boolean" ? o.asPercent : DEFAULT_FRACTION.asPercent,
    ci: o.ci === true,
    ciMethod: o.ciMethod === "wilson" || o.ciMethod === "clopper_pearson"
      ? o.ciMethod : "wilson_brown",
    ciLevel: typeof o.ciLevel === "number" && o.ciLevel > 0.5 && o.ciLevel < 1
      ? o.ciLevel : 0.95,
  };
}

export function fractionPayload(t: DataTableModel, o: FractionOptions): Built {
  const columns = t.datasets.map((_, d) => columnValues(t, d));
  if (!columns.some((c) => c.some((v) => v !== null))) {
    return { error: "Enter values to compute fractions of the total" };
  }
  return {
    payload: {
      analysis: "fraction_of_total",
      data: {
        datasets: t.datasets.map((_, d) => ({
          name: datasetName(t, d), values: columns[d],
        })),
      },
      options: {
        divide_by: o.divideBy, as_percent: o.asPercent, ci: o.ci,
        ci_method: o.ciMethod, ci_level: o.ciLevel,
      },
    },
  };
}

export function runFraction(engine: Engine, t: DataTableModel, o: FractionOptions):
  Record<string, unknown> {
  const b = fractionPayload(t, o);
  if (b.error !== undefined) return { error: b.error };
  return engine.analyze(b.payload) as Record<string, unknown>;
}
