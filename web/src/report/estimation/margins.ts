// The equivalence margin on the estimation plot (FEATURE-PLAN P-12): when
// the family holds a t test with an equivalence or non-inferiority margin
// (report/equivalence.ts; engine ttests.tost), the estimation plot of the
// same two groups draws the margin (dashed lines at -m and +m, or the one
// bound of a non-inferiority test) on its difference axis, and the t
// test's 90% CI (the 1 - 2 alpha interval the two one-sided tests decide
// by; Schuirmann 1987) beside the bootstrap CI. The t test states A - B;
// the plot shows test - control, so the margin and the interval are
// mirrored when the plot's control is A. Nothing is drawn, and the legend
// says why, when the two do not describe the same difference: a ratio
// margin, an effect other than the mean difference, a paired test against
// an unpaired plot (or the reverse), or a plot without that pair. Pure;
// unit-tested (__tests__/margins.test.ts).
import { equivalenceOf, marginText } from "../equivalence.ts";
import { formatSig } from "../../types.ts";
import { GRAPH_ESTIMATION } from "./run.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The t test kinds whose estimate is a difference of paired values. */
const PAIRED = new Set(["paired", "ratio_paired", "wilcoxon"]);

/** A results sheet as far as this module needs it. */
export interface SheetLike {
  kind: string;
  id: string;
  parentId?: string | null;
  analysis?: string;
  options?: unknown;
}

/** The family's t test with an equivalence or non-inferiority margin
 *  (the first in the navigator), or null. */
export function equivalenceSheet<S extends SheetLike>(sheets: readonly S[], dataId: string): S | null {
  return sheets.find((s) => {
    const o = (s.options ?? {}) as R;
    return s.kind === "results" && s.parentId === dataId && s.analysis === "column"
      && o.analysis === "ttest" && typeof o.equivalence === "string" && o.equivalence !== "off";
  }) ?? null;
}

/** That t test's result and options. */
export interface EquivalenceLink { result: unknown; options: unknown }

/** The link for an estimation graph outside the workbench (exports),
 *  with `resultOf` giving a results sheet's last result; null for other
 *  graphs and frozen ones (their snapshot holds only their own result). */
export function familyEquivalence<S extends SheetLike>(sheets: readonly S[],
  graph: { graphType: string; parentId: string; frozen?: boolean },
  resultOf: (sheet: S) => unknown): EquivalenceLink | null {
  if (graph.graphType !== GRAPH_ESTIMATION || graph.frozen) return null;
  const s = equivalenceSheet(sheets, graph.parentId);
  return s ? { result: resultOf(s) ?? null, options: s.options } : null;
}

export interface EstimationMargins {
  /** The plotted comparison (test - control) the margin belongs to. */
  control: string;
  test: string;
  /** The margin on the plotted difference (null: no bound on that side). */
  lower: number | null;
  upper: number | null;
  /** The t test's 1 - 2 alpha CI and estimate, on the plotted difference. */
  ci: [number, number];
  estimate: number;
  /** 0.9 for alpha 0.05. */
  level: number;
  /** +1: the plot's difference is the t test's A - B; -1: it is B - A. */
  sign: 1 | -1;
  /** The t test's equivalence block (A - B), and A and B. */
  block: R;
  names: [string, string];
}

export type MarginsAnswer = { drawn: true; m: EstimationMargins } | { drawn: false; reason: string };

/** Where the margin of a family's equivalence test goes on an estimation
 *  plot, or why it is not drawn; null when the t test has no usable
 *  equivalence block (nothing to say). */
export function estimationMargins(estimation: unknown, ttest: unknown,
  ttestOptions: unknown): MarginsAnswer | null {
  const block = equivalenceOf(ttest);
  const t = ttest as R | null;
  const est = estimation as R | null;
  if (!block || !t || !Array.isArray(t.names) || t.names.length !== 2) return null;
  if (!est || est.error || !Array.isArray(est.comparisons)) return null;
  const [a, b] = t.names.map(String) as [string, string];
  if (block.scale === "ratio") {
    return { drawn: false, reason: `the margin is a ratio (${a}/${b}) and the plot shows a difference` };
  }
  const c = est.comparisons.find((x: R) => (x.control === b && x.test === a)
    || (x.control === a && x.test === b));
  if (!c) return { drawn: false, reason: `the plot does not compare ${a} with ${b}` };
  const eff = c.effects?.[0];
  if (eff?.effect !== "mean_diff") {
    return { drawn: false, reason: `the margin is in the data's units and the plot shows ${
      String(eff?.label ?? "another effect size").toLowerCase()}` };
  }
  const kind = String((ttestOptions as R | null)?.ttestKind ?? "unpaired");
  const tPaired = PAIRED.has(kind), ePaired = !!(c.paired ?? est.paired);
  if (tPaired !== ePaired) {
    return { drawn: false, reason: tPaired ? "the t test is paired and the plot is not"
      : "the plot is paired and the t test is not" };
  }
  const ci = block.ci as number[];
  if (!num(ci?.[0]) || !num(ci?.[1]) || !num(block.estimate)) return null;
  const sign: 1 | -1 = c.test === a ? 1 : -1;
  const flip = (v: unknown) => (num(v) ? sign * v : null);
  const [lo, hi] = sign === 1 ? [block.lower, block.upper] : [block.upper, block.lower];
  const ends = [sign * ci[0], sign * ci[1]].sort((x, y) => x - y) as [number, number];
  return {
    drawn: true,
    m: {
      control: String(c.control), test: String(c.test),
      lower: flip(lo), upper: flip(hi), ci: ends, estimate: sign * block.estimate,
      level: num(block.ci_level) ? block.ci_level : 0.9, sign, block, names: [a, b],
    },
  };
}

/** "−1" as the plot labels a margin line. */
export const marginLabel = (v: number): string => formatSig(v);

/** The legend's sentence on the margin lines, or why there are none. */
export function marginsLegend(answer: MarginsAnswer | null): string {
  if (!answer) return "";
  if (!answer.drawn) return `No equivalence margin on this plot: ${answer.reason}.`;
  const m = answer.m;
  const [a, b] = m.names;
  const lvl = `${Math.round(m.level * 100)}%`;
  const ni = m.block.kind === "noninferiority";
  const margin = `${a} − ${b} ${ni ? "" : "within "}${marginText(m.block)}`;
  const mirrored = m.sign === -1 ? `, drawn as ${m.test} minus ${m.control}` : "";
  const ci = `${lvl} CI (${formatSig(m.ci[0])} to ${formatSig(m.ci[1])})`;
  return ni
    ? `A dashed line marks the non-inferiority margin of the t test (${margin}${mirrored}); the capped `
      + `bar left of the difference is that test's ${ci}, which stays on the right side of the margin `
      + "exactly when the one-sided test shows non-inferiority (Schuirmann 1987)."
    : `Dashed lines mark the equivalence margin of the t test (${margin}${mirrored}); the capped bar `
      + `left of the difference is that test's ${ci}, which lies inside the margin exactly when the `
      + "two one-sided tests show equivalence (Schuirmann 1987).";
}
