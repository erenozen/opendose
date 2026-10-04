// ROC and Bland-Altman payloads, and the row pairing of the column
// analysis' Bland-Altman option. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS } from "../../../types.ts";
import { baPayload, defaultBaOptions, pairedRows } from "../blandAltman.ts";
import { asahTable, ejectionTable } from "../clinicalSamples.ts";
import { curveXY, defaultRocOptions, markerName, regionUnder, rocPayloads } from "../roc.ts";
import { columnPayload } from "../run.ts";

const gapped = () => normalizeTable({
  type: "column",
  rowTitles: ["s1", "s1", "s2", "s2", "s3"],
  datasets: [
    { name: "A", rows: [["1"], [""], ["3"], ["4"], ["5"]] },
    { name: "B", rows: [["1.5"], ["2"], [""], ["4.5"], ["5.5"]] },
  ],
});

test("Bland-Altman pairs rows, never shifted values", () => {
  const p = pairedRows(gapped(), 0, 1);
  assert.deepEqual(p.rows, [0, 3, 4]);
  assert.deepEqual(p.a, [1, 4, 5]);
  assert.deepEqual(p.b, [1.5, 4.5, 5.5]);
  const legacy = columnPayload(gapped(), { ...DEFAULT_COLUMN_OPTIONS, analysis: "bland_altman",
    datasetA: 0, datasetB: 1 });
  const ds = (legacy.data as { datasets: { ys: number[][] }[] }).datasets;
  assert.deepEqual(ds[0].ys, [[1], [4], [5]]);
  assert.deepEqual(ds[1].ys, [[1.5], [4.5], [5.5]]);
});

test("Bland-Altman payloads: paired and repeated by row titles", () => {
  const p = baPayload(gapped(), defaultBaOptions());
  assert.ok("payload" in p);
  assert.equal(p.payload.analysis, "bland_altman_extras");
  assert.deepEqual(p.payload.options.variants, ["difference", "ratio", "percent"]);
  const r = baPayload(gapped(), { ...defaultBaOptions(), repeated: "constant" });
  assert.ok("payload" in r);
  assert.deepEqual((r.payload.data as { subjects: string[] }).subjects, ["s1", "s1", "s2", "s2", "s3"]);
  const v = baPayload(gapped(), { ...defaultBaOptions(), repeated: "varies" });
  assert.ok("payload" in v);
  assert.deepEqual((v.payload.data as { a: number[] }).a, [1, 4, 5]);
  const ej = baPayload(ejectionTable(), defaultBaOptions());
  assert.ok("payload" in ej);
  assert.equal((ej.payload.data as { datasets: { ys: number[][] }[] }).datasets[0].ys.length, 60);
});

test("ROC payloads: marker names, paired comparison, cut-off options", () => {
  const t = asahTable();
  assert.equal(markerName(t, 0, 1), "WFNS");
  assert.equal(markerName(t, 2, 3), "S100B");
  const o = { ...defaultRocOptions(t), bootstrap: "200", prevalence: "30", partial: true };
  assert.equal(o.compare, true);
  const p = rocPayloads(t, o);
  assert.ok(!("error" in p));
  assert.deepEqual(p.names, ["WFNS", "S100B"]);
  const cmp = p.compare as { options: Record<string, unknown> };
  assert.deepEqual(cmp.options.curves, [[0, 1], [2, 3]]);
  assert.equal(cmp.options.paired, true);
  const c0 = (p.cutoff[0] as { options: Record<string, unknown> }).options;
  const c1 = (p.cutoff[1] as { options: Record<string, unknown> }).options;
  assert.equal(c0.bootstrap, 200);
  assert.equal(c1.bootstrap, 0);
  assert.equal(c0.prevalence, 0.3);
  assert.deepEqual(c0.partial_auc, { limits: [1, 0.9], focus: "specificity", correct: false });
  assert.match((rocPayloads(t, { ...o, controls: 0 }) as { error: string }).error, /different columns/);
});

test("ROC geometry: points in plotting order and the partial-AUC region", () => {
  const xy = curveXY([{ cutoff: 3, sensitivity: 0.5, specificity: 0.8 },
    { cutoff: 9, sensitivity: 0, specificity: 1 }, { cutoff: 1, sensitivity: 1, specificity: 0 }]);
  assert.deepEqual(xy.x.map(Math.round), [0, 20, 100]);
  const reg = regionUnder([0, 20, 100], [0, 50, 100], 0, 10);
  assert.deepEqual(reg.x, [0, 0, 10, 10]);
  assert.deepEqual(reg.y, [0, 0, 25, 0]);
});
