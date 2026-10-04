// Power and sample size: the tool's form, the engine payloads (handler
// "power", engine/opendose/power.py), effect-size helpers, power curves,
// randomisation lists and the sample-size justification kept in the
// project. Pure (no React), unit-tested in __tests__/power.test.ts.
import type { InfoSheet, Project } from "../project/types.ts";
import { formatSig } from "../types.ts";

export type PowerKind =
  | "t_two_sample" | "t_paired" | "t_one_sample" | "anova_oneway"
  | "two_proportions" | "one_proportion" | "mcnemar" | "correlation"
  | "logrank" | "chi_square";

export type Solve = "n" | "power" | "effect";

export interface PowerFamily { label: string; kinds: PowerKind[] }

export const FAMILIES: PowerFamily[] = [
  { label: "t tests (means)", kinds: ["t_two_sample", "t_paired", "t_one_sample"] },
  { label: "F tests (ANOVA)", kinds: ["anova_oneway"] },
  { label: "Proportions", kinds: ["two_proportions", "one_proportion", "mcnemar", "chi_square"] },
  { label: "Correlation", kinds: ["correlation"] },
  { label: "Survival", kinds: ["logrank"] },
];

export const KIND_LABELS: Record<PowerKind, string> = {
  t_two_sample: "Two independent groups (unpaired t test)",
  t_paired: "Paired / matched (paired t test)",
  t_one_sample: "One group vs a reference value (one-sample t test)",
  anova_oneway: "One-way ANOVA, k groups",
  two_proportions: "Two independent proportions",
  one_proportion: "One proportion vs a reference (exact binomial)",
  mcnemar: "Paired proportions (McNemar)",
  chi_square: "Chi-square test (goodness of fit / contingency)",
  correlation: "Pearson correlation vs ρ0",
  logrank: "Two survival curves (log-rank test)",
};

/** Kinds whose test can be one- or two-sided (the F and χ² tests cannot). */
export const HAS_TAILS: Record<PowerKind, boolean> = {
  t_two_sample: true, t_paired: true, t_one_sample: true, anova_oneway: false,
  two_proportions: true, one_proportion: true, mcnemar: true, chi_square: false,
  correlation: true, logrank: true,
};

/** Every input as typed (strings), so the form keeps what the user wrote. */
export interface PowerForm {
  kind: PowerKind;
  solve: Solve;
  alpha: string;
  power: string;
  tails: "1" | "2";
  /** Per group (two-group kinds), subjects / pairs, or total (χ², log-rank). */
  n: string;
  ratio: string;
  d: string;
  mean1: string; mean2: string; sd: string;
  f: string; k: string; groupMeans: string; groupSd: string;
  p1: string; p2: string; propMethod: "z" | "z_cc" | "arcsine" | "fisher_exact";
  p0: string; p: string;
  oddsRatio: string; pDiscordant: string;
  rho: string; rho0: string; corrMethod: "exact" | "fisher_z";
  hr: string; medianControl: string; medianTreated: string;
  accrual: string; followup: string; lrMethod: "schoenfeld" | "freedman";
  w: string; df: string;
  unit: string; attrition: string; effectSource: string;
  /** Detectable effect in raw units: where the SD comes from (two-group t
   *  test: one common SD or the two group SDs, pooled), the group SDs and
   *  the unit of the measurement ("mmol/L"). The common SD is `sd`; the
   *  ANOVA's within-group SD is `groupSd`. */
  sdSource: "common" | "groups";
  sd1: string; sd2: string;
  measureUnit: string;
}

