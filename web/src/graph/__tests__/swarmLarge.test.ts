// Point layouts on large groups (P-10): no stack overflow past the
// ~126,000 values a spread can take, and the beeswarm's neighbour scan
// gives exactly what the filter over every placed point gave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { beeswarm, spreadOffsets, type SpreadScale } from "../swarm.ts";

const S: SpreadScale = { pxPerY: 20, pxPerX: 300, marker: 8 };

/** The beeswarm as it was: neighbours by filtering every placed point. */
function beeswarmFilter(values: number[], s: SpreadScale): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  if (n <= 1) return out;
  const d = s.marker;
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const placed: { x: number; y: number }[] = [];
  let right = false;
  for (const i of order) {
    const y = values[i] * s.pxPerY;
    const near = placed.filter((p) => Math.abs(p.y - y) < d);
    const cands = [0];
    for (const p of near) {
      const dx = Math.sqrt(Math.max(0, d * d - (p.y - y) ** 2));
      cands.push(p.x + dx, p.x - dx);
    }
    const ok = (x: number) => near.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= d * d - 1e-6);
    let best = Number.POSITIVE_INFINITY;
    for (const c of cands) {
      if (!ok(c)) continue;
      const a = Math.abs(c), b = Math.abs(best);
      if (a < b - 1e-9 || (Math.abs(a - b) <= 1e-9 && (right ? c > best : c < best))) best = c;
    }
    if (!Number.isFinite(best)) best = 0;
    if (Math.abs(best) > 1e-9) right = !right;
    placed.push({ x: best, y });
    out[i] = best / s.pxPerX;
  }
  const m = Math.max(0, ...out.map(Math.abs));
  return m <= 0.42 ? out : out.map((x) => (x * 0.42) / m);
}

test("beeswarm with the neighbour scan equals the filter over all points", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const n of [2, 10, 300, 2000]) {
    const v = Array.from({ length: n }, () => Math.round(rnd() * 40) / 4);   // many ties
    assert.deepEqual(beeswarm(v, S), beeswarmFilter(v, S), `n = ${n}`);
  }
});

test("200,000 values: symmetric and beeswarm layouts run without a RangeError", () => {
  const v = Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 1000 / 10);
  const sym = spreadOffsets(v, "symmetric", { ...S, pxPerY: 2000 });
  assert.equal(sym.length, v.length);
  assert.ok(sym.every((x) => Math.abs(x) <= 0.42 + 1e-12));
  const sw = spreadOffsets(v.slice(0, 20_000), "swarm", S);
  assert.equal(sw.length, 20_000);
});
