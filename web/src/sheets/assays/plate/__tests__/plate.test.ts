// Plate map, plates in the table, engine payload and dose-response
// tables of the plate-reader module. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignRole, assignSeries, BUILTIN_TEMPLATES, compoundsOf, doseResponseTable, findPlates,
  fitSettings, mapProblem, normalizePlateOptions, outputKeys, plateMapPayload, platesOf,
  plateTable, rowsLayout, runPlateQc, seriesConcentrations, DEFAULT_PLATE_OPTIONS,
  type PlateOptions,
} from "../model.ts";
import { SAMPLE_PLATE, plateSample } from "../sample.ts";

test("a dilution series runs along its direction, replicates across it", () => {
  const m = assignSeries({}, { r0: 1, c0: 2, r1: 3, c1: 10 },
    { compound: "X", mode: "dilution", top: 10, factor: 3, list: [], direction: "right" });
  assert.deepEqual(m.C3, { role: "sample", compound: "X", conc: 10, rep: 2 });
  assert.equal(m.B4.conc, 3.33333);           // 6 significant digits
  assert.equal(m.D11.conc, 0.00152416);
  assert.equal(m.D11.rep, 3);
  const up = assignSeries({}, { r0: 1, c0: 0, r1: 6, c1: 2 },
    { compound: "Y", mode: "list", top: 0, factor: 1, list: [1, 2, 3, 4, 5, 6], direction: "up" });
  assert.equal(up.G1.conc, 1);
  assert.equal(up.B3.conc, 6);
  assert.equal(up.B3.rep, 3);
  assert.deepEqual(seriesConcentrations({ compound: "", mode: "dilution", top: 100, factor: 2, list: [],
    direction: "right" }, 3), [100, 50, 25]);
});

test("roles, empty wells and map problems", () => {
  let m = assignRole({}, { r0: 0, c0: 0, r1: 7, c1: 0 }, "blank");
  assert.equal(Object.keys(m).length, 8);
  m = assignRole(m, { r0: 0, c0: 0, r1: 1, c1: 0 }, "empty");
  assert.equal(Object.keys(m).length, 6);
  assert.match(mapProblem(m, "percent_of_control")!, /compound/);
  m = assignSeries(m, { r0: 0, c0: 2, r1: 0, c1: 4 },
    { compound: "Z", mode: "dilution", top: 1, factor: 10, list: [], direction: "right" });
  assert.match(mapProblem(m, "percent_of_control")!, /vehicle/);
  m = assignRole(m, { r0: 0, c0: 1, r1: 7, c1: 1 }, "negative");
  assert.equal(mapProblem(m, "percent_of_control"), null);
  assert.match(mapProblem(m, "percent_activity")!, /positive/);
});

test("templates are complete plate maps", () => {
  for (const t of BUILTIN_TEMPLATES) {
    assert.equal(mapProblem(t.wells, "percent_of_control"), null, t.id);
  }
  assert.deepEqual(compoundsOf(rowsLayout()), ["Drug A", "Drug B", "Drug C"]);
  const srb = BUILTIN_TEMPLATES.find((t) => t.id === "srb")!.wells;
  assert.equal(srb.B2.compound, "Line S");       // vehicle scoped to its cell line
  assert.equal(srb.E11.conc, 0.05);
});

test("plates stack in the table; payload carries the map", () => {
  const second = SAMPLE_PLATE.map((r) => r.map((v) => v * 2));
  const t = plateTable([SAMPLE_PLATE, second], 96);
  assert.equal(t.x.length, 16);
  assert.equal(t.rowTitles[8], "P2 A");
  const plates = platesOf(t, 96);
  assert.equal(plates.length, 2);
  assert.equal(plates[1][0][1], 2.432);
  assert.deepEqual(platesOf(plateSample(), 96)[0][7], SAMPLE_PLATE[7]);
  const pm = plateMapPayload(rowsLayout());
  assert.deepEqual(pm.A3, { role: "sample", compound: "Drug A", concentration: 10, replicate: 1 });
  assert.deepEqual(pm.A1, { role: "blank", compound: null, concentration: null, replicate: null });
});

