// Reliability ICC (P-44): agreement between raters or instruments as the
// six intraclass correlations of Shrout & Fleiss (1979) with McGraw &
// Wong's (1996) F-based CIs. Column table: one column per rater, one row
// per target (subject, sample), one rating per cell. Pure; engine handler
// icc (engine/opendose/api.py, icc.py).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export const ANALYSIS_ICC = "icc";

export type IccForm = "ICC1" | "ICC2" | "ICC3" | "ICC1k" | "ICC2k" | "ICC3k";

export const ICC_FORMS: IccForm[] = ["ICC1", "ICC2", "ICC3", "ICC1k", "ICC2k", "ICC3k"];

/** The default: two-way random effects, absolute agreement, one rater. */
export const DEFAULT_ICC_FORM: IccForm = "ICC2";

export interface IccFormInfo {
  /** Shrout & Fleiss's name. */
  name: string;
  /** McGraw & Wong's model and type. */
  model: string;
  /** When to use it, one sentence. */
  use: string;
}

export const ICC_INFO: Record<IccForm, IccFormInfo> = {
  ICC1: { name: "ICC(1,1)", model: "One-way random, single rater",
    use: "Each target is rated by a different set of raters, so rater and error cannot be separated." },
  ICC2: { name: "ICC(2,1)", model: "Two-way random, absolute agreement, single rater",
    use: "The same raters rate every target and stand for raters in general; a rater who reads high counts as disagreement." },
  ICC3: { name: "ICC(3,1)", model: "Two-way mixed, consistency, single rater",
    use: "These raters are the only ones of interest and a constant offset between them does not matter." },
  ICC1k: { name: "ICC(1,k)", model: "One-way random, mean of k raters",
    use: "As ICC(1,1), for the mean of the k ratings of each target." },
  ICC2k: { name: "ICC(2,k)", model: "Two-way random, absolute agreement, mean of k raters",
    use: "As ICC(2,1), for the mean of the k ratings: use it when the reported value is that mean." },
  ICC3k: { name: "ICC(3,k)", model: "Two-way mixed, consistency, mean of k raters",
    use: "As ICC(3,1), for the mean of the k ratings." },
};

export interface IccOptions {
  form: IccForm;
  ciLevel: string;
}

export function defaultIccOptions(): IccOptions {
  return { form: DEFAULT_ICC_FORM, ciLevel: "95" };
}

export function normalizeIccOptions(raw: unknown): IccOptions {
  const d = defaultIccOptions();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  return {
    form: ICC_FORMS.includes(r.form as IccForm) ? r.form as IccForm : d.form,
    ciLevel: typeof r.ciLevel === "string" ? r.ciLevel : d.ciLevel,
  };
}

const ciFraction = (s: string) => {
  const n = Number(String(s).trim());
  const v = String(s).trim() !== "" && Number.isFinite(n) ? n : 95;
  return Math.min(0.9999, Math.max(0.5, v > 1 ? v / 100 : v));
};

type Payload = { analysis: string; data: unknown; options: Record<string, unknown> };

export function iccPayload(table: DataTableModel, o: IccOptions): Payload | { error: string } {
  if (table.datasets.length < 2) return { error: "The ICC needs at least two columns: one per rater." };
  if (table.subcolumnFormat !== "replicates") {
    return { error: "The ICC needs the individual ratings, not means with errors." };
  }
  const d = numericData(table);
  return { analysis: ANALYSIS_ICC,
    data: { datasets: d.datasets.map((ds) => ({ name: ds.name, ys: ds.ys })) },
    options: { ci_level: ciFraction(o.ciLevel) } };
}

export interface IccFormResult {
  form: IccForm;
  value: number;
  ci: [number, number] | null;
  model: string;
  type: string;
  unit: "single" | "average";
  F: number;
  df1: number;
  df2: number;
  p: number;
}

export interface IccResult {
  error?: string;
  analysis: "icc";
  n_targets: number;
  k_raters: number;
  ci_level: number;
  forms: IccFormResult[];
  mean_squares: { between_targets: number; between_raters: number; residual: number; within_targets: number };
  df: { targets: number; raters: number; residual: number; within: number };
  raters_F: number | null;
  raters_p: number | null;
  names: string[];
  incomplete_rows: number[];
  warnings?: string[];
  /** options as run */
  options: IccOptions;
}

type Engine = { analyze: (p: unknown) => unknown };

export function runIcc(engine: Engine, table: DataTableModel, o: IccOptions): IccResult {
  const p = iccPayload(table, o);
  if ("error" in p) return { error: p.error } as IccResult;
  const r = engine.analyze(p) as IccResult;
  if (r.error) return { error: String(r.error) } as IccResult;
  return { ...r, options: o };
}

/** The chosen form's row. */
export function chosenForm(r: IccResult): IccFormResult | null {
  return r.forms?.find((f) => f.form === r.options.form) ?? null;
}

/** Name of a form with k filled in: "ICC(2,4)" for four raters. */
export function formName(form: IccForm, k: number): string {
  return ICC_INFO[form].name.replace(",k)", `,${k})`);
}
