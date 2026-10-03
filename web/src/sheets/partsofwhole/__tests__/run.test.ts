// Engine payloads for the parts-of-whole analyses. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable, toggleExcluded } from "../../../project/table.ts";
import {
  DEFAULT_FRACTION, DEFAULT_GOF, equalExpected, fractionPayload, gofPayload,
  normalizeFraction, normalizeGof,
} from "../run.ts";

const table = () => normalizeTable({
  type: "partsofwhole",
  x: ["", "", "", ""],
  rowTitles: ["G1", "S", "G2/M", ""],
  datasets: [
    { name: "Control", rows: [["412"], ["188"], ["100"], [""]] },
    { name: "Treated", rows: [["530"], ["95"], ["75"], [""]] },
  ],
});

test("goodness of fit, equal expected: one column, blanks kept as null", () => {
  const b = gofPayload(table(), { ...DEFAULT_GOF, dataset: 1 });
  assert.equal(b.error, undefined);
  assert.deepEqual(b.payload, {
    analysis: "chisq_goodness_of_fit",
    data: {
      datasets: [{ name: "Treated", values: [530, 95, 75, null] }],
      row_titles: ["G1", "S", "G2/M", "Part 4"],
    },
    options: { dataset: 0, expected: [1, 1, 1, 1], expected_as: "counts" },
  });
});

test("goodness of fit, entered expected values", () => {
  const o = { ...DEFAULT_GOF, expectedMode: "entered" as const, expectedAs: "percent" as const,
    expected: ["50", "30", "20"] };
  const b = gofPayload(table(), o);
  assert.deepEqual((b.payload as { options: unknown }).options,
    { dataset: 0, expected: [50, 30, 20, 0], expected_as: "percent" });
  const missing = gofPayload(table(), { ...o, expected: ["50", "", "20"] });
  assert.match(missing.error ?? "", /expected value for S/);
  const zero = gofPayload(table(), { ...o, expected: ["50", "0", "20"] });
  assert.match(zero.error ?? "", /greater than zero/);
});

test("goodness of fit skips excluded values and needs two categories", () => {
  let t = table();
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 1, sub: 0 });
  const b = gofPayload(t, DEFAULT_GOF);
  assert.deepEqual((b.payload as { data: { datasets: { values: unknown[] }[] } })
    .data.datasets[0].values, [412, null, 100, null]);
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 2, sub: 0 });
  assert.match(gofPayload(t, DEFAULT_GOF).error ?? "", /at least two rows/);
});

test("equal fill follows the entered form", () => {
  const t = table();
  assert.deepEqual(equalExpected(t, { ...DEFAULT_GOF, expectedAs: "percent" }),
    ["33.3333", "33.3333", "33.3333", ""]);
  assert.deepEqual(equalExpected(t, { ...DEFAULT_GOF, expectedAs: "counts" }),
    ["233.333", "233.333", "233.333", ""]);
});

test("fraction of total payload and option normalization", () => {
  const b = fractionPayload(table(), { ...DEFAULT_FRACTION, ci: true, divideBy: "row" });
  assert.deepEqual(b.payload, {
    analysis: "fraction_of_total",
    data: { datasets: [
      { name: "Control", values: [412, 188, 100, null] },
      { name: "Treated", values: [530, 95, 75, null] },
    ] },
    options: { divide_by: "row", as_percent: true, ci: true,
               ci_method: "wilson_brown", ci_level: 0.95 },
  });
  assert.deepEqual(normalizeFraction({ divideBy: "nope", ciLevel: 5 }), DEFAULT_FRACTION);
  assert.deepEqual(normalizeGof(null), DEFAULT_GOF);
  const empty = normalizeTable({ type: "partsofwhole", x: ["", ""],
    datasets: [{ name: "Value", rows: [[""], [""]] }] });
  assert.match(fractionPayload(empty, DEFAULT_FRACTION).error ?? "", /Enter values/);
});
