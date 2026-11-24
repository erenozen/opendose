// Key facts: the headline of a results sheet (DECISIONS 3, "Answer
// first"). One mapper per kind of result picks the figure a reader looks
// for first: a curve fit's IC50 / EC50 (or its model's key parameter), a
// t test's difference with its CI and P, an ANOVA's P with F, a withheld
// P's reason, an analysis' error. A result no mapper knows gives null and
// the sheet shows its table first.
//
// Every string here comes from the formatters the results tables use
// (formatSig, tableP, pLabel, the range report), so a headline figure is
// always the figure printed in the table below it (ruling 10). Pure;
// unit-tested.
import { formatSig, type FitResult, type ParamEntry } from "../../types.ts";
import { pLabel, tableP } from "../../report/pformat.ts";
import { fitAmbiguous } from "../../guide/checks.ts";
import { withheldInfo, withheldPhrase } from "../../sheets/common/withheld.ts";
import {
  equivalenceCI, equivalenceEstimate, equivalenceVerdict, estimateLabel, hasEquivalence, marginText,
} from "../../report/equivalence.ts";
import {
  NOT_REACHED, displayOf, isLogMidpoint, isMidpoint, rangeHidesSpread,
} from "../../sheets/xy/rangeReport.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface KeyFigure {
  /** What the figure is, as the table labels it: "IC50 (M)". */
  name: string;
  value: string;
  /** "95% CI 9.694e-8 to 1.115e-7". */
  ci?: string;
  /** Secondary facts, each one short: "R² 0.9986", "27 points". */
  facts: string[];
  /** A figure the app says should not be reported: why, said first; the
   *  figure is then shown small and quiet. */
  demoted?: string;
  /** A qualifier read with the figure ("not reached in the range tested"). */
  note?: string;
  /** The value is words with numbers in them (an equivalence verdict):
   *  it may wrap between words, never inside a number. */
  words?: boolean;
}

export interface KeyItem {
  /** The data set or comparison the figure belongs to. */
  title: string;
  figure?: KeyFigure;
  /** This item could not be computed: the message, as the table says it. */
  error?: string;
}

export type KeyFacts =
  | { kind: "figures"; items: KeyItem[] }
  | { kind: "error"; message: string }
  | null;

// Concentration-like parameters carry the X unit in the table's labels.
const UNIT_PARAMS = new Set(["IC50", "EC50", "Km", "Kd", "AbsoluteIC50"]);
// ... and the library's other concentrations (ECanything, Ki, KA, KB, A2).
const UNIT_PATTERN = /^(IC|EC|ED)\d+(_\w+)?$|^EC50(Control|_\w+)$|^IC50_\w+$|^(Ki|KA|KB|Kb|A2)$/;
const hasUnit = (name: string) => UNIT_PARAMS.has(name) || UNIT_PATTERN.test(name);

/** A parameter's row label in the fit table: "IC50 (M)", "Top (shared)". */
export function paramLabel(name: string, e: ParamEntry, xUnit: string): string {
  const base = hasUnit(name) ? `${name} (${xUnit})` : name;
  return e.shared ? `${base} (shared)`
    : (e as { dataset_constant?: boolean }).dataset_constant ? `${base} (data set constant)` : base;
}

/** A parameter's 95% CI cell: "9.694e-8 to 1.115e-7" or "n/a". */
export function paramCI(entry: ParamEntry | undefined): string {
  if (!entry?.ci95) return "n/a";
  const [lo, hi] = entry.ci95;
  const f = (v: number | null) => (v === null ? "(very wide)" : formatSig(v));
  return `${f(lo)} to ${f(hi)}`;
}

// The parameter a reader of each model looks for first, in this order.
const KEY_PARAM = /^(IC50|EC50|ED50|AbsoluteIC50|Ki|Km|Kd|HalfLife|DoublingTime|IC50_\w+|EC50\w*)$/;

/** The parameter a reader of this fit looks for first (IC50, EC50, Km...). */
export function keyParam(fit: FitResult): string | null {
  const order = (fit.param_order ?? Object.keys(fit.params)).filter((n) => fit.params[n]);
  return order.find((n) => KEY_PARAM.test(n))
    ?? order.find((n) => fit.params[n].derived && n !== "Span") ?? null;
}

