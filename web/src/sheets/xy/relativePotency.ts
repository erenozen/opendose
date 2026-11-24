// "Relative potency" (Compare fits, P-100): a test sample against a
// reference standard from parallel curves, through the engine's
// `relative_potency` handler (engine/opendose/relpotency.py). The two
// data sets are fitted with every parameter shared but the potency (the
// parallel model) and with every parameter separate; parallelism is
// judged by the extra-sum-of-squares F test and, when the user has set
// margins, by equivalence (the 90% CI of each difference, or of the slope
// ratio, inside its margin: USP <1032>/<1034>; Hauck et al. 2005); the
// relative potency EC50_reference / EC50_test comes with Fieller's CI.
// Pure: unit-tested with node --test.
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { formatPValue } from "../../report/pformat.ts";
import { formatSig } from "../../types.ts";
import type { ModelMeta } from "../../lib/modelLibrary.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const POTENCY_SOURCES = "Finney 1978, Statistical Method in Biological Assay, ch. 3–4; "
  + "USP <1032> and <1034>; Hauck et al. 2005, PDA J Pharm Sci Technol 59:127–137; "
  + "Fieller 1954, J R Stat Soc B 16:175";

const POTENCY_PARAMS = ["LogEC50", "LogIC50", "EC50", "IC50"];

/** The parameter whose shift is the potency (null: the model has none). */
export function potencyParameter(m: ModelMeta): string | null {
  return POTENCY_PARAMS.find((p) => (m.parameters ?? m.constrainable).includes(p)) ?? null;
}

/** Library models a parallel-curve assay can use: one curve per sample,
 *  an EC50 or IC50, no typed-in constants. */
export function potencyModel(m: ModelMeta): boolean {
  return !m.globalOnly && !(m.datasetConstants?.length) && !(m.constants?.length)
    && !m.special && !Object.keys(m.paramScope ?? {}).length && potencyParameter(m) !== null;
}

/** One equivalence margin as typed (strings, so a half-typed value stays). */
export interface Margin { lower: string; upper: string }

/** The parameters whose equivalence is judged (every fitted one but the
 *  potency), and how: a slope as a ratio test / reference, the others
 *  as a difference test − reference. */
export function marginParameters(m: ModelMeta, held: Record<string, number>):
  { name: string; kind: "ratio" | "difference" }[] {
  const pot = potencyParameter(m);
  return m.constrainable.filter((p) => p !== pot && !(p in held))
    .map((name) => ({ name, kind: /slope/i.test(name) ? "ratio" : "difference" }));
}

const num = (s: string | undefined): number | null => {
  const t = (s ?? "").trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** The problem with one margin as typed, or null. */
export function marginProblem(mg: Margin | undefined, kind: "ratio" | "difference"): string | null {
  const lo = num(mg?.lower), hi = num(mg?.upper);
  const loTyped = !!mg?.lower?.trim(), hiTyped = !!mg?.upper?.trim();
  if (!loTyped && !hiTyped) return null;
  if ((loTyped && lo === null) || (hiTyped && hi === null)) return "Enter a number";
  if (lo === null || hi === null) return "Enter both limits, or neither";
  if (lo >= hi) return "Enter a lower limit below the upper limit";
  if (kind === "ratio" && lo <= 0) return "A ratio's limits are above 0 (for example 0.8 to 1.25)";
  return null;
}

/** The engine's margins option, or the first problem. */
export function marginsPayload(margins: Record<string, Margin> | undefined,
  params: { name: string; kind: "ratio" | "difference" }[]):
  { margins: Record<string, { lower: number; upper: number }>; error?: string } {
  const out: Record<string, { lower: number; upper: number }> = {};
  for (const p of params) {
    const mg = margins?.[p.name];
    const problem = marginProblem(mg, p.kind);
    if (problem) return { margins: out, error: `Equivalence margin of ${p.name}: ${problem}` };
    const lo = num(mg?.lower), hi = num(mg?.upper);
    if (lo !== null && hi !== null) out[p.name] = { lower: lo, upper: hi };
  }
  return { margins: out };
}

export function normalizeMargins(raw: unknown): Record<string, Margin> {
  const out: Record<string, Margin> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as R)) {
    if (!v || typeof v !== "object") continue;
    const lower = typeof v.lower === "string" ? v.lower : typeof v.lower === "number" ? String(v.lower) : "";
    const upper = typeof v.upper === "string" ? v.upper : typeof v.upper === "number" ? String(v.upper) : "";
    if (lower || upper) out[k] = { lower, upper };
  }
  return out;
}

const ci = (c: unknown) => (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  ? `${formatSig(c[0])} to ${formatSig(c[1])}` : null);

/** The relative potency with its CI, e.g. "0.4254 (95% CI 0.3497 to
 *  0.5161)"; "unbounded" when Fieller's interval has no upper limit. */
export function potencyText(r: R): string {
  const p = r.potency ?? {};
  const level = Math.round(100 * (p.ci_level ?? 0.95));
  const c = ci(p.ci);
  return `${formatSig(p.ratio)} (${level}% CI ${c ?? "unbounded"})`;
}

/** The F test for parallelism, e.g. "F (3, 60) = 2.747, P = 0.0507". */
export function parallelFText(r: R): string | null {
  const f = r.f_test;
  if (!f) return null;
  return `F (${f.dfn}, ${f.dfd}) = ${formatSig(f.F)}, ${formatPValue(f.p)}`;
}

/** Are the curves parallel enough for one potency? "yes" only when
 *  equivalence is shown; "no" when the F test rejects parallelism or an
 *  equivalence margin is missed; "unknown" otherwise (the F test cannot
 *  show parallelism by itself). */
