// Row virtualisation for the data grid (need `large-data`): a table with
// many rows renders only the rows in view plus an overscan above and
// below, with spacer rows standing in for the rest, so pasting 100,000
// rows or typing into a 20,000-cell table costs what a screenful costs.
// Rows have one height (every cell is a one-line input), measured from
// the rendered rows. Pure; unit-tested (__tests__/virtualRows.test.ts).

/** Below this many rows every row is rendered (small tables keep plain
 *  document flow; nothing to gain). */
export const VIRTUAL_MIN_ROWS = 150;
/** Rows rendered beyond each edge of the viewport, so arrow keys and
 *  short scrolls never meet an unrendered row. */
export const OVERSCAN_ROWS = 15;
/** Row height before the first measurement (one-line input, 13.5 px text). */
export const DEFAULT_ROW_PX = 31;
/** Rows rendered before the viewport is measured. */
export const INITIAL_ROWS = 60;

/** Rows [start, end) to render. */
export interface RowRange { start: number; end: number }

export interface ViewportMetrics {
  /** The scroll container's scrollTop and visible height (px). */
  scrollTop: number;
  viewport: number;
  /** Offset of the first body row from the top of the scrolled content. */
  bodyTop: number;
  rowPx: number;
}

export function shouldVirtualise(nRows: number): boolean {
  return nRows > VIRTUAL_MIN_ROWS;
}

/** The rows in view, widened by the overscan and clamped to the table. */
export function visibleRange(m: ViewportMetrics, nRows: number,
  overscan = OVERSCAN_ROWS): RowRange {
  if (nRows <= 0) return { start: 0, end: 0 };
  const px = m.rowPx > 0 ? m.rowPx : DEFAULT_ROW_PX;
  const top = m.scrollTop - m.bodyTop;
  const first = Math.floor(top / px);
  const last = Math.ceil((top + Math.max(0, m.viewport)) / px);
  const start = Math.max(0, Math.min(nRows - 1, first - overscan));
  const end = Math.max(start + 1, Math.min(nRows, last + overscan));
  return { start, end };
}

/** What the table body draws: runs of real rows and spacer gaps. */
export type Segment =
  | { kind: "rows"; start: number; end: number }
  | { kind: "gap"; rows: number; at: number };

/**
 * The body as segments: the rows of `range`, plus any `pinned` rows
 * outside it (the cell with keyboard focus stays mounted while it scrolls
 * away, so typing and Shift+arrows keep working), with gaps between.
 */
export function rowSegments(nRows: number, range: RowRange,
  pinned: readonly (number | null | undefined)[] = []): Segment[] {
  const start = Math.max(0, Math.min(range.start, nRows));
  const end = Math.max(start, Math.min(range.end, nRows));
  const runs: [number, number][] = [];
  if (end > start) runs.push([start, end]);
  for (const p of pinned) {
    if (p === null || p === undefined || !Number.isInteger(p) || p < 0 || p >= nRows) continue;
    if (p >= start && p < end) continue;
    if (runs.some(([a, b]) => p >= a && p < b)) continue;
    runs.push([p, p + 1]);
  }
  runs.sort((a, b) => a[0] - b[0]);
  // merge touching runs
  const merged: [number, number][] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: Segment[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) out.push({ kind: "gap", rows: a - at, at });
    out.push({ kind: "rows", start: a, end: b });
    at = b;
  }
  if (at < nRows) out.push({ kind: "gap", rows: nRows - at, at });
  return out;
}

/**
 * The scrollTop that brings `row` fully into view below a sticky header
 * of `headPx`, or null when it already is.
 */
export function scrollTopFor(row: number, m: ViewportMetrics, headPx = 0): number | null {
  const px = m.rowPx > 0 ? m.rowPx : DEFAULT_ROW_PX;
  const top = m.bodyTop + row * px;
  const bottom = top + px;
  if (top < m.scrollTop + headPx) return Math.max(0, top - headPx);
  if (bottom > m.scrollTop + m.viewport) return Math.max(0, bottom - m.viewport);
  return null;
}

/** Whether two ranges render the same rows. */
export function sameRange(a: RowRange, b: RowRange): boolean {
  return a.start === b.start && a.end === b.end;
}
