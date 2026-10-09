// Results sentences: a result written out the way a manuscript reports
// it, in one of three styles (Preferences -> Reporting):
//
// - APA 7: "t(10) = 5.60, p < .001, d = 3.23, 95% CI [1.40, 5.00]".
//   Statistics to two decimals; no leading zero for values that cannot
//   exceed 1 (p, r, η², V); df of Welch-type tests to two decimals;
//   M and SD with every group (Publication Manual of the APA, 7th ed.,
//   sec. 6.36, 6.40-6.44; SAMPL: "mean (SD)", not "mean ± SD").
// - NEJM: estimates with 95% CIs written "95% CI, a to b" and "P=0.03"
//   (NEJM statistical reporting guidelines for authors).
// - GraphPad: the numbers as the results sheet shows them (results
//   precision) and "P = 0.0321" (GraphPad Prism guide, "How to report
//   statistical results").
//
// Every test is named with its sidedness; exact P values follow the
// style's floor (pformat.ts). Pure (no React), unit-tested against native
// engine results (__tests__/sentences.test.ts).
import { familyAdjustedFor, familyOf } from "./family.ts";
import { formatSig } from "../types.ts";
import { describeResult, POSTHOC_NAMES, TEST_NAMES } from "./describe.ts";
import { effectGroups, primaryEffect, type EffectRow } from "./effects.ts";
import { formatPValue, type PStyle } from "./pformat.ts";
import { DEFAULT_REPORT, type ReportPrefs } from "./prefs.ts";
import { withheldInfo, withheldPhrase, type WithheldInfo } from "../sheets/common/withheld.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ci2 = (v: unknown): [number, number] | null =>
  (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) ? [v[0], v[1]] : null);
const MINUS = "−";

/** Number formatting of one style. */
export interface Fmt {
  style: PStyle;
  /** A test statistic or estimate. `bounded`: |v| ≤ 1 (APA: no leading 0). */
  n: (v: number, bounded?: boolean) => string;
  /** Degrees of freedom: integers as integers, others to two decimals. */
  df: (v: number) => string;
  p: (p: number, label?: string) => string;
  /** "95% CI [a, b]" (APA), "95% CI, a to b" (NEJM), "95% CI a to b". */
  ci: (ci: [number, number], level?: number, bounded?: boolean) => string;
}

function minus(s: string): string { return s.replace(/^-/, MINUS); }

export function makeFmt(style: PStyle): Fmt {
  const fixed = (v: number, bounded = false) => {
    const a = Math.abs(v);
    let s: string;
    if (a !== 0 && (a < 0.005 || a >= 1e6)) s = formatSig(v, 3);
    else s = v.toFixed(2);
    if (s === "-0.00") s = "0.00";
    if (style === "apa" && bounded) s = s.replace(/^(-?)0\./, "$1.");
    return minus(s);
  };
  const n = style === "graphpad" ? (v: number) => minus(formatSig(v)) : fixed;
  const df = (v: number) => (Number.isInteger(v) ? String(v)
    : style === "graphpad" ? formatSig(v) : v.toFixed(2));
  const pct = (level = 0.95) => `${Number((level * 100).toPrecision(4))}%`;
  const ci = (c: [number, number], level = 0.95, bounded = false) => {
    const [a, b] = [n(c[0], bounded), n(c[1], bounded)];
    if (style === "apa") return `${pct(level)} CI [${a}, ${b}]`;
    if (style === "nejm") return `${pct(level)} CI, ${a} to ${b}`;
    return `${pct(level)} CI ${a} to ${b}`;
  };
  return { style, n, df, p: (p, label = "P") => formatPValue(p, style, label), ci };
}

/** An effect size with its CI, e.g. "d = 3.23, 95% CI [1.40, 5.00]";
 *  `flip` negates it (the sentence names the groups the other way). */
export function effectText(e: EffectRow, f: Fmt, flip = false): string {
  const s = flip && signed(e) ? -1 : 1;
  const v = s * e.value;
  const ci = e.ci ? (s === 1 ? e.ci : [-e.ci[1], -e.ci[0]] as [number, number]) : null;
  const sym = e.id === "rank_biserial" ? "rank-biserial r" : e.symbol;
  if (f.style === "graphpad") {
    return `${e.measure} ${f.n(v)}${ci ? `, ${f.ci(ci, e.ciLevel)}` : ""}`;
  }
  if (f.style === "nejm") {
    return `${sym}, ${f.n(v, e.bounded)}${ci ? ` [${f.ci(ci, e.ciLevel, e.bounded)}]` : ""}`;
  }
  return `${sym} = ${f.n(v, e.bounded)}${ci ? `, ${f.ci(ci, e.ciLevel, e.bounded)}` : ""}`;
}

/** Effect sizes that change sign with the order of the groups. */
function signed(e: EffectRow): boolean {
  return e.family === "smd" || e.id === "delta" || e.id === "rank_biserial";
}

export interface SentenceContext {
  style?: PStyle;
  prefs?: Pick<ReportPrefs, "smd" | "variance">;
}

const join = (parts: (string | null | undefined | false)[], sep = ", ") =>
  parts.filter(Boolean).join(sep);

/** Upper-case a leading Latin letter (never χ, η, κ, ...). */
function cap(s: string): string { return /^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s; }

