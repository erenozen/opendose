import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OVERSCAN_ROWS, VIRTUAL_MIN_ROWS, rowSegments, sameRange, scrollTopFor, shouldVirtualise,
  visibleRange,
} from "../virtualRows.ts";

const M = { scrollTop: 0, viewport: 600, bodyTop: 60, rowPx: 30 };

test("only long tables are virtualised", () => {
  assert.equal(shouldVirtualise(VIRTUAL_MIN_ROWS), false);
  assert.equal(shouldVirtualise(VIRTUAL_MIN_ROWS + 1), true);
  assert.equal(shouldVirtualise(100000), true);
});

test("the rows in view plus the overscan, clamped to the table", () => {
  // top of the table: the header takes 60 px, 18 rows show, + overscan below
  assert.deepEqual(visibleRange(M, 100000), { start: 0, end: 18 + OVERSCAN_ROWS });
  // scrolled to row 1000
  const r = visibleRange({ ...M, scrollTop: 60 + 1000 * 30 }, 100000);
  assert.deepEqual(r, { start: 1000 - OVERSCAN_ROWS, end: 1020 + OVERSCAN_ROWS });
  // bottom of the table
  const end = visibleRange({ ...M, scrollTop: 60 + 99990 * 30 }, 100000);
  assert.equal(end.end, 100000);
  assert.ok(end.start < 99990);
  assert.deepEqual(visibleRange(M, 0), { start: 0, end: 0 });
  // a row height not yet measured falls back to the default
  assert.ok(visibleRange({ ...M, rowPx: 0 }, 500).end > 0);
});

test("segments: rows in view, a pinned focused row elsewhere, gaps in between", () => {
  assert.deepEqual(rowSegments(1000, { start: 100, end: 150 }), [
    { kind: "gap", rows: 100, at: 0 },
    { kind: "rows", start: 100, end: 150 },
    { kind: "gap", rows: 850, at: 150 },
  ]);
  assert.deepEqual(rowSegments(1000, { start: 100, end: 150 }, [5, null, 120, undefined, 999]), [
    { kind: "gap", rows: 5, at: 0 },
    { kind: "rows", start: 5, end: 6 },
    { kind: "gap", rows: 94, at: 6 },
    { kind: "rows", start: 100, end: 150 },
    { kind: "gap", rows: 849, at: 150 },
    { kind: "rows", start: 999, end: 1000 },
  ]);
  // a pinned row next to the range merges with it
  assert.deepEqual(rowSegments(300, { start: 0, end: 50 }, [50]), [
    { kind: "rows", start: 0, end: 51 },
    { kind: "gap", rows: 249, at: 51 },
  ]);
  // every row is accounted for exactly once
  const segs = rowSegments(5000, { start: 2000, end: 2060 }, [3, 4999, 2100]);
  const total = segs.reduce((n, s) => n + (s.kind === "gap" ? s.rows : s.end - s.start), 0);
  assert.equal(total, 5000);
  assert.deepEqual(rowSegments(10, { start: 0, end: 10 }, [-1, 12, 2.5]), [{ kind: "rows", start: 0, end: 10 }]);
});

test("scrolling a row into view below the sticky header", () => {
  const m = { ...M, scrollTop: 60 + 1000 * 30 };
  assert.equal(scrollTopFor(1005, m, 50), null);           // already visible
  assert.equal(scrollTopFor(999, m, 50), 60 + 999 * 30 - 50); // above: under the header
  assert.equal(scrollTopFor(1030, m, 50), 60 + 1031 * 30 - 600); // below
  assert.equal(scrollTopFor(0, { ...M, scrollTop: 500 }, 60), 0);
});

test("sameRange", () => {
  assert.equal(sameRange({ start: 1, end: 2 }, { start: 1, end: 2 }), true);
  assert.equal(sameRange({ start: 1, end: 2 }, { start: 1, end: 3 }), false);
});