function fitFigure(fit: FitResult, xUnit: string): KeyFigure | null {
  const name = keyParam(fit);
  if (!name) return null;
  const e = fit.params[name];
  const label = paramLabel(name, e, xUnit);
  const g = fit.goodness as R;
  const facts: string[] = [];
  if (typeof g?.r_squared === "number") facts.push(`R² ${formatSig(g.r_squared)}`);
  if (typeof g?.n_points === "number") facts.push(`${g.n_points} points`);
  const hide = !e.constrained && rangeHidesSpread(name, fit);
  const ci = e.constrained || hide ? undefined : paramCI(e);
  const fig: KeyFigure = {
    name: label,
    value: e.constrained ? `= ${formatSig(e.value)}` : formatSig(e.value),
    ci: ci && ci !== "n/a" ? `95% CI ${ci}` : undefined,
    facts,
  };
  // The incomplete-curve report (sheets/xy/rangeFlags.tsx) decides what
  // the IC50 cell says; the headline says the same.
  const d = displayOf(fit);
  if (d && !e.constrained && (isMidpoint(name, d) || isLogMidpoint(name, d))) {
    if (d.mode === "bound") {
      fig.value = isLogMidpoint(name, d) ? d.logBound ?? d.bound : d.bound;
      fig.note = NOT_REACHED;
    } else {
      fig.demoted = `Extrapolated (${d.relation === ">" ? "above" : "below"} the range tested): `
        + "read off the model's tail rather than measured.";
    }
  } else if (fit.extrapolation
    && fit.extrapolation.param.replace("Log", "") === name.replace("Log", "")) {
    fig.demoted = `Extrapolated: the fitted ${name.replace("Log", "")} falls ${fit.extrapolation.direction} `
      + "every dose tested, so it is read off the model's tail rather than measured.";
  }
  if (e.at_bound) {
    fig.ci = undefined;
    fig.demoted = `At its constraint: the ${name} sits on the limit set for it, so its SE and CI `
      + "are not reliable.";
  }
  if (fitAmbiguous(fit)) {
    fig.demoted = `Ambiguous fit: the parameters, including the ${name}, should not be reported.`;
  }
  return fig;
}

const FIT_ANALYSES = new Set(["dose_response", "global_fit", "global_model_fit"]);

/** Curve fits (nonlinear regression): one item per data set. */
function fitFacts(r: R, xUnit: string): KeyFacts {
  const sets = (r.datasets ?? []) as R[];
  if (!sets.some((d) => d.fit?.params) && !(FIT_ANALYSES.has(r.analysis) && sets.some((d) => d.error))) {
    return null;
  }
  const items: KeyItem[] = sets.map((d) => (d.error
    ? { title: String(d.name), error: `Could not fit: ${String(d.error)}` }
    : { title: String(d.name), figure: d.fit ? fitFigure(d.fit, xUnit) ?? undefined : undefined }));
  return items.some((i) => i.figure || i.error) ? { kind: "figures", items } : null;
}

const ci = (c: unknown): string | undefined => (Array.isArray(c) && c.length === 2
  ? `${formatSig(c[0] as number)} to ${formatSig(c[1] as number)}` : undefined);

/** An equivalence or non-inferiority test (report/equivalence.ts): the
 *  verdict answers the question asked, with the 90% CI and P_TOST. */
function equivalenceFigure(e: R, a: string, b: string): KeyFigure {
  const ni = e.kind === "noninferiority";
  return {
    name: `${ni ? "Non-inferiority" : "Equivalence"} of ${estimateLabel(e, a, b)}, margin ${marginText(e)}`,
    value: equivalenceVerdict(e, a, b), words: true,
    ci: equivalenceCI(e),
    facts: [`${e.scale === "ratio" ? "Ratio" : "Difference"} ${formatSig(equivalenceEstimate(e))}`,
      `${pLabel(e.p)} (${ni ? "one-sided test" : "TOST"})`],
  };
}

