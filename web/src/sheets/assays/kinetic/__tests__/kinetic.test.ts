// Kinetic module: options, the blank data set, the engine payload, the
// linked Michaelis-Menten table and the rate units. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../../project/table.ts";
import {
  blankIndexOf, DEFAULT_KINETIC, kineticPayload, michaelisSettings, normalizeKinetic, rateTable, rateUnit,
  runKinetic, timeUnit,
} from "../model.ts";
import { kineticSample } from "../sample.ts";

test("the example: 21 reads, a no-enzyme blank and seven substrates in triplicate", () => {
  const t = kineticSample();
  assert.equal(t.x.length, 21);
  assert.deepEqual(t.datasets.map((d) => d.name), ["No enzyme", "25", "50", "100", "200", "400", "800", "1600"]);
  assert.deepEqual(t.datasets.map((d) => d.rows[0].length), [3, 3, 3, 3, 3, 3, 3, 3]);
  assert.equal(timeUnit(t), "min");
  assert.equal(rateUnit(t, DEFAULT_KINETIC), "A405/min");
});

test("defaults: the steepest 5-read slope, the blank found by name", () => {
  assert.equal(DEFAULT_KINETIC.method, "steepest");
  assert.equal(DEFAULT_KINETIC.k, 5);
  const t = kineticSample();
  assert.equal(blankIndexOf(t, DEFAULT_KINETIC), 0);
  assert.equal(blankIndexOf(t, normalizeKinetic({ blankIndex: -2 })), -1);
  assert.equal(blankIndexOf(t, normalizeKinetic({ blankIndex: 3 })), 3);
  const p = kineticPayload(t, DEFAULT_KINETIC) as { analysis: string; options: Record<string, unknown> };
  assert.equal(p.analysis, "kinetic_rates");
  assert.deepEqual(p.options, { method: "steepest", k: 5, min_r2: 0.99, min_points: 3, window: [null, null], blank_index: 0 });
  const conv = kineticPayload(t, normalizeKinetic({ factor: "6.22", saturation: "3.5", blankIndex: -2 })) as
    { options: Record<string, unknown> };
  assert.equal(conv.options.factor, 6.22);
  assert.equal(conv.options.saturation, 3.5);
  assert.equal("blank_index" in conv.options, false);
  assert.equal(rateUnit(t, normalizeKinetic({ factor: "6.22", factorUnit: "mM/min" })), "mM/min");
});

test("options are sanitised; a bad conversion factor is refused before the engine", () => {
  const o = normalizeKinetic({ method: "x", k: 1, minR2: 2, minPoints: 2, blankIndex: -5 });
  assert.deepEqual(o, DEFAULT_KINETIC);
  const r = runKinetic(() => assert.fail("engine called"), kineticSample(), normalizeKinetic({ factor: "-1" }));
  assert.match(String(r.error), /conversion factor/);
});

test("the Michaelis-Menten table: numeric samples only, wells as replicates, the fit preset", () => {
  const res = {
    samples: [
      { sample: "No enzyme", substrate: null, is_blank: true, velocities: [0.0001] },
      { sample: "10", substrate: 10, is_blank: false, velocities: [0.1, 0.12] },
      { sample: "20", substrate: 20, is_blank: false, velocities: [0.2] },
      { sample: "40", substrate: 40, is_blank: false, velocities: [0.3, 0.31] },
    ],
  };
  const src = normalizeTable({ type: "xy", x: ["0"], xTitle: "Time (min)", yTitle: "A340", datasets: [] });
  const t = rateTable(res, src, DEFAULT_KINETIC)!;
  assert.deepEqual(t.x, ["10", "20", "40"]);
  // the unit Km is reported in: µM by default, never the XY default molar
  assert.equal(t.xTitle, "Substrate (µM)");
  assert.equal(rateTable(res, src, normalizeKinetic({ substrateUnit: "mM" }))!.xTitle, "Substrate (mM)");
  assert.equal(t.yTitle, "Initial rate (A340/min)");
  assert.deepEqual(t.datasets[0].rows, [["0.1", "0.12"], ["0.2", ""], ["0.3", "0.31"]]);
  assert.deepEqual(michaelisSettings({ keep: 1 }),
    { keep: 1, xIsLog: false, normalize: { enabled: false }, model: "michaelis_menten" });
  assert.equal(rateTable({ samples: res.samples.slice(0, 3) }, src, DEFAULT_KINETIC), null);   // only two substrates
});
