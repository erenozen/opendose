// Trend across ordered columns (P-41): the Jonckheere-Terpstra test after
// Kruskal-Wallis and Page's test after Friedman (engine
// moretests.jonckheere_terpstra, repeated.page_trend). The column order is
// the hypothesis, so the controls name it and the results repeat it.
// Pure; unit-tested (__tests__/orderedTrend.test.ts).

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TrendRow = [string, string];

/** "Vehicle, then 1 µM, then 10 µM": the order the test assumes. */
export function trendOrder(names: string[]): string {
  return names.map((n, i) => n || `Dataset ${i + 1}`).join(", then ");
}

/** The controls' sentence under the trend checkbox. */
export function trendOrderHint(names: string[], what: "columns" | "treatments"): string {
  return `Tested in the order of the ${what}, first to last: ${trendOrder(names)}. `
    + "That order is the hypothesis: it must be the dose (or time) order, fixed before "
    + "looking at the data. Reorder the columns if it is not.";
}

const DIRECTION: Record<string, string> = {
  increasing: "values increase from the first column to the last",
  decreasing: "values decrease from the first column to the last",
  none: "no trend in either direction",
};

/** The rows of the results block, formatted by `fmt` (numbers) and `p`
 *  (P values in the project's style). */
export function trendRows(block: any, fmt: (v: number) => string,
  p: (v: number) => string): TrendRow[] {
  if (!block || block.error) return [];
  const page = block.test === "page";
  const method = block.p_method === "exact"
    ? (block.ties ? "exact, given the ties" : "exact") : String(block.p_method ?? "");
  return [
    page ? ["Page's L", fmt(block.L)] : ["Jonckheere-Terpstra J", fmt(block.statistic)],
    ["Expected under no trend (SD)", `${fmt(block.mean)} (${fmt(block.sd)})`],
    ["z", fmt(block.z)],
    [`P value, two-sided (${method})`, p(block.p)],
    ["P value, one-sided: increasing", p(block.p_increasing)],
    ["P value, one-sided: decreasing", p(block.p_decreasing)],
    ["Direction", DIRECTION[block.direction] ?? String(block.direction)],
  ];
}

/** " A Jonckheere-Terpstra test for trend across the columns in the
 *  order entered gave J = 140 (exact P = 0.0000009, two-sided)." for the
 *  methods sentence; "" without a block. `p` writes "P = ...". */
export function trendSentence(block: any, p: (v: unknown) => string): string {
  if (!block || block.error) return "";
  const exact = block.p_method === "exact" ? "exact " : "";
  return block.test === "page"
    ? ` Page's test for trend across the treatments in the order entered gave L = ${block.L} `
      + `(${exact}${p(block.p)}, two-sided).`
    : ` A Jonckheere-Terpstra test for trend across the columns in the order entered gave `
      + `J = ${block.statistic} (${exact}${p(block.p)}, two-sided).`;
}

/** The note under the block: which order was tested and how P came. */
export function trendNote(block: any): string {
  if (!block || block.error) return "";
  const order = trendOrder(block.order ?? []);
  return block.test === "page"
    ? `Treatments tested in the order entered (${order}); values ranked within each subject. `
      + "Page (1963). Exact P from the permutations of each subject's ranks when Page's tables "
      + "cover the design, else the normal approximation."
    : `Columns tested in the order entered (${order}). Jonckheere (1954) and Terpstra (1952). `
      + "Exact P without ties and with at most 100 values (as R clinfun), else the normal "
      + "approximation with Hollander & Wolfe's tie correction.";
}
