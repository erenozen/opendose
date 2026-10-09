// What n = 1–3 can and cannot show (need `small-n-honesty`). Pure rules;
// the numbers come from the engine (the `design_sensitivity` block of a
// result, or the `power` handler asked by guide/useSmallN.ts), never from
// TypeScript statistics:
//  - one independent value in a group: no P (sheets/common/withheld.ts),
//    a banner saying the results are descriptive and exploratory, and how
//    many independent values per group a test would need;
//  - two or three per group: a chip with the smallest effect the design
//    can detect at 80% power and the half-width of the 95% CI of the
//    difference in SD units. This is the prospective alternative to
//    "observed power" (GraphPad FAQ 1710; IMPROVEMENT-PLAN do-not-build 3).
import { describeResult } from "../report/describe.ts";
import { withheldInfo, withheldPhrase, type WithheldInfo } from "../sheets/common/withheld.ts";
import type { Banner } from "./banners.ts";
import type { Chip } from "./checks.ts";
import { SRC } from "./sources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** The smallest effect a design detects, in SD units. */
export interface Sensitivity {
  /** Smallest n per group (pairs / subjects for matched designs). */
  minN: number;
  /** Detectable Cohen's d (matched: d_z) at 80% power, two-tailed 0.05. */
  d: number;
  /** Half-width of the 95% CI of the difference, in SDs. */
  ciHalf: number | null;
  matched: boolean;
}

/** Independent values per group a two-group test needs (80% power,
 *  two-tailed α = 0.05) for a few large effects. */
export interface NeededN { d: number; n: number }

/** The effects the "what replication would be needed" line quotes. */
export const NEEDED_DS = [1, 1.5, 2];

const TESTED = new Set(["ttest", "anova", "anova_unequal_var", "rm_one_way_anova", "friedman"]);

/** Which design to ask the power engine about, or null when the result
 *  needs no sensitivity chip (n ≥ 4, no test, P withheld). */
export function sensitivityDesign(result: unknown):
  { matched: boolean; n1: number; n2: number; minN: number } | null {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error || withheldInfo(r)) return null;
  if (!TESTED.has(String(r.analysis)) || r.test === "kolmogorov_smirnov") return null;
  const info = describeResult(r);
  const ns = info.groups.map((g) => g.n).filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (ns.length < 2 && !(info.nUnit === "pairs" && ns.length)) return null;
  const minN = ns[0];
  if (minN < 2 || minN > 3) return null;
  const matched = info.nUnit === "pairs" || info.nUnit === "subjects";
  return { matched, n1: ns[0], n2: matched ? ns[0] : ns[1] ?? ns[0], minN };
}

/** Power-engine payload for the detectable effect of a design. */
export function sensitivityPayload(dz: { matched: boolean; n1: number; n2: number }): R {
  return { analysis: "power", data: {}, options: dz.matched
    ? { kind: "t_paired", solve: "effect", n: dz.n1, alpha: 0.05, power: 0.8, tails: 2 }
    : { kind: "t_two_sample", solve: "effect", n1: dz.n1, n2: dz.n2, alpha: 0.05, power: 0.8,
      tails: 2 } };
}

/** The engine's `design_sensitivity` block of a result, if it has one. */
export function sensitivityOfResult(result: unknown): Sensitivity | null {
  const r = result as R | null;
  const s = r && typeof r === "object" ? r.design_sensitivity : null;
  if (!s || typeof s !== "object" || typeof s.detectable_d_80 !== "number"
    || !Number.isFinite(s.detectable_d_80)) return null;
  const minN = typeof s.min_n === "number" ? s.min_n : 0;
  if (minN < 2 || minN > 3) return null;
  return { minN, d: s.detectable_d_80,
    ciHalf: typeof s.ci_halfwidth_factor === "number" ? s.ci_halfwidth_factor : null,
    matched: !!s.matched || s.effect === "d_z" || /(^|_)paired|wilcoxon/.test(String(r!.test ?? ""))
      || r!.analysis === "rm_one_way_anova" || r!.analysis === "friedman" };
}

/** Sensitivity from the power engine's answer: d from `effect.value`;
 *  the CI half-width is the engine's critical t times the standard error
 *  of the difference in SD units (√(1/n1 + 1/n2), or 1/√n for pairs). */