test("plate blocks are found in reader text, one after another", () => {
  const block = (k: number) => [["", ...Array.from({ length: 12 }, (_, c) => String(c + 1))],
    ...SAMPLE_PLATE.map((r, i) => ["ABCDEFGH"[i], ...r.map((v) => String(v * k))])];
  const m = [["Reader v2 export"], ...block(1), [""], ["Plate 2"], ...block(2)];
  const found = findPlates([m]);
  assert.equal(found.format, 96);
  assert.equal(found.plates.length, 2);
  assert.equal(found.plates[1][7][11], 0.208);
});

// A fake engine: returns per-compound tables like assay_plate.plate_qc.
const fake = (plate: number) => ({
  dose_response: [
    { compound: "A", x: [0.1, 1], datasets: [{ ys: [[90 + plate, 91], [10, 11]] }], n_replicates: 2 },
    { compound: "B", x: [1, 10], datasets: [{ ys: [[80], [20]] }], n_replicates: 1 },
  ],
});

test("dose-response tables: pooled, combined and per plate", () => {
  const o: PlateOptions = { ...DEFAULT_PLATE_OPTIONS, wells: rowsLayout() };
  const run = { format: 96 as const, plates: [fake(0), fake(1)] };
  const pooled = doseResponseTable(run, o, "pooled")!;
  assert.deepEqual(pooled.x, ["0.1", "1", "10"]);
  assert.equal(pooled.datasets.length, 2);
  assert.deepEqual(pooled.datasets[0].rows[0], ["90", "91", "91", "91"]);   // plates side by side
  assert.deepEqual(pooled.datasets[1].rows[0], ["", "", "", ""]);   // one width per table
  assert.equal(pooled.yTitle, "Viability (% of control)");
  const combined = doseResponseTable(run, o, "combined")!;
  assert.deepEqual(combined.datasets.map((d) => d.name), ["A (plate 1)", "B (plate 1)", "A (plate 2)", "B (plate 2)"]);
  const p2 = doseResponseTable(run, o, "plate:1")!;
  assert.deepEqual(p2.datasets[0].rows[0], ["91", "91"]);
  assert.deepEqual(outputKeys(run, { ...o, outputMode: "per_plate" }), ["plate:0", "plate:1"]);
  assert.equal(doseResponseTable({ error: "x" }, o, "pooled"), null);
});

test("the fit is set up for normalised data; constraints only when asked", () => {
  const o: PlateOptions = { ...DEFAULT_PLATE_OPTIONS };
  const f = fitSettings({ model: "x", normalize: { enabled: true } }, o) as Record<string, any>;
  assert.equal(f.model, "log_inhibitor_vs_response_4pl");
  assert.equal(f.xIsLog, false);
  assert.equal(f.top.enabled, false);
  const g = fitSettings({}, { ...o, normalization: "percent_inhibition", constrain: true }) as Record<string, any>;
  assert.equal(g.model, "log_agonist_vs_response_4pl");
  assert.deepEqual([g.top, g.bottom], [{ enabled: true, value: "100" }, { enabled: true, value: "0" }]);
});

test("runPlateQc sends one plate_qc per plate and stops on map problems", () => {
  const sent: any[] = [];
  const o = normalizePlateOptions({ wells: rowsLayout(), cvLimit: 20 });
  const r = runPlateQc((p) => { sent.push(p); return fake(0); }, plateSample(), o);
  assert.equal(r.plates?.length, 1);
  assert.equal(sent[0].analysis, "plate_qc");
  assert.equal(sent[0].options.cv_limit, 20);
  assert.equal(sent[0].data.grid[0][1], 1.216);
  assert.match(runPlateQc(() => ({}), plateSample(), DEFAULT_PLATE_OPTIONS).error!, /compound/);
  assert.deepEqual(normalizePlateOptions({ wells: { A1: { role: "nonsense" }, b2: { role: "blank" } } }).wells,
    { B2: { role: "blank" } });
});
