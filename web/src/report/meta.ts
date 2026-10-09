// Reporting details of a data table: what one n is, how many independent
// experiments, which data were excluded and why, how the sample size was
// decided. Stored on the data sheet (DataSheet.report) so the legend,
// methods text and journal checklists can state them. Pure.

export interface ReportMeta {
  /** What one n counts, as a plural noun: "mice", "wells", "patients". */
  unit?: string;
  /** Independent experiments (biological replicates) behind the data. */
  experiments?: number;
  /** Exclusions and their reasons ("none" is an answer). */
  exclusions?: string;
  /** How the sample size was decided (when no power analysis is in the
   *  project): "based on a pilot study", "resource equation", ... */
  sampleSize?: string;
  /** The answer to "What does each value represent?" (results guidance;
   *  sheets/common/declareUnit.ts), or "dismissed" when the user closed
   *  the question without answering. */
  valueIs?: ValueIs;
}

export type ValueIs = "experiment" | "animal" | "technical" | "cell" | "dismissed";
const VALUE_IS: ValueIs[] = ["experiment", "animal", "technical", "cell", "dismissed"];

const text = (v: unknown, max = 500) =>
  (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Validated reporting details, or undefined when there are none. */
export function parseReportMeta(v: unknown): ReportMeta | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: ReportMeta = {};
  const unit = text(o.unit, 60);
  if (unit) out.unit = unit;
  if (typeof o.experiments === "number" && Number.isInteger(o.experiments)
    && o.experiments > 0 && o.experiments < 10000) out.experiments = o.experiments;
  const ex = text(o.exclusions);
  if (ex) out.exclusions = ex;
  const ss = text(o.sampleSize);
  if (ss) out.sampleSize = ss;
  if (VALUE_IS.includes(o.valueIs as ValueIs)) out.valueIs = o.valueIs as ValueIs;
  return Object.keys(out).length ? out : undefined;
}