export function sensitivityFromPower(power: unknown,
  dz: { matched: boolean; n1: number; n2: number; minN: number }): Sensitivity | null {
  const p = power as R | null;
  const d = p?.effect?.value;
  if (!p || p.error || typeof d !== "number" || !Number.isFinite(d)) return null;
  const t = typeof p.critical_t === "number" && Number.isFinite(p.critical_t) ? p.critical_t : null;
  const se = dz.matched ? 1 / Math.sqrt(dz.n1) : Math.sqrt(1 / dz.n1 + 1 / dz.n2);
  return { minN: dz.minN, d, ciHalf: t === null ? null : t * se, matched: dz.matched };
}

/** Power-engine payloads for the n per group behind NEEDED_DS. */
export function neededPayloads(): R[] {
  return NEEDED_DS.map((d) => ({ analysis: "power", data: {},
    options: { kind: "t_two_sample", solve: "n", d, alpha: 0.05, power: 0.8, tails: 2 } }));
}

export function neededFromPower(results: unknown[]): NeededN[] {
  return results.flatMap((res, i) => {
    const r = res as R | null;
    const n = r?.n1 ?? (Array.isArray(r?.n_per_group) ? r!.n_per_group[0] : null);
    return typeof n === "number" && !r?.error ? [{ d: NEEDED_DS[i], n }] : [];
  });
}

const two = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

/** The chip at n = 2–3: "n = 3 per group: can detect only d ≥ 3.07 at
 *  80% power (CI ≈ ±2.27 SD); plan replication". */
export function sensitivityChip(s: Sensitivity): Chip {
  const per = s.matched ? `${s.minN} ${s.minN === 1 ? "pair" : "pairs"}` : `n = ${s.minN} per group`;
  const dName = s.matched ? "d_z" : "d";
  const ci = s.ciHalf !== null ? ` (CI ≈ ±${two(s.ciHalf)} SD)` : "";
  return {
    id: "sensitivity", state: "warn",
    label: `${per}: can detect only ${dName} ≥ ${two(s.d)} at 80% power${ci}; plan replication`,
    detail: `With ${s.matched ? `${s.minN} matched pairs` : `${s.minN} independent values per group`}, `
      + `a two-tailed test at α = 0.05 has 80% power only for differences of at least ${two(s.d)} `
      + `standard deviations (${s.matched ? "Cohen's d_z, of the paired differences" : "Cohen's d"})`
      + (s.ciHalf !== null ? `, and the 95% confidence interval of the difference reaches about `
        + `±${two(s.ciHalf)} SD either side of the estimate` : "")
      + ". A smaller real effect will often give P > 0.05, so a non-significant result here "
      + "is not evidence of no effect: report the confidence interval, treat the result as "
      + "preliminary and plan the replication from an effect worth detecting.",
    action: "open-power",
    sources: [SRC.gpPostHocPower, SRC.weissgerber2015],
  };
}

/** The banner of a result whose P was withheld. */
export function withheldBanner(w: WithheldInfo, needed: NeededN[] | null): Banner {
  const phrase = withheldPhrase(w);
  const who = w.groups.length && !w.matched
    ? `${w.groups.map((g) => `${g.name} (n = ${g.n})`).join(", ")}` : null;
  const need = needed && needed.length
    ? "Independent values per group needed for 80% power (two-tailed α = 0.05): "
      + needed.map((x) => `${x.n} to detect d = ${x.d}`).join(", ") + "."
    : null;
  return {
    id: "p-withheld", tone: "warn",
    title: w.minN === 0 ? `No P value: ${phrase}` : `No P value: ${phrase} allows description only`,
    body: `${who ? `${who}: ` : ""}a P value compares the difference between groups with the `
      + "variability within them, and one independent value per group (one experiment, one "
      + "animal, or replicates pooled into one sample) gives no estimate of that variability. "
      + "The results below are descriptive and exploratory."
      + (w.matched ? " A matched test needs at least two complete matched sets." : ""),
    fixes: [
      "Repeat the experiment: each independent repeat (a new culture, animal or day) adds one value per group; technical replicates of the same sample do not.",
      ...(need ? [need] : []),
      "At least 2 independent values per group allow a P value; at n = 2–3 only very large effects can be detected.",
    ],
    sources: [SRC.gpIndependent, SRC.lazic2010],
    action: "open-power",
  };
}
