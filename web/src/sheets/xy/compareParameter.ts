// "Compare a parameter": one fitted parameter (logEC50 / logIC50, Hill
// slope, Top, ...) between two data sets of an XY table, through the
// engine's `compare_parameter` handler (engine/opendose/compare_params.py):
// the difference B − A with its CI and t test from the two separate fits,
// the ratio B / A (for a log-concentration parameter the antilog of the
// difference: the EC50 / IC50 ratio, i.e. the potency or dose ratio), and
// the comparison of one shared value against separate values by the
// extra-sum-of-squares F test and AICc, as the GraphPad curve-fitting
// guide describes it ("Compare tab: Do the best-fit values of selected
// parameters differ between data sets?"; Motulsky & Christopoulos 2004,
// ch. 27-29). The two data sets are also fitted on their own with
// `dose_response` for the graph and its incomplete-curve flags: when an
// EC50 / IC50 lies beyond the concentrations tested, its value is an
// extrapolation and the ratio is reported as undefined ("IC50 > 1e-5 M"),
// as the guide's "Incomplete dose-response curves" advice asks. Pure:
// unit-tested with node --test.
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { formatPValue, type PStyle } from "../../report/pformat.ts";
import { formatSig } from "../../types.ts";
import type { ModelMeta } from "../../lib/modelLibrary.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Engine = { analyze: (p: any) => any };
type R = Record<string, any>;

/** The GraphPad page the method follows (cited in the results and methods). */
export const COMPARE_PARAMETER_SOURCE = {
  label: "GraphPad Curve Fitting Guide: Compare tab (do the best-fit values of selected "
    + "parameters differ between data sets?)",
  url: "https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_comparing_models_tab.htm",
};
export const MOTULSKY_2004 = "Motulsky & Christopoulos 2004, Fitting Models to Biological Data "
  + "Using Linear and Nonlinear Regression, ch. 27–29";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const MIDPOINT = /^(log)?(ec50|ic50|xmid)$/i;

/** Whether a parameter name is a curve's midpoint (logEC50, LogIC50, EC50 ...). */
export function isMidpoint(name: string): boolean {
  return MIDPOINT.test(name.replace(/_/g, ""));
}

/** Parameters of a model that can be compared: the fitted ones, without
 *  those held constant (a constant has nothing to compare). */
export function comparableParameters(meta: ModelMeta, held: Record<string, number> = {}): string[] {
  return meta.constrainable.filter((p) => !(p in held));
}

/** The parameter a comparison starts with: the saved one when the model
 *  has it, else the midpoint (logEC50 / logIC50), else the first. */
export function defaultParameter(params: string[], saved?: string): string {
  if (saved && params.includes(saved)) return saved;
  return params.find(isMidpoint) ?? params[0] ?? "";
}

/** Data sets with at least one value (index into the table's data sets). */
export function filledDatasets(table: DataTableModel): number[] {
  return numericData(table).datasets.map((d, i) => ({ d, i }))
    .filter(({ d }) => d.ys.some((r) => r.some((v) => v !== null))).map(({ i }) => i);
}

/** The pair to compare: the saved indices when both hold values and differ,
 *  else the first two data sets with values. */
export function datasetPair(table: DataTableModel, a: number, b: number): [number, number] | null {
  const ok = filledDatasets(table);
  if (ok.length < 2) return null;
  const A = ok.includes(a) ? a : ok[0];
  let B = ok.includes(b) && b !== A ? b : ok.find((i) => i !== A)!;
  if (B === A) B = ok.find((i) => i !== A)!;
  return [A, B];
}

export interface ParameterInput {
  model: ModelMeta;
  held: Record<string, number>;
  parameter: string;
  datasetA: number;
  datasetB: number;
  xIsLog: boolean;
  errorBars: string;
}