export function defaultForm(): PowerForm {
  return {
    kind: "t_two_sample", solve: "n", alpha: "0.05", power: "0.8", tails: "2",
    n: "20", ratio: "1",
    d: "0.8", mean1: "", mean2: "", sd: "",
    f: "0.25", k: "3", groupMeans: "", groupSd: "",
    p1: "0.5", p2: "0.75", propMethod: "z",
    p0: "0.65", p: "0.8",
    oddsRatio: "0.25", pDiscordant: "0.4",
    rho: "0.3", rho0: "0", corrMethod: "exact",
    hr: "0.5", medianControl: "", medianTreated: "", accrual: "", followup: "",
    lrMethod: "schoenfeld",
    w: "0.3", df: "1",
    unit: "animals", attrition: "", effectSource: "",
    sdSource: "common", sd1: "", sd2: "", measureUnit: "",
  };
}

const num = (s: string): number | null => {
  const t = String(s).trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** A probability from "0.8" or "80" (percent). */
const prob = (s: string): number | null => {
  const v = num(s);
  if (v === null) return null;
  return v > 1 ? v / 100 : v;
};

const list = (s: string): number[] =>
  s.split(/[,;\s]+/).map((v) => num(v)).filter((v): v is number => v !== null);

// ------------------------------------------------------------ effect helpers

/** Cohen's d from two means and a common SD. */
export function dFromMeans(m1: number, m2: number, sd: number): number | null {
  return sd > 0 ? Math.abs(m1 - m2) / sd : null;
}

/** Cohen's f from k group means (equal n) and the common within-group SD. */
export function fFromMeans(means: number[], sd: number): number | null {
  if (means.length < 2 || !(sd > 0)) return null;
  const mu = means.reduce((a, b) => a + b, 0) / means.length;
  return Math.sqrt(means.reduce((a, m) => a + (m - mu) ** 2, 0) / means.length) / sd;
}

/** Cohen's h for two proportions. */
export function hFromProportions(p1: number, p2: number): number {
  return Math.abs(2 * Math.asin(Math.sqrt(p2)) - 2 * Math.asin(Math.sqrt(p1)));
}

/** Hazard ratio (treated vs control) from median survival times under
 *  exponential survival: the hazard is ln 2 / median. */
export function hrFromMedians(medianControl: number, medianTreated: number): number | null {
  return medianControl > 0 && medianTreated > 0 ? medianControl / medianTreated : null;
}

// ------------------------------------------------------------ payloads

/** Name of the effect parameter each kind solves for (and draws curves of). */
export const EFFECT_PARAM: Record<PowerKind, string> = {
  t_two_sample: "d", t_paired: "d", t_one_sample: "d", anova_oneway: "f",
  two_proportions: "p2", one_proportion: "p", mcnemar: "odds_ratio", correlation: "rho",
  logrank: "hr", chi_square: "w",
};

/** Name of the sample-size parameter for solve = power / effect. */
export const N_PARAM: Record<PowerKind, string> = {
  t_two_sample: "n1", t_paired: "n", t_one_sample: "n", anova_oneway: "n",
  two_proportions: "n1", one_proportion: "n", mcnemar: "n", correlation: "n",
  logrank: "n", chi_square: "n",
};

export const N_LABEL: Record<PowerKind, string> = {
  t_two_sample: "n per group (group 1)", t_paired: "Pairs", t_one_sample: "Subjects",
  anova_oneway: "n per group", two_proportions: "n per group (group 1)", one_proportion: "Subjects",
  mcnemar: "Pairs", correlation: "Pairs of values", logrank: "Subjects in total",
  chi_square: "Total sample size",
};

/** Log-rank without survival times counts events, not subjects. */
const lrEvents = (f: PowerForm) => f.kind === "logrank" && num(f.medianControl) === null;

export function nParam(f: PowerForm): string {
  return lrEvents(f) ? "events" : N_PARAM[f.kind];
}

export function nLabel(f: PowerForm): string {
  return lrEvents(f) ? "Events" : N_LABEL[f.kind];
}

export type Payload = { analysis: "power"; data: Record<string, never>; options: Record<string, unknown> };

/** Engine options for one calculation, or the first input problem. */
export function powerOptions(f: PowerForm, override: { solve?: Solve; n?: number; effect?: number } = {}):
  { error: string } | { options: Record<string, unknown> } {
  const solve = override.solve ?? f.solve;
  const alpha = prob(f.alpha);
  if (alpha === null || !(alpha > 0 && alpha < 0.5)) return { error: "α must be between 0 and 0.5 (e.g. 0.05)." };
  const o: Record<string, unknown> = { kind: f.kind, solve, alpha };
  if (solve !== "power") {
    const pw = prob(f.power);
    if (pw === null || !(pw > alpha && pw < 1)) return { error: "Power must be between α and 1 (e.g. 0.8 or 80%)." };
    o.power = pw;
  }
  if (HAS_TAILS[f.kind]) o.tails = f.tails === "1" ? 1 : 2;
  if (solve !== "n") {
    const n = override.n ?? num(f.n);
    if (n === null || n < 2) return { error: `${nLabel(f)}: enter a whole number of at least 2.` };
    o[nParam(f)] = Math.round(n);
  }
  const need = (name: string, v: number | null, check: (x: number) => boolean, msg: string) => {
    if (v === null || !check(v)) throw new Error(`${name}: ${msg}`);
    return v;
  };
  const effect = override.effect;
  const solvingEffect = solve === "effect";
  try {
    switch (f.kind) {
      case "t_two_sample": case "t_paired": case "t_one_sample":
        if (!solvingEffect) o.d = need("Effect size d", effect ?? num(f.d), (x) => x > 0, "enter a positive number");
        if (f.kind === "t_two_sample") o.ratio = need("Allocation ratio", num(f.ratio), (x) => x > 0, "enter n2 / n1 (1 = equal groups)");
        break;
      case "anova_oneway":
        o.k = need("Groups (k)", num(f.k), (x) => x >= 2 && Number.isInteger(x), "enter a whole number of at least 2");
        if (!solvingEffect) o.f = need("Effect size f", effect ?? num(f.f), (x) => x > 0, "enter a positive number");
        break;
      case "two_proportions":
        o.p1 = need("Proportion 1", prob(f.p1), (x) => x > 0 && x < 1, "between 0 and 1");
        if (!solvingEffect) {
          o.p2 = need("Proportion 2", effect ?? prob(f.p2), (x) => x > 0 && x < 1 && x !== o.p1, "between 0 and 1, different from proportion 1");
        } else if (prob(f.p2) !== null) o.p2 = prob(f.p2);
        o.ratio = need("Allocation ratio", num(f.ratio), (x) => x > 0, "enter n2 / n1");
        o.method = f.propMethod;
        break;
      case "one_proportion":
        o.p0 = need("Reference proportion", prob(f.p0), (x) => x > 0 && x < 1, "between 0 and 1");
        if (!solvingEffect) o.p = need("Expected proportion", effect ?? prob(f.p), (x) => x > 0 && x < 1 && x !== o.p0, "between 0 and 1, different from the reference");
        else if (prob(f.p) !== null) o.p = prob(f.p);
        break;
      case "mcnemar":
        o.p_discordant = need("Discordant pairs", prob(f.pDiscordant), (x) => x > 0 && x < 1, "a proportion between 0 and 1");
        if (!solvingEffect) o.odds_ratio = need("Odds ratio", effect ?? num(f.oddsRatio), (x) => x > 0 && x !== 1, "positive and not 1");
        break;
      case "correlation":
        o.rho0 = need("ρ0", num(f.rho0), (x) => x > -1 && x < 1, "between −1 and 1");
        if (!solvingEffect) o.rho = need("ρ", effect ?? num(f.rho), (x) => x > -1 && x < 1 && x !== o.rho0, "between −1 and 1, different from ρ0");
        o.method = f.corrMethod;
        break;
      case "logrank": {
        if (!solvingEffect) o.hr = need("Hazard ratio", effect ?? num(f.hr), (x) => x > 0 && x !== 1, "positive and not 1");
        o.ratio = need("Allocation ratio", num(f.ratio), (x) => x > 0, "enter n2 / n1");
        o.method = f.lrMethod;
        const mc = num(f.medianControl);
        const acc = num(f.accrual) ?? 0;
        const fu = num(f.followup);
        if (mc !== null) {
          o.median_control = need("Median survival, control", mc, (x) => x > 0, "positive");
          o.accrual = need("Accrual period", acc, (x) => x >= 0, "zero or positive");
          o.followup = need("Follow-up after accrual", fu, (x) => x > 0, "positive (same unit as the medians)");
        }
        break;
      }
      case "chi_square":
        o.df = need("Degrees of freedom", num(f.df), (x) => x >= 1 && Number.isInteger(x), "a whole number of at least 1");
        if (!solvingEffect) o.w = need("Effect size w", effect ?? num(f.w), (x) => x > 0, "positive");
        break;
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { options: o };
}

/** The payload of the main calculation, with the justification sentence. */
export function powerPayload(f: PowerForm): { error: string } | { payload: Payload } {
  const r = powerOptions(f);
  if ("error" in r) return r;
  const attrition = prob(f.attrition);
  return {
    payload: {
      analysis: "power", data: {},
      options: {
        ...r.options,
        justification: {
          unit: f.unit.trim() || "subjects",
          ...(f.effectSource.trim() ? { effect_source: f.effectSource.trim() } : {}),
          ...(attrition !== null && attrition > 0 && attrition < 1 ? { attrition } : {}),
        },
      },
    },
  };
}

// ------------------------------------------------------------ results

export interface PowerResult {
  error?: string;
  kind: PowerKind;
  solve: Solve;
  alpha: number;
  tails: number | null;
  power: number;
  target_power?: number;
  n_total: number;
  n_per_group?: number[] | null;
  n?: number;
  n1?: number;
  n2?: number;
  n_exact?: number;
  n1_exact?: number;
  n_total_exact?: number;
  k?: number;
  ratio?: number;
  equal_n?: boolean;
  effect: { name: string; value: number; [k: string]: unknown };
  ncp?: number;
  df?: number;
  df1?: number;
  df2?: number;
  critical_t?: number;
  critical_f?: number;
  critical_chi2?: number;
  critical_r?: number[];
  lower_critical?: number | null;
  upper_critical?: number | null;
  actual_alpha?: number;
  events?: number;
  events_exact?: number;
  p_event?: number | null;
  justification?: { text: string; allocate: number[] | null };
}

/** The sample size the curves center on (per group / pairs / total, in
 *  the unit N_PARAM reads). */
export function nForCurve(r: PowerResult): number {
  if (r.kind === "t_two_sample" || r.kind === "two_proportions") return r.n1 ?? r.n_per_group?.[0] ?? r.n_total / 2;
  if (r.kind === "anova_oneway") return r.n_per_group?.[0] ?? Math.round(r.n_total / (r.k ?? 1));
  if (r.kind === "logrank" && !r.n_total) return Math.ceil(r.events ?? 2);
  return r.n ?? r.n_total;
}

/** The unrounded (real-valued) sample size of an a priori calculation,
 *  each row saying whether it counts one group or everyone: t tests and
 *  proportions report n1, the ANOVA the total N, the log-rank test the
 *  total subjects; the per-group and total rows are derived from the
 *  allocation ratio (or k). Empty for discrete searches without one
 *  (exact binomial, McNemar, correlation, Fisher's exact). */
export function unroundedN(r: PowerResult): [string, number][] {
  if (r.solve !== "n") return [];
  const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  const twoGroups = (n1: number, ratio: number): [string, number][] => (Math.abs(ratio - 1) < 1e-12
    ? [["Unrounded n per group", n1], ["Unrounded total N", 2 * n1]]
    : [["Unrounded n, group 1", n1], ["Unrounded n, group 2", n1 * ratio],
      ["Unrounded total N", n1 * (1 + ratio)]]);
  switch (r.kind) {
    case "t_two_sample": case "two_proportions":
      return ok(r.n1_exact) ? twoGroups(r.n1_exact, r.ratio ?? 1) : [];
    case "anova_oneway": {
      const N = r.n_total_exact;
      if (!ok(N)) return [];
      return r.equal_n === false ? [["Unrounded total N", N]]
        : [["Unrounded n per group", N / (r.k ?? 1)], ["Unrounded total N", N]];
    }
    case "logrank": {
      if (!ok(r.n_exact)) return [];
      const ratio = r.ratio ?? 1;
      return twoGroups(r.n_exact / (1 + ratio), ratio);
    }
    case "t_paired":
      return ok(r.n_exact) ? [["Unrounded number of pairs", r.n_exact]] : [];
    case "t_one_sample":
      return ok(r.n_exact) ? [["Unrounded n (one group)", r.n_exact]] : [];
    case "chi_square":
      return ok(r.n_exact) ? [["Unrounded total N", r.n_exact]] : [];
    default:
      return [];
  }
}

/** Pooled SD of two groups: √(((n1 − 1)s1² + (n2 − 1)s2²) / (n1 + n2 − 2)). */
export function pooledSd(s1: number, s2: number, n1: number, n2: number): number | null {
  if (!(s1 > 0 && s2 > 0 && n1 >= 1 && n2 >= 1 && n1 + n2 > 2)) return null;
  return Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2));
}

/** One line of a detectable effect in the measurement's own units. */
export interface RawEffect { label: string; value: number; text: string }

/** A detectable (sensitivity) effect size in raw units, from the SD the
 *  user gave: d × SD for t tests (two groups: the common SD, or the pooled
 *  SD of the two group SDs at the result's n1 and n2; paired: d_z × the SD
 *  of the differences); for the one-way ANOVA f × σ (the SD of the group
 *  means) and f × σ × √(2k) (the range of the means when one group is
 *  high, one low and the rest in the middle: Cohen's minimum-variability
 *  pattern). Empty without an SD or for kinds without a raw scale. */
export function rawDetectable(f: PowerForm, r: PowerResult): RawEffect[] {
  if (r.solve !== "effect" || !Number.isFinite(r.effect?.value)) return [];
  const u = f.measureUnit.trim() ? ` ${f.measureUnit.trim()}` : "";
  const fmt = (v: number) => formatSig(v, 3);
  const e = r.effect.value;
  if (r.kind === "t_two_sample" || r.kind === "t_one_sample" || r.kind === "t_paired") {
    let sd: number | null;
    let sdName: string;
    if (r.kind === "t_two_sample" && f.sdSource === "groups") {
      sd = pooledSd(num(f.sd1) ?? NaN, num(f.sd2) ?? NaN, r.n1 ?? NaN, r.n2 ?? NaN);
      sdName = "pooled SD";
    } else {
      const v = num(f.sd);
      sd = v !== null && v > 0 ? v : null;
      sdName = r.kind === "t_paired" ? "SD of the differences" : "SD";
    }
    if (sd === null) return [];
    const value = e * sd;
    const label = r.kind === "t_paired" ? "Detectable mean difference"
      : r.kind === "t_one_sample" ? "Detectable difference from the reference" : "Detectable difference";
    return [{ label, value,
      text: `${fmt(value)}${u} (${r.kind === "t_paired" ? "d_z" : "d"} = ${fmt(e)} × ${sdName} ${fmt(sd)})` }];
  }
  if (r.kind === "anova_oneway") {
    const sd = num(f.groupSd);
    if (sd === null || !(sd > 0)) return [];
    const spread = e * sd;
    const range = spread * Math.sqrt(2 * (r.k ?? 2));
    return [
      { label: "Detectable SD of the group means", value: spread,
        text: `${fmt(spread)}${u} (f = ${fmt(e)} × SD within groups ${fmt(sd)})` },
      { label: "Detectable range of the means", value: range,
        text: `${fmt(range)}${u} (one group high, one low, the rest in between: f × SD × √(2k))` },
    ];
  }
  return [];
}

/** Sample sizes for the power-vs-n curve: about 24 points from 2 to
 *  about twice the result. */
export function nGrid(center: number): number[] {
  const hi = Math.max(10, Math.ceil(center * 2.2));
  const step = Math.max(1, Math.round((hi - 2) / 24));
  const out: number[] = [];
  for (let n = 2; n <= hi; n += step) out.push(n);
  if (!out.includes(Math.round(center))) out.push(Math.round(center));
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Effect sizes for the power-vs-effect curve around the result's effect,
 *  within the parameter's valid range. */
export function effectGrid(kind: PowerKind, e: number, ref: { p1?: number; p0?: number; rho0?: number }): number[] {
  const n = 24;
  let lo: number;
  let hi: number;
  switch (kind) {
    case "two_proportions": case "one_proportion": {
      const base = kind === "two_proportions" ? ref.p1 ?? 0.5 : ref.p0 ?? 0.5;
      if (e > base) { lo = base + (e - base) * 0.15; hi = Math.min(0.995, base + (e - base) * 2.2); }
      else { hi = base - (base - e) * 0.15; lo = Math.max(0.005, base - (base - e) * 2.2); }
      break;
    }
    case "correlation": {
      const base = ref.rho0 ?? 0;
      if (e > base) { lo = base + (e - base) * 0.15; hi = Math.min(0.99, base + (e - base) * 2.2); }
      else { hi = base - (base - e) * 0.15; lo = Math.max(-0.99, base - (base - e) * 2.2); }
      break;
    }
    case "logrank": case "mcnemar": {
      // ratios: spread on the log scale away from 1
      const l = Math.log(e);
      const a = l * 0.15;
      const b = l * 2.2;
      return Array.from({ length: n }, (_, i) => Math.exp(a + ((b - a) * i) / (n - 1)))
        .sort((x, y) => x - y);
    }
    default:
      lo = e * 0.15; hi = e * 2.2;
  }
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

// ------------------------------------------------------------ randomisation

export interface RandomForm {
  n: string;
  groups: string;
  ratio: string;
  method: "block" | "simple" | "shuffled" | "stratified";
  blockSizes: string;
  strata: string;
  seed: string;
  idPrefix: string;
}

export function defaultRandomForm(): RandomForm {
  return { n: "24", groups: "Vehicle, Drug", ratio: "1, 1", method: "block", blockSizes: "4, 6",
    strata: "Male: 12\nFemale: 12", seed: "", idPrefix: "M" };
}

export interface RandomResult {
  error?: string;
  method: string;
  seed: number;
  groups: string[];
  ratio: number[];
  n: number;
  list: { sequence: number; id: string; group: string; block?: number; stratum?: string }[];
  counts: Record<string, number>;
  block_sizes?: number[];
  counts_by_stratum?: Record<string, Record<string, number>>;
}

export function randomOptions(f: RandomForm): { error: string } | { options: Record<string, unknown> } {
  const groups = f.groups.split(/[,;\n]+/).map((g) => g.trim()).filter(Boolean);
  if (groups.length < 2) return { error: "Name at least two groups, separated by commas." };
  if (new Set(groups).size !== groups.length) return { error: "Group names must differ." };
  const ratio = f.ratio.trim() ? list(f.ratio) : groups.map(() => 1);
  if (ratio.length !== groups.length || ratio.some((r) => !(r >= 1) || !Number.isInteger(r))) {
    return { error: "The allocation ratio needs one whole number per group (e.g. 1, 1 or 2, 1)." };
  }
  const o: Record<string, unknown> = { groups, ratio, method: f.method, id_prefix: f.idPrefix };
  const seed = f.seed.trim();
  if (seed) {
    if (!/^\d+$/.test(seed)) return { error: "The seed must be a whole number (or blank for a new one)." };
    o.seed = Number(seed);
  }
  if (f.method === "block" || f.method === "stratified") {
    const unit = ratio.reduce((a, b) => a + b, 0);
    const sizes = f.blockSizes.trim() ? list(f.blockSizes) : [2 * unit];
    if (sizes.some((b) => !Number.isInteger(b) || b < unit || b % unit !== 0)) {
      return { error: `Block sizes must be multiples of ${unit} (the sum of the ratio).` };
    }
    o.block_sizes = sizes;
  }
  if (f.method === "stratified") {
    const strata = f.strata.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const m = /^(.*?)[:=\t,]\s*(\d+)\s*$/.exec(line);
      return m ? { name: m[1].trim(), n: Number(m[2]) } : null;
    });
    if (!strata.length || strata.some((s) => !s || !s.name || !(s.n > 0))) {
      return { error: "Strata: one per line as “name: n”, e.g. “Male: 12”." };
    }
    o.strata = strata;
    o.n = strata.reduce((a, s) => a + s!.n, 0);
  } else {
    const n = num(f.n);
    if (n === null || n < 2 || !Number.isInteger(n) || n > 100000) return { error: "Enter the number of units (a whole number of at least 2)." };
    o.n = n;
  }
  return { options: o };
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The allocation list as CSV (one row per unit). */
export function randomCsv(r: RandomResult): string {
  const hasBlock = r.list.some((x) => x.block !== undefined);
  const hasStratum = r.list.some((x) => x.stratum !== undefined);
  const head = ["Sequence", "ID", ...(hasStratum ? ["Stratum"] : []), ...(hasBlock ? ["Block"] : []), "Group"];
  const rows = r.list.map((x) => [x.sequence, x.id, ...(hasStratum ? [x.stratum] : []),
    ...(hasBlock ? [x.block] : []), x.group]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

// ------------------------------------------------------------ saved justification

/** Name of the info constant that holds the sample-size justification
 *  sentence (the reporting checklist looks for it). */
export const JUSTIFICATION_CONSTANT = "Sample size justification";

/** Info-sheet content for a calculation: the sentence in the notes and in
 *  the constant, plus the key numbers as constants. */
export function justificationSheetContent(f: PowerForm, r: PowerResult):
  { notes: string; constants: { name: string; value: string }[] } {
  const text = r.justification?.text ?? "";
  const pct = (v: number) => `${Number((100 * v).toPrecision(4))}%`;
  const constants = [
    { name: JUSTIFICATION_CONSTANT, value: text },
    { name: "Test", value: KIND_LABELS[r.kind] },
    { name: "Calculation", value: r.solve === "n" ? "A priori (sample size)" : r.solve === "power" ? "Post hoc (power)" : "Sensitivity (detectable effect)" },
    { name: "α", value: String(r.alpha) + (r.tails ? ` (${r.tails === 1 ? "one" : "two"}-sided)` : "") },
    { name: "Power", value: pct(r.power) },
    { name: "Effect size", value: `${r.effect.name} = ${Number(r.effect.value.toPrecision(4))}` },
    { name: "Sample size", value: r.n_per_group?.length ? `${r.n_per_group.join(" + ")} = ${r.n_total}` : String(r.n_total) },
    ...(r.justification?.allocate ? [{ name: "To allocate (with attrition)", value: r.justification.allocate.join(" + ") }] : []),
    { name: f.unit.trim() ? "Unit" : "Unit", value: f.unit.trim() || "subjects" },
  ];
  return { notes: text, constants };
}

/** The sample-size justification sentence saved in a project, if any. */
export function findSampleSizeJustification(p: Project): string | null {
  for (const s of p.sheets) {
    if (s.kind !== "info") continue;
    const c = (s as InfoSheet).constants.find((x) => x.name === JUSTIFICATION_CONSTANT && x.value.trim());
    if (c) return c.value.trim();
  }
  return null;
}
