// Brackets in the right margin of a Kaplan-Meier graph (P-111): a step
// curve has no single place along X to hang a bracket, so each pairwise
// log-rank comparison joins the two curves where they end, beside the
// plot, with its adjusted P (or stars) to the right. Brackets that would
// touch take separate lanes, further right. Pure; unit-tested in
// __tests__/marginBrackets.test.ts.

/** One bracket to place: the two curve ends it joins (axis units). */
export interface MarginInput { key: string; ya: number; yb: number }

export interface MarginBracket extends MarginInput {
  lo: number;
  hi: number;
  /** 0 = nearest the plot. */
  lane: number;
}

/**
 * Lanes for the brackets, shortest first, each in the first lane where it
 * neither overlaps nor touches a bracket already there (two brackets that
 * share a curve's end would read as one line). A bracket shorter than
 * `minSpan` (curves ending at the same level) is widened about its centre
 * so its ends stay apart.
 */
export function laneMarginBrackets(items: MarginInput[], minSpan: number): MarginBracket[] {
  const sized = items.map((it) => {
    let lo = Math.min(it.ya, it.yb), hi = Math.max(it.ya, it.yb);
    if (hi - lo < minSpan) {
      const mid = (lo + hi) / 2;
      lo = mid - minSpan / 2;
      hi = mid + minSpan / 2;
    }
    return { ...it, lo, hi, lane: 0 };
  }).sort((p, q) => (p.hi - p.lo) - (q.hi - q.lo) || p.lo - q.lo || p.key.localeCompare(q.key));
  const lanes: { lo: number; hi: number }[][] = [];
  for (const b of sized) {
    let lane = lanes.findIndex((l) => l.every((o) => b.hi < o.lo || b.lo > o.hi));
    if (lane < 0) { lanes.push([]); lane = lanes.length - 1; }
    lanes[lane].push(b);
    b.lane = lane;
  }
  return sized;
}

/** Width of one lane in px: the bracket's tick and its label. */
export function laneWidth(anyExactP: boolean): number {
  return anyExactP ? 74 : 38;
}