/** The engine payload of the comparison. */
export function compareParameterPayload(table: DataTableModel, i: ParameterInput): R {
  return {
    analysis: "compare_parameter",
    data: numericData(table),
    options: {
      model: i.model.engineId, parameter: i.parameter, dataset_a: i.datasetA,
      dataset_b: i.datasetB, constraints: i.held, x_is_log: i.xIsLog,
    },
  };
}

/** The incomplete-curve flag of one data set's fit that makes a ratio of
 *  midpoints undefined (EC50 / IC50 beyond the concentrations tested). */
export interface MidpointFlag { name: string; label: string; relation: ">" | "<"; text: string }

/** "IC50 > 1e-5 M" from a fit's range_flags (dose_response), or null. */
export function midpointFlag(name: string, fit: R | null | undefined, unit: string): MidpointFlag | null {
  const f = fit?.range_flags;
  if (!f || f.error || !(f.ec50_above_range || f.ec50_below_range)) return null;
  const relation: ">" | "<" = f.ec50_above_range ? ">" : "<";
  const value = typeof f.report_as === "string" && f.report_as
    ? f.report_as.replace(/^[<>]\s*/, "")
    : isNum(f.report_value) ? formatSig(f.report_value) : "";
  const label = String(f.label ?? "EC50");
  const u = unit.trim();
  return { name, label, relation, text: `${label} ${relation} ${value}${u ? ` ${u}` : ""}` };
}

/** Run the comparison (and the two separate fits for the graph). The
 *  result keeps the compare-fits result shape (analysis "compare_fits",
 *  mode "parameter", per-data-set `datasets` for the XY graph) with the
 *  engine's answer under `compare` and the midpoint flags under `flags`. */
export function runParameter(engine: Engine, table: DataTableModel, i: ParameterInput): R {
  const fail = (error: string) => ({ analysis: "compare_fits", mode: "parameter", rows: [],
    datasets: [], error });
  if (table.subcolumnFormat !== "replicates") {
    return fail("Compare a parameter needs the replicate values (this table holds summary data): "
      + "use “One curve for all data sets vs. a separate curve for each” instead");
  }
  if (!i.parameter) return fail("Choose a parameter to compare");
  const pair = datasetPair(table, i.datasetA, i.datasetB);
  if (!pair) return fail("Comparing a parameter needs two data sets with values");
  if (pair[0] !== i.datasetA || pair[1] !== i.datasetB) {
    return fail("Choose two different data sets that hold values");
  }
  const data = numericData(table);
  const res = engine.analyze(compareParameterPayload(table, i));
  if (!res || res.error) return fail(String(res?.error ?? "no result"));
  const sep = engine.analyze({
    analysis: "dose_response",
    data: { x: data.x, datasets: [data.datasets[i.datasetA], data.datasets[i.datasetB]] },
    options: { model: i.model.engineId, x_is_log: i.xIsLog, error_bars: i.errorBars, constraints: i.held },
  });
  const fits: R[] = (sep && !sep.error ? sep.datasets ?? [] : []);
  const mid = isMidpoint(String(res.parameter_internal ?? res.parameter ?? ""));
  const flags = mid ? fits.map((d) => midpointFlag(String(d.name), d.fit, table.xUnit ?? ""))
    .filter((f): f is MidpointFlag => !!f) : [];
  const label = i.model.label;
  return {
    analysis: "compare_fits", mode: "parameter", method: "both", labels: [label, label], rows: [],
    compare: res, flags, xUnit: table.xUnit ?? "",
    datasets: fits.filter((d) => d.fit).map((d) => ({
      name: d.name, points: d.points, fit: { ...d.fit, label: `${label}, fitted to ${d.name}` },
    })),
  };
}

// ------------------------------------------------------------ wording

/** "IC50" for "LogIC50" (the ratio's quantity), else the parameter. */
export function linearName(parameter: string): string {
  return /^log/i.test(parameter) ? parameter.slice(3) : parameter;
}

const sig = (v: number, digits?: number) => formatSig(v, digits).replace(/^-/, "−");
const range = (ci: unknown, digits?: number) => (Array.isArray(ci) && isNum(ci[0]) && isNum(ci[1])
  ? `${sig(ci[0], digits)}–${sig(ci[1], digits)}` : "");
