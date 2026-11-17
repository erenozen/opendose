// One-tailed P values of two-group tests: the alternative a one-tailed P
// (engine p_greater / p_less) is for, in words. Pure (no React).

/* eslint-disable @typescript-eslint/no-explicit-any */
export function oneTailedAlternative(result: any, tails: "greater" | "less"): string {
  const [a, b] = result?.names ?? ["A", "B"];
  const gt = tails === "greater";
  switch (result?.test) {
    case "paired_t": return `mean of the differences ${a} − ${b} ${gt ? "> 0" : "< 0"}`;
    case "ratio_paired_t": return `ratio ${a}/${b} ${gt ? "> 1" : "< 1"}`;
    case "mann_whitney": return `${a} tends to be ${gt ? "larger" : "smaller"} than ${b}`;
    case "wilcoxon_matched_pairs": return `differences ${a} − ${b} tend to be ${gt ? "positive" : "negative"}`;
    default: return `mean of ${a} ${gt ? ">" : "<"} mean of ${b}`;
  }
}
