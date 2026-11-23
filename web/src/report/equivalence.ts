// Equivalence and non-inferiority (FEATURE-PLAN P-12): the margins the
// engine's two one-sided tests take (options.equivalence), and the words
// and numbers the results, the headline and the Checks row show for its
// "equivalence" block (engine ttests.tost, proportions.tost_two_proportions).
//
// A failed TOST says "Not shown to be equivalent", never "different":
// an interval that crosses a margin is compatible with both a difference
// and no difference (Altman & Bland 1995). Numbers go through formatSig.
// Pure; unit-tested (__tests__/equivalence.test.ts).
import { formatSig } from "../types.ts";
import type { Chip } from "../guide/checks.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** Off, equivalence (both margins) or non-inferiority, with higher or
 *  lower values of A - B (or A / B) being better. */
export type EquivalenceMode = "off" | "equivalence" | "noninferior_higher" | "noninferior_lower";

export const EQUIVALENCE_MODE_LABELS: Record<EquivalenceMode, string> = {
  off: "Off",
  equivalence: "Equivalence (both margins)",
  noninferior_higher: "Non-inferiority, higher is better",
  noninferior_lower: "Non-inferiority, lower is better",
};

export type MarginScale = "difference" | "ratio";

export interface EquivalenceSpec {
  lower: number | null;
  upper: number | null;
  scale: MarginScale;
}

// Read 2026-11-23: the margin is "based on scientific or clinical
// judgment" (GraphPad); TOST at alpha with the 1 - 2 alpha CI (Schuirmann;
// Lakens); the margin is specified in advance (CONSORT, Piaggio et al.).
export const TOST_SOURCES = [
  { label: "GraphPad Statistics Guide: Testing for equivalence with confidence intervals or P values",
    url: "https://www.graphpad.com/guides/prism/latest/statistics/stat_testing_for_equivalence_with_c.htm" },
  { label: "Schuirmann 1987, J Pharmacokinet Biopharm 15:657", url: "https://doi.org/10.1007/BF01068419" },
  { label: "Lakens 2017, Soc Psychol Personal Sci 8:355", url: "https://doi.org/10.1177/1948550617697177" },
  { label: "Piaggio et al. 2012 (CONSORT for non-inferiority and equivalence trials), JAMA 308:2594",
    url: "https://doi.org/10.1001/jama.2012.87802" },
];

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The engine's options.equivalence for a mode and the typed margin, or
 *  null (off), or the problem with the margin. A difference margin m > 0
 *  gives -m to m; a ratio margin r (> 0, not 1) gives 1/r to r, with r
 *  read as its larger form (0.8 and 1.25 are the same margin).
 *  Non-inferiority keeps one side: "higher is better" tests A - B above
 *  -m (A / B above 1/r), "lower is better" A - B below m (below r). */
export function equivalenceSpec(mode: EquivalenceMode | undefined, margin: string | undefined,
  scale: MarginScale): EquivalenceSpec | null | { error: string } {
  if (!mode || mode === "off") return null;
  const t = (margin ?? "").trim().replace(",", ".");
  const v = t === "" ? NaN : Number(t);
  if (!Number.isFinite(v)) {
    return { error: scale === "ratio" ? "Enter the equivalence margin as a ratio, for example 1.25"
      : "Enter the equivalence margin, a positive number in the units of the data" };
  }
  let lo: number, hi: number;
  if (scale === "ratio") {
    if (!(v > 0) || v === 1) return { error: "Enter a ratio margin above 0 and other than 1, for example 1.25" };
    hi = Math.max(v, 1 / v);
    lo = 1 / hi;
  } else {
    if (!(v > 0)) return { error: "Enter a margin above 0 (the test uses minus and plus this value)" };
    lo = -v;
    hi = v;
  }
  return {
    lower: mode === "noninferior_lower" ? null : lo,
    upper: mode === "noninferior_higher" ? null : hi,
    scale,
  };
}

/** A usable equivalence block (not "unavailable"). */
export function hasEquivalence(e: unknown): e is R {
  const x = e as R | null;
  return !!x && typeof x === "object" && num(x.p) && Array.isArray(x.ci);
}

const isRatio = (e: R) => e.scale === "ratio";

/** "±1", "0.8 to 1.25", "above −1", "below 1.25". */
export function marginText(e: R): string {
  const lo = num(e.lower) ? e.lower : null;
  const hi = num(e.upper) ? e.upper : null;
  if (lo !== null && hi !== null) {
    if (!isRatio(e) && Math.abs(lo + hi) < 1e-12 * Math.max(1, Math.abs(hi))) return `±${formatSig(hi)}`;
    return `${formatSig(lo)} to ${formatSig(hi)}`;
  }
  if (lo !== null) return `above ${formatSig(lo)}`;
  return hi !== null ? `below ${formatSig(hi)}` : "";
}

/** What the margin is about: "A − B", "A/B", "mean − 100". */
export function estimateLabel(e: R, a: string, b: string): string {
  return isRatio(e) ? `${a}/${b}` : `${a} − ${b}`;
}

/** The verdict, the answer to the question asked:
 *  "Equivalent within ±1" / "Not shown to be equivalent";
 *  "Non-inferior: A − B above −1" / "Not shown to be non-inferior". */
export function equivalenceVerdict(e: R, a = "A", b = "B"): string {
  const m = marginText(e);
  if (e.kind === "noninferiority") {
    return e.shown ? `Non-inferior: ${estimateLabel(e, a, b)} ${m}` : "Not shown to be non-inferior";
  }
  return e.shown ? `Equivalent within ${m}` : "Not shown to be equivalent";
}

