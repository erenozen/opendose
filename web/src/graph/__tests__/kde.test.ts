// Kernel density of violins and rainclouds (kde.ts) against scipy
// gaussian_kde with the bw.nrd0 bandwidth (reference/kde.py). Run:
// npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bandwidthText, KDE_POINTS, kdeAt, kdeOf, nrd0, widthAt } from "../kde.ts";

const ref = JSON.parse(readFileSync(new URL("./reference/kde.json", import.meta.url), "utf8"));

const close = (a: number, b: number, rel = 1e-10) =>
  Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));

test("bandwidth: Silverman's rule as R bw.nrd0 (numpy, every reference group)", () => {
  for (const [name, r] of Object.entries<Record<string, number[] & number>>(ref)) {
    const h = nrd0(r.values as unknown as number[])!;
    assert.ok(close(h, r.h as number, 1e-12), `${name}: ${h} vs ${r.h}`);
  }
});

test("density on R's grid equals scipy gaussian_kde with that bandwidth", () => {
  for (const [name, r] of Object.entries<Record<string, unknown>>(ref)) {
    const k = kdeOf(r.values as number[])!;
    assert.equal(k.y.length, KDE_POINTS);
    assert.ok(close(k.y[0], r.grid_lo as number, 1e-12), `${name} grid start`);
    assert.ok(close(k.y[KDE_POINTS - 1], r.grid_hi as number, 1e-12), `${name} grid end`);
    (r.idx as number[]).forEach((i, j) => {
      assert.ok(close(k.y[i], (r.y as number[])[j], 1e-12), `${name} y[${i}]`);
      assert.ok(close(k.density[i], (r.density as number[])[j]),
        `${name} density at ${k.y[i]}: ${k.density[i]} vs ${(r.density as number[])[j]}`);
    });
    assert.ok(close(k.max, r.max as number), `${name} peak`);
  }
});

test("no density without spread: n = 0, 1, all values equal; missing values ignored", () => {
  assert.equal(kdeOf([]), null);
  assert.equal(kdeOf([3]), null);
  assert.equal(kdeOf([2, 2, 2, 2]), null);
  assert.equal(nrd0([5, 5]), null);
  const r = ref["two"];
  assert.ok(close(nrd0([4, Number.NaN, 6])!, r.h, 1e-12));
});

test("invariance: shifting the values shifts the density; scaling scales h and 1/density", () => {
  const v = ref["bimodal"].values as number[];
  const a = kdeOf(v)!, b = kdeOf(v.map((x) => x + 1000))!, c = kdeOf(v.map((x) => x * 1e6))!;
  assert.ok(close(a.h, b.h, 1e-9));
  assert.ok(close(a.h * 1e6, c.h, 1e-12));
  assert.ok(close(a.max, b.max, 1e-6));
  assert.ok(close(a.max / 1e6, c.max, 1e-9));
  // permuting the values changes nothing
  const p = kdeOf([...v].reverse())!;
  assert.ok(p.density.every((d, i) => close(d, a.density[i], 1e-12)));
  // the density integrates to 1 over R's grid (trapezoid, cut = 3 loses < 0.3%)
  const step = a.y[1] - a.y[0];
  const area = a.density.reduce((s, d, i) => s + (i === 0 || i === a.y.length - 1 ? d / 2 : d), 0) * step;
  assert.ok(Math.abs(area - 1) < 0.003, `area ${area}`);
});

test("widthAt: the violin's half-width at a value, scaled to its widest point", () => {
  const k = kdeOf(ref["example Control"].values as number[])!;
  const peak = k.y[k.density.indexOf(k.max)];
  assert.ok(close(widthAt(k, peak, 0.4), 0.4, 1e-12));
  assert.equal(widthAt(k, k.y[0] - 1, 0.4), 0);
  // between grid points: linear, within 1e-4 of the exact density there
  const exact = kdeAt(ref["example Control"].values as number[], k.h, [24])[0] / k.max;
  assert.ok(close(widthAt(k, 24, 1), exact, 1e-4));
});

test("bandwidth text: 3 significant digits, e-notation at the extremes", () => {
  assert.equal(bandwidthText(1.06637), "1.07");
  assert.equal(bandwidthText(0.657106), "0.657");
  assert.equal(bandwidthText(9.73585e-14), "9.74e-14");
  assert.equal(bandwidthText(9.73585e10), "9.74e+10");
});