const pct = (p: number) => {
  const v = 100 * p;
  if (v > 99.99) return "> 99.99%";
  if (v < 0.01) return "< 0.01%";
  return `${formatSig(v, 3)}%`;
};

/** The P the headline reports: the F test for one shared value (the
 *  guide's comparison), else the t test of the difference. */
export function headlineP(c: R): number | null {
  if (isNum(c?.f_test?.p)) return c.f_test.p;
  return isNum(c?.difference?.p) ? c.difference.p : null;
}

/** The ratio as text: "3.35-fold (95% CI 2.98–3.75)", or "undefined
 *  (IC50 > 1e-5 M)" when a flagged midpoint is involved, or null for a
 *  ratio the engine could not compute. */
export function ratioText(c: R, flags: MidpointFlag[], digits = 3): string | null {
  const r = c?.ratio;
  const level = Math.round(100 * (isNum(c?.ci_level) ? c.ci_level : 0.95));
  if (flags.length) return `undefined (${flags.map((f) => (flags.length > 1 ? `${f.name}: ${f.text}` : f.text)).join("; ")})`;
  if (!r || !isNum(r.value)) return null;
  const ci = range(r.ci, digits);
  return `${sig(r.value, digits)}-fold${ci ? ` (${level}% CI ${ci})` : " (CI unbounded)"}`;
}

/** The one-line answer: "IC50 shifted 3.35-fold (95% CI 2.98–3.75),
 *  P < 0.0001" (the ratio B / A), or the difference for a parameter
 *  without a ratio. */
export function headline(c: R, flags: MidpointFlag[], style?: PStyle): string {
  const p = headlineP(c);
  const ps = p === null ? "" : `, ${formatPValue(p, style)}`;
  const level = Math.round(100 * (isNum(c?.ci_level) ? c.ci_level : 0.95));
  const [a, b] = c?.dataset_names ?? ["A", "B"];
  if (c?.ratio?.kind === "potency_ratio") {
    const lin = linearName(String(c.parameter));
    const rt = ratioText(c, flags);
    if (flags.length) return `${lin} ratio (${b} / ${a}) ${rt}: the ${lin} of an incomplete curve is not measured`;
    return `${lin} shifted ${rt}${ps} (${b} vs ${a})`;
  }
  const d = c?.difference;
  if (!d || !isNum(d.value)) return "";
  return `${c.parameter}: ${b} − ${a} = ${sig(d.value)} (${level}% CI ${range(d.ci)})${ps}`;
}

/** AICc in words: "AICc favours separate values (probability 99.99%)". */
export function aiccText(c: R): string {
  const a = c?.aicc;
  if (!a) return "";
  const sep = a.preferred === "separate";
  const p = sep ? a.probability_2 : a.probability_1;
  return `AICc favours ${sep ? `separate ${c.parameter} values` : `one shared ${c.parameter}`}`
    + (isNum(p) ? ` (probability ${pct(p)})` : "");
}

/** "F(1, 10) = 528.9, P < 0.0001" for the shared-vs-separate F test. */
export function fTestText(c: R, style?: PStyle): string {
  const f = c?.f_test;
  if (!f || !isNum(f.F)) return "";
  return `F(${f.dfn}, ${f.dfd}) = ${formatSig(f.F, 4)}, ${formatPValue(f.p, style)}`;
}

/** Potency in words for a log-concentration ratio: "Control is 3.35
 *  times as potent as Treated" (an EC50 ratio B / A above 1 means A acts
 *  at lower concentrations). */
export function potencyText(c: R): string {
  const r = c?.ratio;
  if (r?.kind !== "potency_ratio" || !isNum(r.value) || r.value <= 0) return "";
  const [a, b] = c.dataset_names ?? ["A", "B"];
  if (Math.abs(Math.log10(r.value)) < 1e-12) return `${a} and ${b} are equally potent`;
  return r.value > 1 ? `${a} is ${sig(r.value, 3)} times as potent as ${b}`
    : `${b} is ${sig(1 / r.value, 3)} times as potent as ${a}`;
}