/** t tests: the difference with its CI, then P. */
function ttestFacts(r: R): KeyFacts {
  const [a, b] = (r.names ?? ["A", "B"]) as string[];
  if (hasEquivalence(r.equivalence)) {
    return { kind: "figures", items: [{ title: `${a} vs. ${b}`, figure: equivalenceFigure(r.equivalence, a, b) }] };
  }
  if (r.ratio != null && r.log_scale) return null;
  const p = `${pLabel(r.p_two_tailed)} (two-tailed)`;
  let fig: KeyFigure;
  if (typeof r.difference === "number") {
    const c = ci(r.ci_difference);
    fig = { name: `Difference between means (${a} − ${b})`, value: formatSig(r.difference),
      ci: c && `95% CI ${c}`, facts: [p] };
  } else if (typeof r.mean_difference === "number") {
    const c = ci(r.ci_difference);
    fig = { name: `Mean of differences (${a} − ${b})`, value: formatSig(r.mean_difference),
      ci: c && `95% CI ${c}`, facts: [p] };
  } else if (typeof r.hodges_lehmann_difference === "number") {
    fig = { name: "Hodges-Lehmann difference", value: formatSig(r.hodges_lehmann_difference),
      facts: [p] };
  } else if (typeof r.p_two_tailed === "number") {
    fig = { name: "P value (two-tailed)", value: tableP(r.p_two_tailed), facts: [] };
  } else return null;
  return { kind: "figures", items: [{ title: `${a} vs. ${b}`, figure: fig }] };
}

/** One-way ANOVA and Kruskal-Wallis: P, with F (or H). */
function anovaFacts(r: R): KeyFacts {
  if (r.kind === "nonparametric") {
    if (typeof r.p !== "number") return null;
    return { kind: "figures", items: [{ title: "Kruskal-Wallis test", figure: {
      name: "P value", value: tableP(r.p), facts: [`Kruskal-Wallis H ${formatSig(r.H)}`] } }] };
  }
  const t = r.table as R | undefined;
  if (!t || typeof t.p !== "number") return null;
  const facts = [`F(${t.df_between}, ${t.df_within}) = ${formatSig(t.F)}`];
  if (typeof t.r_squared === "number") facts.push(`R² ${formatSig(t.r_squared)}`);
  const title = `Ordinary one-way ANOVA${r.log_scale ? ` on ${r.log_scale.base ?? "log10"}(values)` : ""}`;
  return { kind: "figures", items: [{ title, figure: { name: "P value", value: tableP(t.p), facts } }] };
}

/** A P value withheld at one value per group: the reason is the result. */
function withheldFacts(r: R): KeyFacts {
  const w = withheldInfo(r);
  if (!w) return null;
  const means = w.all.filter((g) => g.mean !== null);
  const title = means.length === 2 ? `${means[0].name} vs. ${means[1].name}`
    : means.map((g) => g.name).join(", ") || "Results";
  const why = withheldPhrase(w);
  return { kind: "figures", items: [{ title, figure: {
    name: "P value", value: "withheld", facts: [],
    demoted: `${why.charAt(0).toUpperCase()}${why.slice(1)} gives no estimate of the variability `
      + "within groups, so no test was run.",
  } }] };
}

/** Passing-Bablok regression (sheets/column/methodRegression.ts): the
 *  slope with its CI per comparison, the intercept and n as facts. */
function methodRegFacts(r: R): KeyFacts {
  const comps = (r.comparisons ?? []) as R[];
  if (!comps.length) return null;
  const pct = `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`;
  const ci = (c: unknown) => (Array.isArray(c) ? `${formatSig(c[0])} to ${formatSig(c[1])}` : null);
  return { kind: "figures", items: comps.map((c): KeyItem => {
    const title = `${c.name} vs ${c.x_name}`;
    const pb = c.passing_bablok as R;
    if (pb?.error) return { title, error: String(pb.error) };
    const sci = ci(pb.slope?.ci);
    const ici = ci(pb.intercept?.ci);
    return { title, figure: {
      name: "Passing-Bablok slope", value: formatSig(pb.slope.value),
      ci: sci ? `${pct} CI ${sci}` : undefined,
      facts: [`Intercept ${formatSig(pb.intercept.value)}${ici ? ` (${pct} CI ${ici})` : ""}`, `${c.n} pairs`],
    } };
  }) };
}

/** Reliability ICC (sheets/column/icc.ts): the chosen form with its CI. */
function iccFacts(r: R): KeyFacts {
  const forms = (r.forms ?? []) as R[];
  const want = r.options?.form ?? r.default ?? "ICC2";
  const c = forms.find((x) => x.form === want);
  if (!c || typeof c.value !== "number") return null;
  const k = r.k_raters;
  const name = { ICC1: "ICC(1,1)", ICC2: "ICC(2,1)", ICC3: "ICC(3,1)", ICC1k: `ICC(1,${k})`,
    ICC2k: `ICC(2,${k})`, ICC3k: `ICC(3,${k})` }[String(want)] ?? String(want);
  const pct = `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`;
  return { kind: "figures", items: [{ title: `${r.n_targets} targets, ${k} raters`, figure: {
    name, value: formatSig(c.value),
    ci: Array.isArray(c.ci) ? `${pct} CI ${formatSig(c.ci[0])} to ${formatSig(c.ci[1])}` : undefined,
    facts: [`F(${c.df1}, ${c.df2}) = ${formatSig(c.F)}`, pLabel(c.p)],
  } }] };
}

