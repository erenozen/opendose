// The combined effect of an estimation result (P-93): DABEST's mini-meta
// weighted delta of independent repeats, or the delta-delta of a 2 × 2
// design, as the results table, the methods text, the legend and the
// plot print it. Numbers are the engine's (estimation.combined_effect),
// formatted as the comparison rows are. Pure; unit-tested.
import { formatSig } from "../../types.ts";
import { tableP } from "../pformat.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const pct = (l: unknown) => `${Number(((typeof l === "number" ? l : 0.95) * 100).toPrecision(4))}%`;

/** The short name on the plot's axis and in the legend. */
export const combinedShort = (c: R) => (c.kind === "mini_meta" ? "Weighted delta" : "Delta-delta");

/** The derived row under the comparisons. */
export function combinedRow(c: R): { label: string; n: string; effect: string; value: string; ci: string;
  p: string; weights: string } {
  const comps: R[] = c.comparisons ?? [];
  const diff = (x: R) => `(${x.test} minus ${x.control})`;
  const label = c.kind === "mini_meta"
    ? `Mini-meta of ${comps.length} repeats`
    : comps.length === 2 ? `${diff(comps[1])} minus ${diff(comps[0])}` : "Delta-delta";
  return {
    label,
    n: `${comps.length} comparisons`,
    effect: c.kind === "mini_meta" ? "Weighted mean difference" : "Delta-delta (mean differences)",
    value: formatSig(c.difference),
    ci: Array.isArray(c.ci) ? `${formatSig(c.ci[0])} to ${formatSig(c.ci[1])}` : "n/a",
    p: c.permutation ? tableP(c.permutation.p) : "n/a",
    weights: c.kind === "mini_meta" && Array.isArray(c.weights)
      ? `Weights (inverse pooled group variance): ${comps.map((x, i) =>
        `${x.test} minus ${x.control} ${formatSig(c.weights[i])}%`).join(", ")}.` : "",
  };
}

/** The methods sentence, or "" without a combined effect. */
export function combinedMethods(r: R): string {
  const c = r?.combined;
  if (!c) return "";
  const ci = `${pct(c.ci_level)} ${c.ci_type === "percentile" ? "percentile" : "BCa"} bootstrap confidence interval`;
  if (c.kind === "mini_meta") {
    return `The ${(c.comparisons ?? []).length} independent repeats were combined into a weighted mean `
      + "difference (DABEST mini-meta; Ho et al. 2019), each repeat's mean difference weighted by the "
      + `inverse of its pooled group variance, with a ${ci} from the same weights applied to the repeats' `
      + "bootstrap differences and a permutation P value. ";
  }
  return "The difference between the two mean differences (delta-delta; Ho et al. 2019) was estimated "
    + `with a ${ci} from the two comparisons' independent bootstrap differences; no P value is given for it. `;
}

/** The legend clause for the combined column of the plot, or "". */
export function combinedLegend(r: R): string {
  const c = r?.combined;
  if (!c) return "";
  const ci = `${pct(c.ci_level)} ${c.ci_type === "percentile" ? "percentile" : "BCa"} bootstrap CI`;
  return c.kind === "mini_meta"
    ? ` The rightmost column is the weighted mean difference of the independent repeats (mini-meta, each `
      + `weighted by the inverse of its pooled group variance) with its ${ci} and bootstrap distribution.`
    : ` The rightmost column is the delta-delta, the second mean difference minus the first, with its ${ci} `
      + "and bootstrap distribution.";
}
