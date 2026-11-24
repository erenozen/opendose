// Assay precision on a nested table (P-94): the columns are days and
// their subcolumns runs, replicates down the rows (CLSI EP05: 20 days x 2
// runs x 2 replicates); when every column has a single subcolumn the
// columns are the runs. Engine handler precision_study
// (engine/opendose/precision.py). Pure: unit-tested in
// __tests__/precision.test.ts.
import { parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const ANALYSIS_NESTED_PRECISION = "nested_precision";

export interface NestedPrecisionOptions {
  /** Nominal (known) concentration for recovery; "" = none. */
  nominal: string;
  recoveryLimit: number;
  cvLimit: number;
  ciLevel: number;
}

export const DEFAULT_NESTED_PRECISION: NestedPrecisionOptions = {
  nominal: "", recoveryLimit: 15, cvLimit: 15, ciLevel: 0.95,
};

export function normalizeNestedPrecision(raw: unknown): NestedPrecisionOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pos = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
  return {
    nominal: typeof o.nominal === "string" ? o.nominal : "",
    recoveryLimit: pos(o.recoveryLimit, 15), cvLimit: pos(o.cvLimit, 15),
    ciLevel: typeof o.ciLevel === "number" && o.ciLevel > 0.5 && o.ciLevel < 1 ? o.ciLevel : 0.95,
  };
}

/** "days": columns are days, subcolumns runs; "runs": columns are runs. */
export function precisionLayout(t: DataTableModel): "days" | "runs" {
  return t.datasets.every((d) => Math.max(1, ...d.rows.map((r) => r.length)) <= 1) ? "runs" : "days";
}

export type Built = { payload: Record<string, unknown>; error?: undefined }
  | { payload?: undefined; error: string };

export function nestedPrecisionPayload(table: DataTableModel, o: NestedPrecisionOptions): Built {
  const t = withExclusionsBlanked(table);
  const layout = precisionLayout(t);
  const values: number[] = [];
  const runs: string[] = [];
  const days: string[] = [];
  t.datasets.forEach((d, c) => {
    const col = d.name || `Column ${c + 1}`;
    const width = Math.max(1, ...d.rows.map((r) => r.length));
    for (let s = 0; s < width; s++) {
      const sub = d.subTitles?.[s]?.trim() || `Run ${s + 1}`;
      for (const row of d.rows) {
        const v = parseCell(row[s] ?? "");
        if (v === null) continue;
        values.push(v);
        runs.push(layout === "runs" ? col : sub);
        days.push(col);
      }
    }
  });
  if (!values.length) return { error: "Enter replicate values: one column per day, one subcolumn per run" };
  const nominal = o.nominal.trim() === "" ? null : parseCell(o.nominal);
  if (o.nominal.trim() !== "" && (nominal === null || nominal <= 0)) {
    return { error: "Enter the nominal concentration as a number above 0, or leave it empty" };
  }
  return {
    payload: {
      analysis: "precision_study",
      data: { samples: [{ name: table.yTitle?.trim() || "All values", values, runs,
        ...(layout === "days" ? { days } : {}), ...(nominal !== null ? { nominal } : {}) }] },
      options: { recovery_limit: o.recoveryLimit, cv_limit: o.cvLimit, ci_level: o.ciLevel },
    },
  };
}

export interface Engine { analyze: (payload: unknown) => unknown }

export function runNestedPrecision(engine: Engine, table: DataTableModel, o: NestedPrecisionOptions):
  Record<string, unknown> {
  const b = nestedPrecisionPayload(table, o);
  if (b.error !== undefined) return { error: b.error };
  const r = engine.analyze(b.payload) as Record<string, unknown>;
  if (r && !r.error) return { ...r, layout: precisionLayout(table) };
  return r;
}