/** Baseline-adjusted comparison (ANCOVA, P-82): each group's adjusted
 *  difference against the reference group with its CI, P and n. */
function ancovaFacts(r: R): KeyFacts {
  const diffs = (r.differences ?? []) as R[];
  if (!diffs.length) return null;
  const pct = `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`;
  const n = (lev: string) => (r.adjusted_means as R[] | undefined)?.find((m) => m.level === lev)?.n;
  return { kind: "figures", items: diffs.map((d): KeyItem => ({
    title: `${d.level} vs. ${d.vs}, adjusted for ${r.baseline}`,
    figure: {
      name: "Adjusted difference", value: formatSig(d.estimate),
      ci: `${pct} CI ${formatSig(d.ci[0])} to ${formatSig(d.ci[1])}`,
      facts: [pLabel(d.p), `n = ${n(d.level)} and ${n(d.vs)}`],
    },
  })) };
}

/** Binomial and negative binomial regression (P-86) and Firth's logistic
 *  regression (P-89): the odds or rate ratio of the first predictor (each
 *  level against the reference level, or per unit), with its CI and P.
 *  The other predictors (a block such as the experiment) stay in the
 *  table. */
function glmFacts(r: R): KeyFacts {
  const pred = (r.predictors as string[] | undefined)?.[0];
  if (!pred || !Array.isArray(r.coefficients)) return null;
  const firth = r.method === "firth";
  const ratio = r.analysis === "negative_binomial_regression" ? "rate_ratio" : "odds_ratio";
  const ref = (r.reference_levels as Record<string, string> | undefined)?.[pred];
  const pct = `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`;
  const model = firth ? "Firth's correction: shrunk toward no effect"
    : `${r.analysis === "negative_binomial_regression" ? "negative binomial"
      : r.family === "quasibinomial" ? "quasi-binomial" : "binomial"} regression, ${r.n_rows_analyzed} rows`;
  const items = (r.coefficients as R[]).slice(1).filter((c) => c.name === pred || c.name.startsWith(`${pred}[`))
    .map((c): KeyItem => {
      const level = c.name === pred ? null : c.name.slice(pred.length + 1, -1);
      const lims = c[`${ratio}_ci`] as (number | null)[] | undefined;
      return { title: level === null ? `${pred}, per unit` : `${pred}: ${level} vs. ${ref ?? "reference"}`,
        figure: {
          name: ratio === "rate_ratio" ? "Rate ratio" : "Odds ratio", value: formatSig(c[ratio]),
          ci: lims ? `${pct} CI ${lims[0] === null ? "n/a" : formatSig(lims[0])} to ${
            lims[1] === null ? "n/a" : formatSig(lims[1])}` : undefined,
          facts: [firth ? `${pLabel(c.p)} (penalized likelihood ratio)` : pLabel(c.p), model],
        } };
    });
  return items.length ? { kind: "figures", items } : null;
}

/** Competing risks (P-90): with two or more groups, Gray's P per kind of
 *  event with each group's cumulative incidence at the reported time;
 *  with one group, the cumulative incidence of each kind at that time. */