/** "90% CI −0.2403 to 0.6403" (ratios: the interval of the ratio). */
export function equivalenceCI(e: R): string {
  const level = num(e.ci_level) ? Math.round(e.ci_level * 100) : 90;
  const ci = isRatio(e) && Array.isArray(e.ci_ratio) ? e.ci_ratio : e.ci;
  return `${level}% CI ${formatSig(ci[0])} to ${formatSig(ci[1])}`;
}

/** The estimate on the margin's scale (the ratio for ratio margins). */
export function equivalenceEstimate(e: R): number {
  return isRatio(e) && num(e.ratio) ? e.ratio : e.estimate;
}

export interface TostRow { label: string; statistic: string; p: number }

/** The one-sided tests, as rows: "H0: A − B ≤ −1", "t = 4.8", P. */
export function tostRows(e: R, a = "A", b = "B"): TostRow[] {
  const est = estimateLabel(e, a, b);
  const stat = e.method === "score" ? "z" : "t";
  const rows: TostRow[] = [];
  for (const [side, rel, m] of [["test_lower", "≤", e.lower], ["test_upper", "≥", e.upper]] as const) {
    const t = e[side] as R | null;
    if (!t || !num(t.p)) continue;
    const s = t[stat];
    rows.push({
      label: `Null hypothesis ${est} ${rel} ${formatSig(m)}`,
      statistic: num(s) ? `${stat} = ${formatSig(s)}` : `${stat} = ${s > 0 ? "∞" : "−∞"}`,
      p: t.p,
    });
  }
  return rows;
}

/** The Checks row's margin chip: "Margin ±1, set before the data?". */
export function marginChipLabel(e: R): string {
  const kind = e.kind === "noninferiority" ? "Non-inferiority margin" : "Equivalence margin";
  return `${kind} ${marginText(e)}: set before looking at the data?`;
}

/** Where the 90% CI and the margins fall on one axis (0 to 1), for the
 *  interval-against-margins strip. Ratios on a log axis. */
export interface StripGeometry {
  lo: number; hi: number; est: number;
  marginLo: number | null; marginHi: number | null; zero: number;
}

export function stripGeometry(e: R): StripGeometry | null {
  if (!hasEquivalence(e)) return null;
  const ratio = isRatio(e);
  const ci: number[] = ratio && Array.isArray(e.ci_ratio) ? e.ci_ratio : e.ci;
  const f = (v: number) => (ratio ? Math.log(v) : v);
  const pts = [ci[0], ci[1], equivalenceEstimate(e), ratio ? 1 : 0,
    ...(num(e.lower) ? [e.lower] : []), ...(num(e.upper) ? [e.upper] : [])].filter(num);
  if (ratio && pts.some((v) => v <= 0)) return null;
  const xs = pts.map(f);
  let min = Math.min(...xs), max = Math.max(...xs);
  if (max - min === 0) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  min -= pad; max += pad;
  const at = (v: number) => (f(v) - min) / (max - min);
  return {
    lo: at(ci[0]), hi: at(ci[1]), est: at(equivalenceEstimate(e)),
    marginLo: num(e.lower) ? at(e.lower) : null,
    marginHi: num(e.upper) ? at(e.upper) : null,
    zero: at(ratio ? 1 : 0),
  };
}

/** The first equivalence block of a result (t test, two proportions, or a
 *  one-sample data set). */
export function equivalenceOf(result: unknown): R | null {
  const r = result as R | null;
  if (!r || typeof r !== "object") return null;
  if (hasEquivalence(r.equivalence)) return r.equivalence;
  const ds = Array.isArray(r.datasets) ? r.datasets.find((d: R) => hasEquivalence(d?.equivalence)) : null;
  return ds ? ds.equivalence : null;
}

/** The Checks row chip naming the margin (an info note: the app cannot
 *  know when the margin was chosen, so it asks). */
export function equivalenceChip(result: unknown): Chip | null {
  const e = equivalenceOf(result);
  if (!e) return null;
  return {
    id: "equivalence-margin", label: marginChipLabel(e), state: "info",
    detail: "An equivalence or non-inferiority test answers its question only when the margin was "
      + "chosen before the data were seen, from what would matter scientifically. A margin moved "
      + "after looking at the result can make any data look equivalent. Record the margin and its "
      + "reason in the methods.",
    sources: TOST_SOURCES,
  };
}

/** The sentence that reads the result, never turning a failed TOST into
 *  "different". */
export function equivalenceReading(e: R, a = "A", b = "B"): string {
  const est = estimateLabel(e, a, b);
  // "The 90% CI of A − B, -0.2403 to 0.6403,"
  const [lvl, range] = equivalenceCI(e).split(" CI ");
  const ci = `${lvl} CI of ${est}, ${range},`;
  const alpha = num(e.alpha) ? formatSig(e.alpha) : "0.05";
  if (e.kind === "noninferiority") {
    return e.shown
      ? `The ${ci} lies ${marginText(e)}, so ${a} is non-inferior to ${b} at a one-sided α of ${alpha}.`
      : `The ${ci} reaches past the margin (${marginText(e)}), so non-inferiority is not shown. `
        + "This does not show that the groups differ.";
  }
  return e.shown
    ? `The ${ci} lies inside the margin (${marginText(e)}): both one-sided tests reject at α = ${alpha}.`
    : `The ${ci} crosses the margin (${marginText(e)}), so equivalence is not shown. `
      + "This does not show that the groups differ: the data are compatible with a difference "
      + "inside the margin and with one outside it.";
}
