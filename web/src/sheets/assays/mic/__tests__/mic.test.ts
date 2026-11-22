// MIC module: options, the engine payload, the linked % growth table.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../../project/table.ts";
import { concUnit, DEFAULT_MIC, growthTable, micPayload, normalizeMic, runMic } from "../model.ts";
import { MIC_SAMPLE_BLANK, micSample } from "../sample.ts";

test("the example: 11 concentrations with a growth control, 6 isolates in triplicate", () => {
  const t = micSample();
  assert.equal(t.subcolumnFormat, "replicates");
  assert.equal(t.x[0], "0");
  assert.equal(t.x.length, 11);
  assert.deepEqual(t.datasets.map((d) => d.rows[0].length), [3, 3, 3, 3, 3, 3]);
  assert.equal(t.datasets[2].rows[4][1], "0.048");      // the planted skipped well
  assert.equal(concUnit(t), "µg/mL");
});

test("payload: the blank as a number, the cut-off only in OD mode", () => {
  const p = micPayload(micSample(), normalizeMic({ blank: MIC_SAMPLE_BLANK })) as {
    analysis: string; data: { x: number[] }; options: Record<string, unknown>;
  };
  assert.equal(p.analysis, "mic");
  assert.deepEqual(p.data.x.slice(0, 3), [0, 0.125, 0.25]);
  assert.deepEqual(p.options, { blank: 0.045, threshold_mode: "percent", threshold: 10, fit_ic50: true, ci_level: 0.95 });
  const od = micPayload(micSample(), normalizeMic({ thresholdMode: "od", odCutoff: "0.08" })) as { options: Record<string, unknown> };
  assert.equal(od.options.od_cutoff, 0.08);
  assert.equal(od.options.blank, null);
});

test("options are sanitised; a missing OD cut-off is refused before the engine", () => {
  assert.deepEqual(normalizeMic({ threshold: 100, thresholdMode: "x", fitIc50: "yes" }), DEFAULT_MIC);
  const r = runMic(() => assert.fail("engine called"), micSample(), normalizeMic({ thresholdMode: "od", odCutoff: "" }));
  assert.match(String(r.error), /OD cut-off/);
});

test("the linked table: % growth at the drug concentrations, growth controls left out", () => {
  const src = normalizeTable({ type: "xy", x: ["0", "1", "2"], xTitle: "Concentration (µg/mL)",
    datasets: [{ name: "A", rows: [["1", "1"], ["0.5", "0.6"], ["0.05", "0.04"]] }] });
  const res = {
    strains: [{ strain: "A" }],
    series: [
      { strain: "A", series: 1, wells: [{ concentration: 1, growth: 50 }, { concentration: 2, growth: 5 }] },
      { strain: "A", series: 2, wells: [{ concentration: 1, growth: 60 }] },
    ],
  };
  const t = growthTable(res, src)!;
  assert.deepEqual(t.x, ["1", "2"]);
  assert.equal(t.yTitle, "Growth (% of the growth control)");
  assert.deepEqual(t.datasets[0].rows, [["50", "60"], ["5", ""]]);
  assert.equal(growthTable({ error: "x" }, src), null);
});