/** The results sentence (results card): the ratio or difference with its
 *  CI and the F test, in the project's P style. */
export function compareParameterSentence(c: R, flags: MidpointFlag[], style?: PStyle): string {
  if (!c || !c.difference) return "";
  const [a, b] = c.dataset_names ?? ["A", "B"];
  const level = Math.round(100 * (isNum(c.ci_level) ? c.ci_level : 0.95));
  const par = String(c.parameter);
  const out: string[] = [];
  if (c.ratio?.kind === "potency_ratio") {
    const lin = linearName(par);
    if (flags.length) {
      out.push(`The ${lin} ratio of ${b} to ${a} is undefined: ${flags.map((f) => `${f.name} ${f.text}`).join(", ")} `
        + "(not reached in the concentrations tested).");
    } else {
      out.push(`The ${lin} of ${b} was ${sig(c.ratio.value, 3)}-fold that of ${a} (${lin} ratio, `
        + `${level}% CI ${range(c.ratio.ci, 3).replace("–", " to ")}; ${potencyText(c)}).`);
    }
  } else {
    out.push(`${par} differed by ${sig(c.difference.value)} (${b} − ${a}; ${level}% CI `
      + `${range(c.difference.ci).replace("–", " to ")}).`);
  }
  const f = c.f_test;
  if (f && isNum(f.p)) {
    const pr = c.aicc?.probability_2;
    out.push(`${f.p < 0.05 ? `One shared ${par} was rejected in favour of separate values`
      : `Separate ${par} values did not fit significantly better than one shared value`} `
      + `(extra-sum-of-squares F test, ${fTestText(c, style)}`
      + `${isNum(pr) ? `; AICc probability that the values differ ${pct(pr)}` : ""}).`);
  }
  return out.join(" ");
}

/** The legend clause: what was compared and how. */
export function compareParameterLegend(c: R): string {
  if (!c?.parameter) return "";
  const [a, b] = c.dataset_names ?? ["A", "B"];
  return `Curves are fitted to ${a} and ${b} separately; ${c.parameter} was compared between them `
    + "by the extra-sum-of-squares F test (one shared value against separate values) and AICc"
    + (c.ratio?.kind === "potency_ratio" ? `, and the ${linearName(String(c.parameter))} ratio is `
      + `${b} / ${a} with its CI from the antilog of the CI of the difference in ${c.parameter}` : "")
    + ".";
}

/** The methods paragraph (results sheet's Methods). */
export function compareParameterMethods(c: R, modelLabel: string): string {
  if (!c?.parameter) return "";
  const [a, b] = c.dataset_names ?? ["A", "B"];
  const level = Math.round(100 * (isNum(c.ci_level) ? c.ci_level : 0.95));
  const ratio = c.ratio?.kind === "potency_ratio"
    ? ` The ${linearName(String(c.parameter))} ratio (${b} / ${a}, the potency or dose ratio) is the `
      + `antilog of that difference, with the antilogs of its ${level}% CI as its CI.`
    : c.ratio?.method === "fieller" ? ` The ratio ${b} / ${a} has Fieller's ${level}% CI.` : "";
  return `${a} and ${b} were fitted by nonlinear regression to the “${modelLabel}” model, once `
    + `with a separate ${c.parameter} for each data set and once with one ${c.parameter} shared by `
    + "both (the other parameters separate in both fits); the two fits were compared with the "
    + "extra-sum-of-squares F test and with Akaike's information criterion corrected for small "
    + `samples (AICc), as described in the GraphPad curve-fitting guide and by ${MOTULSKY_2004}. `
    + `The difference in ${c.parameter} (${b} − ${a}) was tested with t = difference / √(SE_A² + `
    + `SE_B²) on df_A + df_B degrees of freedom from the separate fits.${ratio}`;
}
