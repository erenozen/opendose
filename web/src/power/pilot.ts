// "Plan next experiment" from a t test or one-way ANOVA results sheet: the
// pilot's SD (and its means and n) read off the engine's result, and the
// power form those values fill in. The effect to detect is the user's
// choice: a difference that matters, or the pilot difference offered as
// one option and labelled as such. Power for the effect observed here
// (post hoc, "observed" power) is never computed: it adds nothing to the
// P value (GraphPad FAQ 1710). Pure: unit-tested in __tests__/pilot.test.ts.
import { fFromMeans, pooledSd, type PowerForm } from "./power.ts";
import { formatSig } from "../types.ts";

export type PilotKind = "t_two_sample" | "t_paired" | "anova_oneway";

export interface PilotData {
  kind: PilotKind;
  /** The data table the pilot result comes from. */
  table: string;
  /** "unpaired t test", "paired t test", "one-way ANOVA". */
  test: string;
  /** The SD the next experiment is planned with. */
  sd: number;
  /** What `sd` is: "pooled SD", "SD of the differences", ... */
  sdLabel: string;
  /** Groups with their means and n (paired: the mean difference). */
  groups: { name: string; mean: number; n: number }[];
  /** The difference seen in the pilot: B − A, the mean difference, or the
   *  largest minus the smallest mean (ANOVA). */
  observed: number;
}