function list(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

// ----------------------------------------------------------- two groups

interface TwoGroup {
  a: string; b: string;
  /** Estimate of a − b (sign decides the wording), with its CI. */
  estimate: number | null;
  estimateName: string;      // "mean difference", "median of the paired differences"
  estimateCi: [number, number] | null;
  ciLevel?: number;
  /** APA descriptive statistics per group, e.g. "M = 29.17, SD = 1.52, n = 6". */
  descA?: string; descB?: string;
  /** NEJM "mean, 29.17 vs. 23.97" (already ordered high vs. low). */
  nejmDesc?: (flip: boolean) => string;
  test: string;              // "unpaired t test"
  /** Matched designs: number of pairs, shown after the group names. */
  pairs?: number;
  pNote?: string;            // ", exact P"
  /** `integer`: a rank statistic (U, W), written without decimals. */
  stat: { name: string; value: number; df?: number; signed?: boolean; integer?: boolean } | null;
  p: number;
  effect: EffectRow | null;
}

function twoGroup(t: TwoGroup, f: Fmt): string {
  const flip = num(t.estimate) && t.estimate < 0;
  const [hi, lo] = flip ? [t.b, t.a] : [t.a, t.b];
  const [dHi, dLo] = flip ? [t.descB, t.descA] : [t.descA, t.descB];
  const est = num(t.estimate) ? (flip ? -t.estimate : t.estimate) : null;
  const eci = t.estimateCi ? (flip ? [-t.estimateCi[1], -t.estimateCi[0]] as [number, number]
    : t.estimateCi) : null;
  const statVal = t.stat ? (t.stat.signed && flip ? -t.stat.value
    : t.stat.signed ? t.stat.value : Math.abs(t.stat.value)) : null;
  const pairs = num(t.pairs) && f.style !== "nejm" ? ` (${t.pairs} pairs)` : "";
  const lead = (num(t.estimate) && t.estimate !== 0
    ? `Values were higher in ${hi}${dHi && f.style === "apa" ? ` (${dHi})` : ""} than in ${lo}${dLo && f.style === "apa" ? ` (${dLo})` : ""}`
    : `${hi} and ${lo} were compared`) + (f.style === "graphpad" ? "" : pairs);
  const how = `${t.test}, two-tailed${t.pNote ?? ""}`;
  if (f.style === "apa") {
    const stat = t.stat && statVal !== null
      ? `${t.stat.name}${num(t.stat.df) ? `(${f.df(t.stat.df)})` : ""} = ${t.stat.integer ? f.df(statVal) : f.n(statVal)}` : null;
    return `${lead}, ${join([stat, f.p(t.p),
      est !== null ? `${t.estimateName} = ${f.n(est)}${eci ? `, ${f.ci(eci, t.ciLevel)}` : ""}` : null,
      t.effect ? effectText(t.effect, f, flip) : null])} (${how}).`;
  }
  if (f.style === "nejm") {
    const inner = join([t.nejmDesc?.(flip),
      est !== null ? `${t.estimateName}, ${f.n(est)}${eci ? `; ${f.ci(eci, t.ciLevel)}` : ""}` : null,
      t.effect ? effectText(t.effect, f, flip) : null,
      `${f.p(t.p)} by ${how}`], "; ");
    return `${lead} (${inner}).`;
  }
  const stat = t.stat && statVal !== null
    ? `${t.stat.name} = ${t.stat.integer ? f.df(statVal) : f.n(statVal)}${num(t.stat.df) ? `, df = ${f.df(t.stat.df)}` : ""}` : null;
  return `${hi} vs. ${lo}${pairs} (${how}): ${join([stat, f.p(t.p)])}`
    + (est !== null ? `; ${t.estimateName} ${f.n(est)}${eci ? `, ${f.ci(eci, t.ciLevel)}` : ""}` : "")
    + (t.effect ? `; ${effectText(t.effect, f, flip)}` : "") + ".";
}

function apaDesc(f: Fmt, mean: unknown, sd: unknown, n: unknown, centre = "M"): string | undefined {
  if (!num(mean)) return undefined;
  return join([`${centre} = ${f.n(mean)}`, num(sd) ? `SD = ${f.n(sd)}` : null,
    num(n) ? `n = ${n}` : null]);
}

function pNoteOf(r: R, f?: Fmt): string {
  const p = f?.style === "apa" ? "p" : "P";
  return r.p_method === "exact" ? `, exact ${p}` : r.p_method === "approximate" ? `, approximate ${p}` : "";
}

function ttestSentence(r: R, f: Fmt, eff: EffectRow | null): string {
  const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["A", "B"];
  const test = TEST_NAMES[String(r.test)] ?? "two-group test";
  switch (r.test) {
    case "unpaired_t":
    case "welch_t": {
      const sdA = num(r.sem_a) && num(r.n_a) ? r.sem_a * Math.sqrt(r.n_a) : null;
      const sdB = num(r.sem_b) && num(r.n_b) ? r.sem_b * Math.sqrt(r.n_b) : null;
      return twoGroup({
        a, b, estimate: r.difference, estimateName: f.style === "graphpad"
          ? "difference between means" : "mean difference",
        estimateCi: ci2(r.ci_difference),
        descA: apaDesc(f, r.mean_a, sdA, r.n_a), descB: apaDesc(f, r.mean_b, sdB, r.n_b),
        nejmDesc: (flip) => `mean, ${f.n(flip ? r.mean_b : r.mean_a)} vs. ${f.n(flip ? r.mean_a : r.mean_b)}`,
        test, stat: num(r.t) ? { name: "t", value: r.t, df: r.df } : null,
        p: r.p_two_tailed, effect: eff,
      }, f);
    }
    case "paired_t":
      return twoGroup({
        a, b, estimate: r.mean_difference, estimateName: "mean of the paired differences",
        estimateCi: ci2(r.ci_difference),
        nejmDesc: () => `${r.n_pairs} pairs`, pairs: r.n_pairs,
        test, stat: num(r.t) ? { name: "t", value: r.t, df: r.df } : null,
        p: r.p_two_tailed, effect: eff,
      }, f);
    case "ratio_paired_t": {
      const c = ci2(r.ci_ratio);
      const rName = `${f.style === "graphpad" ? "geometric mean of the ratios" : "geometric mean ratio"} (${a}/${b})`;
      const ratio = num(r.geometric_mean_ratio)
        ? `${rName}${f.style === "apa" ? " = " : f.style === "nejm" ? ", " : " "}${f.n(r.geometric_mean_ratio)}${c ? `${f.style === "nejm" ? "; " : ", "}${f.ci(c)}` : ""}`
        : null;
      const stat = num(r.t) ? (f.style === "graphpad" ? `t = ${f.n(Math.abs(r.t))}, df = ${f.df(r.df)}`
        : f.style === "apa" ? `t(${f.df(r.df)}) = ${f.n(Math.abs(r.t))}` : null) : null;
      const how = `${test} on the logarithms, two-tailed, ${r.n_pairs} pairs`;
      if (f.style === "nejm") return `${cap(a)} and ${b} were compared (${join([ratio, `${f.p(r.p_two_tailed)} by ${how}`], "; ")}).`;
      return `${cap(a)} and ${b} were compared by ${how}: ${join([ratio, stat, f.p(r.p_two_tailed)])}.`;
    }
    case "mann_whitney":
      return twoGroup({
        a, b, estimate: r.hodges_lehmann_difference, estimateName: "Hodges-Lehmann difference",
        estimateCi: ci2(r.ci_hodges_lehmann),
        descA: apaDesc(f, r.median_a, null, r.n_a, "Mdn"), descB: apaDesc(f, r.median_b, null, r.n_b, "Mdn"),
        nejmDesc: (flip) => `median, ${f.n(flip ? r.median_b : r.median_a)} vs. ${f.n(flip ? r.median_a : r.median_b)}`,
        test, pNote: pNoteOf(r, f),
        stat: num(r.U) ? { name: "U", value: r.U, integer: true } : null, p: r.p_two_tailed, effect: eff,
      }, f);
    case "wilcoxon_matched_pairs":
      return twoGroup({
        a, b, estimate: r.median_difference, estimateName: "median of the paired differences",
        estimateCi: ci2(r.ci_median),
        nejmDesc: () => `${r.n_pairs} pairs`, pairs: r.n_pairs,
        test, pNote: pNoteOf(r, f),
        stat: num(r.W) ? { name: "W", value: r.W, signed: true, integer: true } : null,
        p: r.p_two_tailed, effect: eff,
      }, f);
    case "kolmogorov_smirnov": {
      const how = `${test}${pNoteOf(r, f)}`;
      const meds = num(r.median_a) && num(r.median_b)
        ? (f.style === "apa" ? ` (Mdn = ${f.n(r.median_a)} and ${f.n(r.median_b)})`
          : ` (medians ${f.n(r.median_a)} and ${f.n(r.median_b)})`) : "";
      if (f.style === "nejm") {
        return `The distributions of ${a} and ${b} were compared (${join([num(r.median_a) && num(r.median_b)
          ? `medians, ${f.n(r.median_a)} and ${f.n(r.median_b)}` : null, `D, ${f.n(r.D)}`, `${f.p(r.p)} by ${how}`], "; ")}).`;
      }
      return `The distributions of ${a} and ${b}${meds} were compared with the ${how}: D = ${f.n(r.D)}, ${f.p(r.p)}.`;
    }
    default:
      return "";
  }
}

// ----------------------------------------------------------------- ANOVA

function fStat(f: Fmt, F: unknown, df1: unknown, df2: unknown, name = "F"): string | null {
  if (!num(F)) return null;
  if (f.style === "graphpad" || f.style === "apa") {
    return num(df1) && num(df2) ? `${name}(${f.df(df1)}, ${f.df(df2)}) = ${f.n(F)}` : `${name} = ${f.n(F)}`;
  }
  return `${name}, ${f.n(F)}`;
}

/** Post hoc pairs: "Control vs. Treated A, mean difference −5.20, 95% CI
 *  [−7.50, −2.90], adjusted p < .001; ...". */
function posthocSentence(mc: R | null | undefined, f: Fmt, method?: string,
  family = false): string | null {
  if (!mc || !Array.isArray(mc.comparisons) || !mc.comparisons.length) return null;
  const m = String(method ?? mc.method ?? "");
  const name = cap(POSTHOC_NAMES[m] ?? m.replace(/_/g, " "));
  const uncorrected = m === "fisher_lsd" || m === "welch_uncorrected" || mc.corrected === false;
  const pLabel = uncorrected ? "P" : "adjusted P";
  const items = mc.comparisons.map((c: R) => {
    const diff = num(c.difference) ? c.difference : num(c.mean_rank_difference) ? c.mean_rank_difference : null;
    const dName = num(c.difference) ? "mean difference" : "mean rank difference";
    const ci = ci2(c.ci) ?? ci2(c.ci95);
    const p = num(c.p_adjusted) ? c.p_adjusted : c.p;
    const label = `${family && c.family ? `${c.family}, ` : ""}${c.pair}`;
    const est = diff !== null ? (f.style === "apa" ? `${dName} = ${f.n(diff)}` : `${dName} ${f.style === "nejm" ? ", " : ""}${f.n(diff)}`)
      .replace(" , ", ", ") : null;
    if (f.style === "nejm") {
      return `${label}: ${join([est, ci ? f.ci(ci) : null, num(p) ? f.p(p, uncorrected ? "P" : "adjusted P") : null], "; ")}`;
    }
    return `${label}, ${join([est, ci ? f.ci(ci, mc.ci_level ?? 0.95) : null,
      num(p) ? f.p(p, pLabel) : null])}`;
  });
  // the family the P values were adjusted for (report/family.ts)
  const fam = familyOf(mc, m === "dunns" ? "dunns" : undefined);
  const adjFor = fam && !uncorrected ? familyAdjustedFor(fam) : "";
  const note = uncorrected ? " (not corrected for multiple comparisons)"
    : adjFor ? ` (P values ${adjFor})` : "";
  return `${name}${note}: ${items.join("; ")}.`;
}

function anovaSentences(r: R, f: Fmt, eff: EffectRow | null): string[] {
  const groups = Array.isArray(r.group_summaries) ? r.group_summaries.map((g: R) => String(g.name)) : [];
  const across = groups.length ? ` across ${list(groups)}` : "";
  if (r.kind === "nonparametric") {
    const k = groups.length;
    const stat = f.style === "nejm" ? `H, ${f.n(r.H)}` : `H${k > 1 && f.style === "apa" ? `(${k - 1})` : ""} = ${f.n(r.H)}`;
    const head = f.style === "nejm"
      ? `Groups${across} were compared by the Kruskal-Wallis test (${join([stat, eff ? effectText(eff, f) : null, f.p(r.p)], "; ")}).`
      : `The Kruskal-Wallis test${across} gave ${join([stat, f.p(r.p), eff ? effectText(eff, f) : null])}.`;
    return [head, posthocSentence(r.dunns, f, "dunns")].filter(Boolean) as string[];
  }
  const t = r.table ?? {};
  const stat = fStat(f, t.F, t.df_between, t.df_within);
  const head = f.style === "nejm"
    ? `Group means${across} were compared by ordinary one-way ANOVA (${join([stat, eff ? effectText(eff, f) : null, f.p(t.p)], "; ")}).`
    : `An ordinary one-way ANOVA${across} gave ${join([stat, f.p(t.p), eff ? effectText(eff, f) : null])}.`;
  return [head, posthocSentence(r.multiple_comparisons, f)].filter(Boolean) as string[];
}

function welchAnovaSentences(r: R, f: Fmt): string[] {
  const w = r.welch ?? {}, bf = r.brown_forsythe ?? {};
  const ws = fStat(f, w.W, w.dfn, w.dfd, "W");
  const bs = fStat(f, bf.F, bf.dfn, bf.dfd, "F*");
  const head = f.style === "nejm"
    ? `Group means were compared without assuming equal SDs (Welch's ANOVA: ${ws}; ${f.p(w.p)}; Brown-Forsythe ANOVA: ${bs}; ${f.p(bf.p)}).`
    : `Without assuming equal SDs, Welch's ANOVA gave ${join([ws, f.p(w.p)])} and the Brown-Forsythe ANOVA ${join([bs, f.p(bf.p)])}.`;
  return [head, posthocSentence(r.multiple_comparisons, f)].filter(Boolean) as string[];
}

function rmSentences(r: R, f: Fmt, eff: EffectRow | null): string[] {
  const t = r.table ?? {};
  const e = t.gg_epsilon;
  const df1 = num(e) ? e * t.df_treatment : t.df_treatment;
  const df2 = num(e) ? e * t.df_error : t.df_error;
  const stat = fStat(f, t.F, df1, df2);
  const eps = num(e) ? `Geisser-Greenhouse ε = ${f.n(e)}` : null;
  const head = f.style === "nejm"
    ? `Matched values (${r.n_subjects} subjects) were compared by repeated-measures one-way ANOVA (${join([stat, eps, eff ? effectText(eff, f) : null, f.p(t.p_geisser_greenhouse)], "; ")}).`
    : `A repeated-measures one-way ANOVA (${r.n_subjects} subjects; ${eps ?? "no correction"}) gave ${join([stat, f.p(t.p_geisser_greenhouse), eff ? effectText(eff, f) : null])}.`;
  return [head, posthocSentence(r.multiple_comparisons, f)].filter(Boolean) as string[];
}

function friedmanSentences(r: R, f: Fmt, eff: EffectRow | null): string[] {
  const k = Array.isArray(r.names) ? r.names.length : 0;
  const stat = f.style === "nejm" ? `χ², ${f.n(r.statistic)}`
    : `χ²${f.style === "apa" && k > 1 ? `(${k - 1})` : ""} = ${f.n(r.statistic)}`;
  const how = `Friedman test${pNoteOf(r, f)}`;
  const head = f.style === "nejm"
    ? `Matched values (${r.n_subjects} subjects) were compared by the ${how} (${join([stat, eff ? effectText(eff, f) : null, f.p(r.p)], "; ")}).`
    : `The ${how} (${r.n_subjects} subjects) gave ${join([stat, f.p(r.p), eff ? effectText(eff, f) : null])}.`;
  return [head, posthocSentence(r.dunns, f, "dunns")].filter(Boolean) as string[];
}

const TERM_NAMES: Record<string, string> = {
  interaction: "interaction", row_factor: "row factor", column_factor: "column factor",
};

function factorialSentences(r: R, f: Fmt, prefs: Pick<ReportPrefs, "smd" | "variance">,
  title: string): string[] {
  const sources: R = r.sources ?? {};
  const res = sources.residual;
  const groups = effectGroups(r, prefs);
  const terms = Object.entries(sources).filter(([k, s]) => k !== "residual" && k !== "subjects"
    && num((s as R).F));
  const items = terms.map(([k, s]) => {
    const src = s as R;
    const name = (Array.isArray(r.factor_names) && k === "row_factor" ? r.factor_names[0]
      : Array.isArray(r.factor_names) && k === "column_factor" ? r.factor_names[1] : null)
      ?? TERM_NAMES[k] ?? k;
    const gg = num(src.p_geisser_greenhouse) && num(r.gg_epsilon);
    const df2 = num(src.df_error) ? src.df_error : num(res?.df) ? res.df : null;
    const stat = fStat(f, src.F, gg ? r.gg_epsilon * src.df : src.df,
      gg && num(df2) ? r.gg_epsilon * df2 : df2);
    const p = gg ? src.p_geisser_greenhouse : src.p;
    const label = TERM_NAMES[k] ? `${name}` : name;
    const g = groups.find((x) => x.title === label || x.title?.toLowerCase() === (TERM_NAMES[k] ?? k)
      || x.title === k);
    const eff = g?.rows.find((x) => x.preferred) ?? null;
    return f.style === "nejm"
      ? `${label}: ${join([stat, eff ? effectText(eff, f) : null, f.p(p)], "; ")}`
      : `${label}, ${join([stat, f.p(p), eff ? effectText(eff, f) : null])}`;
  });
  const gg = num(r.gg_epsilon) ? ` (repeated factors Geisser-Greenhouse corrected, ε = ${f.n(r.gg_epsilon)})` : "";
  const head = items.length ? `A ${title}${gg} gave: ${items.join("; ")}.` : "";
  const mc = r.multiple_comparisons;
  const post = posthocSentence(mc, f, undefined, true);
  return [head, post].filter(Boolean) as string[];
}

// ------------------------------------------------------- other analyses

function multiTSentences(r: R, f: Fmt, prefs: Pick<ReportPrefs, "smd" | "variance">): string[] {
  const info = describeResult(r);
  const names: string[] = Array.isArray(r.names) ? r.names : ["A", "B"];
  const groups = effectGroups(r, prefs);
  const rows: R[] = Array.isArray(r.rows) ? r.rows : [];
  const fdr = r.approach === "fdr" || num(r.q);
  const items = rows.map((row) => {
    const stat = num(row.statistic) ? (f.style === "apa"
      ? `${row.statistic_name ?? "t"}${num(row.df) ? `(${f.df(row.df)})` : ""} = ${f.n(Math.abs(row.statistic))}`
      : f.style === "graphpad" ? `${row.statistic_name ?? "t"} = ${f.n(Math.abs(row.statistic))}${num(row.df) ? `, df = ${f.df(row.df)}` : ""}`
        : null) : null;
    const g = groups.find((x) => x.title === String(row.row));
    const eff = g?.rows.find((x) => x.preferred) ?? null;
    const adj = num(row.q_value) ? f.p(row.q_value, "q") : num(row.p_adjusted) ? f.p(row.p_adjusted, "adjusted P") : null;
    return `${row.row}, ${join([stat, num(row.p) ? f.p(row.p) : null, adj, eff ? effectText(eff, f) : null])}`;
  });
  const corr = fdr ? `${info.posthoc}, Q = ${num(r.q) ? `${r.q}%` : "5%"}` : info.posthoc;
  return items.length ? [`${cap(info.test ?? "multiple t tests")} comparing ${names[0]} and ${names[1]}, two-tailed, with ${corr}: ${items.join("; ")}.`] : [];
}

function correlationSentence(r: R, f: Fmt): string {
  const [a, b] = Array.isArray(r.names) ? r.names : ["X", "Y"];
  const sym = r.method === "spearman" ? (f.style === "apa" ? "rs" : "Spearman r")
    : r.method === "kendall" ? (f.style === "apa" ? "τb" : "Kendall's tau-b")
      : (f.style === "apa" ? "r" : "Pearson r");
  const c = ci2(r.ci_r);
  const df = num(r.n) && r.method !== "kendall" ? r.n - 2 : null;
  if (f.style === "nejm") {
    return `${cap(a)} and ${b} were correlated (${sym}, ${f.n(r.r, true)}${c ? `; ${f.ci(c, 0.95, true)}` : ""}; ${f.p(r.p_two_tailed)}, two-tailed; ${r.n} pairs).`;
  }
  if (f.style === "apa") {
    return `${cap(a)} and ${b}: ${sym}${num(df) ? `(${df})` : ""} = ${f.n(r.r, true)}${c ? `, ${f.ci(c, 0.95, true)}` : ""}, ${f.p(r.p_two_tailed)} (two-tailed, ${r.n} pairs).`;
  }
  return `${cap(a)} vs. ${b}: ${sym} = ${f.n(r.r)}${c ? `, ${f.ci(c)}` : ""}, ${f.p(r.p_two_tailed)} (two-tailed, n = ${r.n} pairs).`;
}

function contingencySentence(r: R, f: Fmt, eff: EffectRow | null): string {
  const parts: string[] = [];
  const chi = r.chi_square;
  if (r.rows === 2 && r.cols === 2 && num(r.fisher_exact?.p)) {
    parts.push(`Fisher's exact test (two-sided), ${f.p(r.fisher_exact.p)}`);
  }
  if (chi && num(chi.chi2)) {
    const s = f.style === "apa" ? `χ²(${chi.df}, N = ${r.total}) = ${f.n(chi.chi2)}`
      : f.style === "nejm" ? `χ², ${f.n(chi.chi2)}` : `chi-square = ${f.n(chi.chi2)}, df = ${chi.df}`;
    parts.push(`${f.style === "apa" ? "" : "chi-square test: "}${s}, ${f.p(chi.p)}`.replace(/^: /, ""));
  }
  if (eff) parts.push(effectText(eff, f));
  for (const [k, label] of [["odds_ratio", "odds ratio"], ["relative_risk", "relative risk"]] as const) {
    const o = r[k];
    if (o && num(o.value)) {
      const c = ci2(o.ci);
      parts.push(f.style === "apa" ? `${label} = ${f.n(o.value)}${c ? `, ${f.ci(c)}` : ""}`
        : `${label} ${f.style === "nejm" ? ", " : ""}${f.n(o.value)}${c ? ` (${f.ci(c)})` : ""}`.replace(" , ", ", "));
    }
  }
  return parts.length ? `${cap(parts.join("; "))} (N = ${r.total}).` : "";
}

function survivalSentence(r: R, f: Fmt): string {
  const lr = r.logrank;
  const parts: string[] = [];
  if (lr && num(lr.chi2)) {
    parts.push(f.style === "apa" ? `log-rank (Mantel-Cox) χ²(${lr.df}) = ${f.n(lr.chi2)}, ${f.p(lr.p)}`
      : f.style === "nejm" ? `${f.p(lr.p)} by the log-rank test`
        : `log-rank (Mantel-Cox) test: chi-square = ${f.n(lr.chi2)}, df = ${lr.df}, ${f.p(lr.p)}`);
  }
  const hr = r.hazard_ratio;
  if (hr && num(hr.value)) {
    const c = ci2(hr.ci);
    parts.push(f.style === "apa" ? `hazard ratio (Mantel-Haenszel) = ${f.n(hr.value)}${c ? `, ${f.ci(c)}` : ""}`
      : `hazard ratio (Mantel-Haenszel), ${f.n(hr.value)}${c ? ` (${f.ci(c)})` : ""}`);
  }
  const curves = r.curves && typeof r.curves === "object" ? r.curves as R : {};
  const meds = Object.entries(curves).map(([name, c]) =>
    `${num((c as R).median_survival) ? minus(formatSig((c as R).median_survival)) : "undefined"} (${name}, ${(c as R).n_events} events of ${(c as R).n})`);
  if (meds.length) parts.push(`median survival ${meds.join(" and ")}`);
  return parts.length ? `${cap(parts.join("; "))} (two-sided).` : "";
}

function nestedSentences(r: R, f: Fmt): string[] {
  if (r.analysis === "nested_t_test") {
    const c = ci2(r.ci);
    const stat = f.style === "apa" ? `t(${f.df(r.df)}) = ${f.n(Math.abs(r.t))}`
      : f.style === "graphpad" ? `t = ${f.n(Math.abs(r.t))}, df = ${f.df(r.df)}` : null;
    const cmp = String(r.comparison ?? "").replace(" - ", " − ");
    const diff = num(r.difference) ? `difference (${cmp})${f.style === "apa" ? " = " : f.style === "nejm" ? ", " : " "}${f.n(r.difference)}${c ? `${f.style === "nejm" ? "; " : ", "}${f.ci(c, r.ci_level ?? 0.95)}` : ""}` : null;
    if (f.style === "nejm") return [`The groups were compared by a nested t test with subcolumns as a random factor (${join([diff, `${f.p(r.p)}, two-tailed`], "; ")}).`];
    return [`A nested t test with subcolumns as a random factor (two-tailed) gave ${join([stat, f.p(r.p), diff])}.`];
  }
  const stat = fStat(f, r.F, r.df_num, r.df_den);
  const head = f.style === "nejm"
    ? `Group means were compared by nested one-way ANOVA with subcolumns as a random factor (${join([stat, f.p(r.p)], "; ")}).`
    : `A nested one-way ANOVA with subcolumns as a random factor gave ${join([stat, f.p(r.p)])}.`;
  return [head, posthocSentence(r.multiple_comparisons, f)].filter(Boolean) as string[];
}

function doseResponseSentences(r: R, f: Fmt): string[] {
  const out: string[] = [];
  for (const ds of Array.isArray(r.datasets) ? r.datasets : []) {
    const fit = ds?.fit;
    if (!fit?.params) continue;
    const order: string[] = Array.isArray(fit.param_order) ? fit.param_order : Object.keys(fit.params);
    // An IC50 beyond the doses tested (sheets/xy/rangeReport.ts): "IC50 >
    // 30 µM (not reached in the range tested)", or the number, flagged.
    const rd = fit.range_flags?.display;
    const flagged = (k: string) => !!rd && (k === rd.label || k === rd.param);
    const hasLabel = !!rd && order.includes(rd.label);
    const items = order.map((k) => {
      const e = fit.params[k];
      if (!e || !num(e.value)) return null;
      if (rd && rd.mode === "bound" && flagged(k)) {
        if (hasLabel && k !== rd.label) return null;
        return k === rd.label ? String(rd.text) : `${k} ${rd.logBound ?? rd.bound} (not reached in the range tested)`;
      }
      if (rd && rd.mode === "bound" && /ratio|potency/i.test(k)) return `${k} undefined (${rd.label} ${rd.boundWithUnit})`;
      const c = ci2(e.ci95);
      const v = (x: number) => (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e5 ? minus(formatSig(x, 3)) : f.n(x));
      const ci = c ? (f.style === "apa" ? `, 95% CI [${v(c[0])}, ${v(c[1])}]`
        : f.style === "nejm" ? ` (95% CI, ${v(c[0])} to ${v(c[1])})` : `, 95% CI ${v(c[0])} to ${v(c[1])}`) : "";
      const flag = rd && rd.mode === "fitted" && flagged(k)
        ? ` (extrapolated, ${rd.relation === ">" ? "above" : "below"} the range tested)` : "";
      return `${k} = ${v(e.value)}${ci}${flag}`;
    }).filter(Boolean);
    const r2 = fit.goodness?.r_squared;
    const r2s = num(r2) ? (f.style === "graphpad" ? f.n(r2) : r2.toFixed(3).replace(/^0/, f.style === "apa" ? "" : "0")) : "";
    out.push(`${ds.name}: ${items.join("; ")}${num(r2) ? `; R² = ${r2s}` : ""} (${fit.label ?? "nonlinear regression"}, least squares).`);
  }
  return out;
}

function columnStatsSentences(r: R, f: Fmt, prefs: Pick<ReportPrefs, "smd" | "variance">): string[] {
  const groups = effectGroups(r, prefs);
  return (Array.isArray(r.datasets) ? r.datasets : []).map((ds: R) => {
    const d = ds.descriptive ?? {};
    const desc = f.style === "apa" ? `${ds.name} (M = ${f.n(d.mean)}, SD = ${f.n(d.sd)}, n = ${d.n})`
      : `${ds.name}: mean ${f.n(d.mean)} (SD ${f.n(d.sd)}), n = ${d.n}`;
    const t = ds.one_sample_t;
    if (!t) return `${desc}.`;
    const g = groups.find((x) => x.title === `${ds.name}: one-sample t test`);
    const eff = g?.rows.find((x) => x.preferred) ?? null;
    const stat = f.style === "apa" ? `t(${t.df}) = ${f.n(Math.abs(t.t))}`
      : f.style === "graphpad" ? `t = ${f.n(Math.abs(t.t))}, df = ${t.df}` : null;
    return `${desc}; one-sample t test against ${t.hypothetical} (two-tailed): ${join([stat, f.p(t.p_two_tailed), eff ? effectText(eff, f) : null])}.`;
  });
}

const EFFECT_WORDS: Record<string, string> = {
  mean_diff: "mean difference", median_diff: "median difference", cohens_d: "Cohen's d",
  hedges_g: "Hedges' g", cliffs_delta: "Cliff's δ",
};

function estimationSentences(r: R, f: Fmt): string[] {
  const ciName = r.ci_type === "percentile" ? "percentile bootstrap" : "bias-corrected and accelerated (BCa) bootstrap";
  return (Array.isArray(r.comparisons) ? r.comparisons : []).flatMap((c: R) =>
    (Array.isArray(c.effects) ? c.effects : []).map((e: R) => {
      const ci = ci2(e.ci);
      const what = EFFECT_WORDS[String(e.effect)] ?? String(e.label ?? e.effect);
      const perm = e.permutation && num(e.permutation.p)
        ? `two-sided permutation ${f.p(e.permutation.p)}${e.permutation.exact ? " (exact)" : ` (${e.permutation.n_permutations} permutations)`}`
        : null;
      const paired = c.paired ? "paired " : "";
      const boot = `${ciName}, ${e.bootstrap?.n_resamples ?? r.n_resamples} resamples`;
      if (f.style === "nejm") {
        return `The ${paired}${what} between ${c.test} and ${c.control} was ${f.n(e.difference)} (${join([ci ? f.ci(ci, e.ci_level) : null, boot, perm], "; ")}).`;
      }
      return `The ${paired}${what} between ${c.test} and ${c.control} (${c.test} − ${c.control}) was ${f.n(e.difference)}${ci ? `, ${f.ci(ci, e.ci_level)}` : ""} (${boot})${perm ? `; ${perm}` : ""}.`;
    }));
}

function demingSentences(r: R, f: Fmt): string[] {
  return (Array.isArray(r.datasets) ? r.datasets : []).map((ds: R) => {
    const fit = ds?.fit;
    if (!fit?.slope) return "";
    const s = fit.slope, i = fit.y_intercept;
    const part = (name: string, e: R) => {
      const c = ci2(e?.ci);
      return num(e?.value) ? `${name} ${f.style === "apa" ? "= " : ""}${f.n(e.value)}${c ? `, ${f.ci(c, fit.ci_level ?? 0.95)}` : ""}` : null;
    };
    return `${ds.name}: Deming regression (${fit.n} pairs), ${join([part("slope", s), part("Y intercept", i)], "; ")}.`;
  }).filter(Boolean);
}

function proportionSentence(r: R, f: Fmt): string {
  const g: R[] = Array.isArray(r.groups) ? r.groups : [];
  const names: string[] = Array.isArray(r.names) ? r.names : [];
  const props = g.map((x, i) => `${names[i] ?? `Group ${i + 1}`} ${x.successes}/${x.trials} (${f.n(100 * x.proportion)}%)`);
  const d = r.difference_ci;
  const dc = ci2(d?.ci);
  return `${cap(props.join(" vs. "))}${d && num(d.value) ? `; difference ${f.n(d.value)}${dc ? `, ${f.ci(dc)}` : ""}` : ""}${num(r.fisher_exact?.p) ? `; Fisher's exact test (two-sided), ${f.p(r.fisher_exact.p)}` : ""}.`;
}

/** P withheld (fewer than two independent values in a group): the values
 *  described, labelled exploratory, and why there is no P. */
function withheldSentence(w: WithheldInfo, f: Fmt): string {
  const means = w.all.filter((g) => g.mean !== null);
  const vals = means.map((g) => `${g.name} ${f.n(g.mean as number)}${g.n > 1 ? ` (mean of ${g.n})` : ""}`);
  const diff = means.length === 2 ? `; difference ${f.n((means[0].mean as number) - (means[1].mean as number))} `
    + `(${means[0].name} − ${means[1].name})` : "";
  return `Descriptive results only, exploratory (${withheldPhrase(w)})`
    + (vals.length ? `: ${list(vals)}${diff}.` : ".")
    + " No P value was computed: one independent value per group gives no estimate of the "
    + "variability within groups.";
}

/**
 * The results sentences of a result (empty when the analysis has nothing
 * to report as a sentence, or failed). `options` is the analysis' options
 * (unused by most: the result carries what was done).
 */
export function resultSentences(result: unknown, ctx: SentenceContext = {}): string[] {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error) return [];
  const style = ctx.style ?? DEFAULT_REPORT.pStyle;
  const prefs = ctx.prefs ?? DEFAULT_REPORT;
  const f = makeFmt(style);
  const wh = withheldInfo(r);
  if (wh) return [withheldSentence(wh, f)];
  const eff = primaryEffect(effectGroups(r, prefs));
  try {
    switch (r.analysis) {
      case "ttest": return [ttestSentence(r, f, eff)].filter(Boolean);
      case "ks_test": return [ttestSentence({ ...r, test: "kolmogorov_smirnov" }, f, null)].filter(Boolean);
      case "anova": return anovaSentences(r, f, eff);
      case "anova_unequal_var": return welchAnovaSentences(r, f);
      case "rm_one_way_anova": return rmSentences(r, f, eff);
      case "friedman": return friedmanSentences(r, f, eff);
      case "two_way_anova": return factorialSentences(r, f, prefs, "two-way ANOVA");
      case "rm_two_way_mixed": return factorialSentences(r, f, prefs, "two-way repeated-measures ANOVA, mixed design");
      case "rm_two_way_both": return factorialSentences(r, f, prefs, "two-way repeated-measures ANOVA");
      case "three_way_anova": return factorialSentences(r, f, prefs, "three-way ANOVA");
      case "multiple_row_tests": return multiTSentences(r, f, prefs);
      case "correlation": return [correlationSentence(r, f)];
      case "contingency": return [contingencySentence(r, f, eff)].filter(Boolean);
      case "mcnemar": {
        const o = r.odds_ratio, c = ci2(o?.ci);
        return [`McNemar's test on ${r.n_pairs} pairs (discordant ${r.discordant?.join(" and ")}): ${f.style === "apa" ? `χ²(1) = ${f.n(r.chi_square?.chi2)}, ` : ""}${f.p(r.recommended_p ?? r.chi_square?.p)} (two-sided)${o && num(o.value) ? `; odds ratio ${f.n(o.value)}${c ? `, ${f.ci(c)}` : ""}` : ""}.`];
      }
      case "kappa": {
        const c = ci2(r.ci);
        return [`Agreement: Cohen's κ = ${f.n(r.kappa, true)}${c ? `, ${f.ci(c, 0.95, true)}` : ""}${num(r.p) ? `, ${f.p(r.p)}` : ""}.`];
      }
      case "proportion_test": return [proportionSentence(r, f)];
      case "survival": return [survivalSentence(r, f)].filter(Boolean);
      case "nested_t_test":
      case "nested_one_way_anova": return nestedSentences(r, f);
      case "dose_response": return doseResponseSentences(r, f);
      case "deming": return demingSentences(r, f);
      case "column_statistics": return columnStatsSentences(r, f, prefs);
      case "estimation": return estimationSentences(r, f);
      default: return [];
    }
  } catch {
    return [];
  }
}

/** The sentences as one paragraph ("" when there are none). */
export function resultSentence(result: unknown, ctx: SentenceContext = {}): string {
  return resultSentences(result, ctx).join(" ");
}