export function parallelVerdict(r: R): "yes" | "no" | "unknown" {
  const eq = r.equivalence?.verdict;
  if (eq === "not_shown" || r.parallel_by_f === false) return "no";
  if (eq === "equivalent") return "yes";
  return "unknown";
}

/** The sentence under the headline that says how far to trust it. */
export function parallelSentence(r: R): string {
  const alpha = r.alpha ?? 0.05;
  const f = r.f_test;
  const eq = r.equivalence?.verdict;
  const parts: string[] = [];
  if (!f) parts.push("Only the potency is fitted, so the curves are parallel by construction.");
  else if (f.p < alpha) {
    parts.push(`The curves are not parallel by the F test (${formatPValue(f.p)}): the ratio of `
      + "EC50s changes with the response level, so report each curve's EC50 instead of one potency.");
  } else {
    parts.push(`The F test finds no evidence against parallelism (${formatPValue(f.p)}), which `
      + "does not show that the curves are parallel.");
  }
  if (eq === "equivalent") parts.push("Every parameter is inside its equivalence margin: the curves are parallel enough for one potency.");
  else if (eq === "not_shown") {
    const out = (r.equivalence.parameters ?? []).filter((p: R) => p.margin && !p.equivalent)
      .map((p: R) => p.name);
    parts.push(`Equivalence is not shown for ${out.join(", ")}: the potency is not a single number for these curves.`);
  } else if (eq === "incomplete") parts.push("Set a margin for every parameter to judge equivalence.");
  else if (f) parts.push("Set equivalence margins to show parallelism.");
  return parts.join(" ");
}

/** Methods text of the relative potency. */
export function potencyMethods(r: R, modelLabel: string): string {
  const p = r.potency ?? {};
  const lin = p.linear ?? "EC50";
  const eq = r.equivalence ?? {};
  const judged = (eq.parameters ?? []).filter((x: R) => x.margin);
  const f = parallelFText(r);
  const level = Math.round(100 * (p.ci_level ?? 0.95));
  const eqLevel = Math.round(100 * (eq.level ?? 0.9));
  const margins = judged.map((x: R) => `${x.name} ${x.kind === "ratio" ? "ratio" : "difference"} `
    + `${formatSig(x.margin[0])} to ${formatSig(x.margin[1])}`).join(", ");
  return `The reference (“${r.reference}”) and test (“${r.test}”) data were fitted together with `
    + `the “${modelLabel}” model, once with every parameter shared except ${p.parameter} (parallel `
    + "curves) and once with every parameter separate. "
    + (f ? `Parallelism was assessed with the extra-sum-of-squares F test (${f})` : "Only the potency was fitted")
    + (judged.length ? ` and by equivalence: the ${eqLevel}% CI of each parameter's difference between `
      + `the curves (the ratio for a slope) had to lie inside margins set in advance (${margins}; USP <1032> `
      + `and <1034>; Hauck et al. 2005)` : "")
    + `. The relative potency (${lin} of the reference / ${lin} of the test) from the parallel fit was `
    + `${formatSig(p.ratio)} (${level}% CI ${ci(p.ci) ?? "unbounded"}, Fieller's method; Finney 1978).`;
}

// ------------------------------------------------------------ engine run

type Engine = { analyze: (p: any) => any };

export interface PotencyInput {
  model: ModelMeta;
  held: Record<string, number>;
  reference: number;
  test: number;
  xIsLog: boolean;
  errorBars: string;
  margins?: Record<string, Margin>;
  extra: Record<string, unknown>;
}

const fail = (error: string) => ({ analysis: "compare_fits", mode: "potency", rows: [], datasets: [], error });

export function runPotency(engine: Engine, table: DataTableModel, i: PotencyInput): R {
  if (!potencyModel(i.model)) {
    return fail("Choose a dose-response model with an EC50 or IC50 (a 4PL, for example)");
  }
  const data = numericData(table);
  const filled = (k: number) => data.datasets[k]?.ys.some((r) => r.some((v) => v !== null));
  if (i.reference === i.test) return fail("Choose two different data sets: a reference and a test sample");
  if (!filled(i.reference) || !filled(i.test)) {
    return fail("Relative potency needs two data sets with values: choose the reference and the test sample");
  }
  const params = marginParameters(i.model, i.held);
  const m = marginsPayload(i.margins, params);
  if (m.error) return fail(m.error);
  const r = engine.analyze({
    analysis: "relative_potency",
    data,
    options: {
      model: i.model.engineId, reference: i.reference, test: i.test, x_is_log: i.xIsLog,
      error_bars: i.errorBars, constraints: i.held,
      ...(Object.keys(m.margins).length ? { margins: m.margins } : {}),
      ...i.extra,
    },
  });
  if (!r || r.error) return fail(String(r?.error ?? "no result"));
  const curves = (fit: R, label: (name: string) => string) => (fit?.datasets ?? []).map((d: R) => ({
    name: d.name, points: d.points, curve: d.curve, label: label(d.name), params: d.params,
  }));
  const par = curves(r.parallel_fit, (n) => `${n}, parallel curves`);
  const sep = curves(r.separate_fit, (n) => `${n}, separate curve`);
  return {
    analysis: "compare_fits", mode: "potency", rows: [], labels: [i.model.label, i.model.label],
    potency: r,
    datasets: par.map((d: R, k: number) => ({
      name: d.name, points: d.points,
      fit: { model: r.model, label: d.label, curve: d.curve, params: {}, param_order: [],
        status: "converged", goodness: r.parallel_fit?.goodness ?? {} },
      altCurves: sep[k] ? [{ label: sep[k].label, curve: sep[k].curve }] : [],
    })),
  };
}