const num = (v: unknown): number | null =>
  (typeof v === "number" && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" ? v as Record<string, unknown> : {});

/** A number written with 4 significant digits ("2.345", "0.01234"). */
export const sig4 = (v: number) => String(Number(v.toPrecision(4)));

/** The pilot data in a column-analysis result (t test or one-way ANOVA),
 *  or null when the result has no SD to plan with (rank tests, errors). */
export function pilotFromResult(analysisId: string, options: unknown, result: unknown,
  table: string): PilotData | null {
  if (analysisId !== "column") return null;
  const o = rec(options);
  const r = rec(result);
  if (!result || r.error) return null;
  if (o.analysis === "ttest") {
    const names = Array.isArray(r.names) ? r.names.map(String) : ["Group A", "Group B"];
    if (r.test === "unpaired_t" || r.test === "welch_t") {
      const [ma, mb, sa, sb, na, nb] = [r.mean_a, r.mean_b, r.sem_a, r.sem_b, r.n_a, r.n_b].map(num);
      if (ma === null || mb === null || sa === null || sb === null || na === null || nb === null) return null;
      // SD = SEM × √n for each group, pooled at the groups' n.
      const sd = pooledSd(sa * Math.sqrt(na), sb * Math.sqrt(nb), na, nb);
      if (sd === null) return null;
      return { kind: "t_two_sample", table, test: r.test === "welch_t"
        ? "unpaired t test with Welch's correction" : "unpaired t test",
        sd, sdLabel: `pooled SD of ${names[0]} and ${names[1]}`,
        groups: [{ name: names[0], mean: ma, n: na }, { name: names[1], mean: mb, n: nb }],
        observed: mb - ma };
    }
    if (r.test === "paired_t") {
      const [md, se, n] = [r.mean_difference, r.se_difference, r.n_pairs].map(num);
      if (md === null || se === null || n === null || n < 2 || !(se > 0)) return null;
      return { kind: "t_paired", table, test: "paired t test", sd: se * Math.sqrt(n),
        sdLabel: `SD of the differences ${names[1]} − ${names[0]}`,
        groups: [{ name: `${names[1]} − ${names[0]}`, mean: md, n }], observed: md };
    }
    return null;
  }
  if (o.analysis === "anova") {
    const gs = (Array.isArray(r.group_summaries) ? r.group_summaries : []).map(rec)
      .map((g) => ({ name: String(g.name ?? ""), mean: num(g.mean), n: num(g.n), sd: num(g.sd) }));
    if (gs.length < 2 || gs.some((g) => g.mean === null || g.n === null)) return null;
    // Ordinary ANOVA: √(MS residual); otherwise the SDs pooled at their df.
    const ms = num(rec(r.table).ms_within);
    let sd = ms !== null && ms > 0 ? Math.sqrt(ms) : null;
    if (sd === null && gs.every((g) => g.sd !== null && g.n !== null && g.n >= 2)) {
      const df = gs.reduce((a, g) => a + g.n! - 1, 0);
      const ss = gs.reduce((a, g) => a + (g.n! - 1) * g.sd! ** 2, 0);
      sd = df > 0 && ss > 0 ? Math.sqrt(ss / df) : null;
    }
    if (sd === null) return null;
    const means = gs.map((g) => g.mean!);
    return { kind: "anova_oneway", table, test: "one-way ANOVA", sd,
      sdLabel: ms !== null ? "pooled within-group SD (√MS residual)" : "pooled within-group SD",
      groups: gs.map((g) => ({ name: g.name, mean: g.mean!, n: g.n! })),
      observed: Math.max(...means) - Math.min(...means) };
  }
  return null;
}

const nText = (p: PilotData) => {
  const ns = p.groups.map((g) => g.n);
  if (p.kind === "t_paired") return `${ns[0]} pairs`;
  return new Set(ns).size === 1 ? `n = ${ns[0]} per group` : `n = ${ns.join(", ")}`;
};

/** "SD = 2.345 (pooled SD of Control and Treated, n = 6 per group)". */
export function pilotSdText(p: PilotData): string {
  return `SD = ${formatSig(p.sd, 4)} (${p.sdLabel}, ${nText(p)})`;
}

/** The power form for the next experiment, before an effect is chosen:
 *  the pilot's test and SD filled in, solving for n at 80% power. The
 *  effect fields are blank until the user chooses one (`withEffect`). */
export function pilotForm(base: PowerForm, p: PilotData): PowerForm {
  const f: PowerForm = { ...base, solve: "n", power: "0.8", alpha: "0.05", tails: "2",
    kind: p.kind, effectSource: "" };
  if (p.kind === "anova_oneway") {
    return { ...f, k: String(p.groups.length), groupSd: sig4(p.sd), groupMeans: "", f: "" };
  }
  return { ...f, sd: sig4(p.sd), mean1: "", mean2: p.kind === "t_paired" ? "0" : "", d: "", ratio: "1" };
}

export type EffectChoice = { kind: "relevant"; difference: number } | { kind: "pilot" };

/** The form with the effect to detect filled in, and where it came from
 *  in the justification sentence. Null when the difference is not usable
 *  (zero, not a number). */
export function withEffect(form: PowerForm, p: PilotData, choice: EffectChoice): PowerForm | null {
  const delta = choice.kind === "pilot" ? Math.abs(p.observed) : Math.abs(choice.difference);
  if (!(delta > 0) || !Number.isFinite(delta)) return null;
  const sdText = `the ${p.sdLabel} in the pilot experiment “${p.table}” (${formatSig(p.sd, 4)}; `
    + `${p.test}, ${nText(p)})`;
  const anova = p.kind === "anova_oneway";
  const source = choice.kind === "pilot"
    ? (anova ? `the group means observed in the pilot (${p.groups.map((g) => formatSig(g.mean, 4))
      .join(", ")}; imprecise estimates)` : `the difference observed in the pilot `
      + `(${formatSig(delta, 4)}, an imprecise estimate)`) + ` and ${sdText}`
    : `a difference of ${formatSig(delta, 4)}${anova ? " between two group means (the others "
      + "midway)" : ""} judged biologically relevant and ${sdText}`;
  if (anova) {
    // The pilot means, or the smallest difference that matters between
    // two of k means with the others midway (Cohen's minimum-variability
    // pattern: f = Δ / (σ √(2k))).
    const m0 = p.groups[0].mean;
    const means = choice.kind === "pilot" ? p.groups.map((g) => g.mean)
      : p.groups.map((_, i) => (i === 0 ? m0 : i === 1 ? m0 + delta : m0 + delta / 2));
    const fv = fFromMeans(means, p.sd);
    if (fv === null || !(fv > 0)) return null;
    return { ...form, groupMeans: means.map(sig4).join(", "), groupSd: sig4(p.sd),
      k: String(means.length), f: sig4(fv), effectSource: source };
  }
  const d = delta / p.sd;
  const m1 = p.kind === "t_paired" ? delta : p.groups[0].mean;
  return { ...form, sd: sig4(p.sd), mean1: sig4(m1), mean2: p.kind === "t_paired" ? "0"
    : sig4(m1 + delta), d: sig4(d), effectSource: source };
}

/** Why the tool plans from a chosen effect and never reports power for
 *  the effect observed (cited under "Plan next experiment"). */
export const POST_HOC_SOURCES = [
  { label: "GraphPad FAQ 1710: Why is post-hoc power analysis futile?",
    url: "https://www.graphpad.com/support/faq/why-it-is-not-helpful-to-compute-the-power-of-an-"
      + "experiment-to-detect-the-difference-actually-observed-why-is-post-hoc-power-analysis-futile/" },
  { label: "Hoenig & Heisey (2001), The abuse of power, The American Statistician 55:19–24",
    url: "https://doi.org/10.1198/000313001300339897" },
  { label: "Albers & Lakens (2018), When power analyses based on pilot data are biased, "
    + "J Exp Soc Psychol 74:187–195", url: "https://doi.org/10.1016/j.jesp.2017.09.004" },
];
