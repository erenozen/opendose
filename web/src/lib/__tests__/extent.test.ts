// minOf / maxOf replace Math.min(...values) / Math.max(...values) on data:
// they must give the same answer on every input the spread gives one for,
// and keep working where the spread runs out of stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { maxOf, minOf, pushAll } from "../extent.ts";

const cases: number[][] = [
  [],
  [3],
  [3, -1, 7.5, 2],
  [-5, -5, -5],
  [NaN],
  [1, NaN, 3],
  [Infinity, -Infinity, 0],
  [0, -0],
  [-0, 0],
  [1e-300, -1e300, 5e-324],
];

test("minOf and maxOf equal Math.min / Math.max spread, including empty, NaN and signed zero", () => {
  for (const c of cases) {
    assert.ok(Object.is(minOf(c), Math.min(...c)), `minOf(${JSON.stringify(c)})`);
    assert.ok(Object.is(maxOf(c), Math.max(...c)), `maxOf(${JSON.stringify(c)})`);
  }
  assert.equal(minOf([]), Infinity);
  assert.equal(maxOf([]), -Infinity);
  assert.ok(Number.isNaN(minOf([1, NaN])) && Number.isNaN(maxOf([NaN, 1])));
});

test("minOf and maxOf coerce like Math.min / Math.max and take any iterable", () => {
  const mixed = [2, null, "7", true] as unknown as number[];
  assert.equal(minOf(mixed), Math.min(...mixed));
  assert.equal(maxOf(mixed), Math.max(...mixed));
  assert.ok(Number.isNaN(maxOf([1, undefined] as unknown as number[])));
  assert.equal(maxOf(new Set([4, 9, 1])), 9);
  assert.equal(minOf(new Float64Array([4, 9, 1])), 1);
});

test("minOf and maxOf handle 1,000,000 values, where the spread throws RangeError", () => {
  const n = 1_000_000;
  const big = Array.from({ length: n }, (_, i) => (i * 7919) % n - 250_000);
  assert.throws(() => Math.max(...big), RangeError);
  assert.equal(minOf(big), -250_000);
  assert.equal(maxOf(big), n - 1 - 250_000);
});

test("pushAll appends like push(...more) and survives 1,000,000 items", () => {
  assert.deepEqual(pushAll([1, 2], [3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(pushAll([], []), []);
  const big = Array.from({ length: 1_000_000 }, (_, i) => i);
  assert.throws(() => [0].push(...big), RangeError);
  const out = pushAll([-1], big);
  assert.equal(out.length, 1_000_001);
  assert.equal(out[1_000_000], 999_999);
});