function competingFacts(r: R): KeyFacts {
  const causes = (r.causes ?? []) as R[];
  if (!causes.length) return null;
  const labels = (r.cause_labels ?? {}) as Record<string, string>;
  const label = (code: number) => labels[String(code)]?.trim() || `Cause ${code}`;
  const pct = `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`;
  const t = typeof r.at_time_used === "number" ? r.at_time_used : null;
  const when = typeof r.at_time_label === "string" ? r.at_time_label : `time ${formatSig(t)}`;
  const at = (g: R) => g.at_times?.[0] as R | undefined;
  const atFacts = (c: R) => (t === null ? [] : (c.groups as R[])
    .filter((g) => typeof at(g)?.cif === "number")
    .map((g) => `${g.name} ${formatSig(at(g)!.cif)} at ${when}`));
  if ((r.group_names ?? []).length >= 2) {
    return { kind: "figures", items: causes.map((c): KeyItem => {
      const g = c.gray as R | null;
      const title = `Gray's test: ${label(c.code)}`;
      if (!g || typeof g.p !== "number") return { title, error: String(c.note ?? "Not computed") };
      return { title, figure: { name: "P value", value: tableP(g.p),
        facts: [`χ²(${g.df}) = ${formatSig(g.chi2)}`, ...atFacts(c)] } };
    }) };
  }
  if (t === null) return null;
  const items = causes.map((c): KeyItem | null => {
    const a = at(c.groups[0]);
    if (!a || typeof a.cif !== "number") return null;
    return { title: label(c.code), figure: {
      name: `Cumulative incidence at ${when}`, value: formatSig(a.cif),
      ci: typeof a.lower === "number" && typeof a.upper === "number"
        ? `${pct} CI ${formatSig(a.lower)} to ${formatSig(a.upper)}` : undefined,
      facts: [`${c.groups[0].events} events, n = ${c.groups[0].n}`],
    } };
  }).filter((x): x is KeyItem => x !== null);
  return items.length ? { kind: "figures", items } : null;
}

/** Parametric survival (P-91): each group's time ratio against the
 *  reference with its CI and P; with one group, the model's median. A
 *  median past the last follow-up is said to be extrapolated. */
function parametricFacts(r: R): KeyFacts {
  const dist = ({ weibull: "Weibull", exponential: "Exponential", lognormal: "Log-normal" } as
    Record<string, string>)[r.dist] ?? String(r.dist);
  const pct = `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`;
  const ciOf = (c: unknown) => (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
    ? `${pct} CI ${formatSig(c[0])} to ${formatSig(c[1])}` : undefined);
  const median = (g: R) => (g.percentiles as R[] | undefined)?.find((p) => p.p === 0.5);
  const medianFact = (g: R) => {
    const m = median(g);
    return m && typeof m.time === "number"
      ? `${g.name} median ${formatSig(m.time)}${m.beyond_follow_up ? " (extrapolated)" : ""}` : null;
  };
  const ratios = (r.time_ratios ?? []) as R[];
  if (ratios.length) {
    return { kind: "figures", items: ratios.map((t): KeyItem => ({
      title: `${t.group} vs. ${t.reference}`,
      figure: { name: `Time ratio (${dist} AFT)`, value: formatSig(t.value), ci: ciOf(t.ci),
        facts: [pLabel(t.p), ...((r.groups ?? []) as R[])
          .filter((g) => g.name === t.group || g.name === t.reference)
          .map(medianFact).filter((x): x is string => !!x)] },
    })) };
  }
  const g = (r.groups ?? [])[0] as R | undefined;
  const m = g && median(g);
  if (!g || !m || typeof m.time !== "number") return null;
  return { kind: "figures", items: [{ title: String(g.name), figure: {
    name: `Median survival (${dist} model)`, value: formatSig(m.time), ci: ciOf(m.ci),
    facts: [`${g.events} events, n = ${g.n}`],
    note: m.beyond_follow_up ? "extrapolated beyond the last follow-up" : undefined,
  } }] };
}

/** The headline facts of a result, or null for "show the table first". */
export function keyFacts(result: unknown, opts: { xUnit?: string } = {}): KeyFacts {
  if (!result || typeof result !== "object") return null;
  const r = result as R;
  if (r.error) return { kind: "error", message: `Analysis failed: ${String(r.error)}` };
  if (withheldInfo(r)) return withheldFacts(r);
  if (r.analysis === "method_regression") return methodRegFacts(r);
  if (r.analysis === "icc") return iccFacts(r);
  if (r.analysis === "ancova") return ancovaFacts(r);
  if (r.analysis === "competing_risks") return competingFacts(r);
  if (r.analysis === "parametric_survival") return parametricFacts(r);
  if (r.analysis === "binomial_regression" || r.analysis === "negative_binomial_regression"
    || (r.analysis === "logistic_regression" && r.method === "firth")) return glmFacts(r);
  if (Array.isArray(r.datasets)) return fitFacts(r, opts.xUnit || "M");
  if (r.analysis === "ttest" && !r.test?.toString().match(/kolmogorov|ratio_paired/)) return ttestFacts(r);
  if (r.analysis === "anova") return anovaFacts(r);
  return null;
}
