// Parameter covariance and the joint region of two parameters (P-102):
// the engine option, the pair offered first, the matrices as table rows
// and the graph's view of the engine's region.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultPair, matrixTable, regionOption, regionParams, regionSentence, regionView,
} from "../fitRegion.ts";
import type { AnalysisResult, FitResult } from "../../../types.ts";

test("joint_region is sent only for two different parameters", () => {
  assert.deepEqual(regionOption({}), {});
  assert.deepEqual(regionOption({ jointRegion: ["LogIC50", "LogIC50"] }), {});
  assert.deepEqual(regionOption({ jointRegion: ["LogIC50", "HillSlope"] }),
    { joint_region: ["LogIC50", "HillSlope"] });
});

test("the pair offered first: the log midpoint with the slope, else the first two", () => {
  assert.deepEqual(defaultPair(["Top", "Bottom", "LogIC50", "HillSlope"]), ["LogIC50", "HillSlope"]);
  assert.deepEqual(defaultPair(["Vmax", "Km"]), ["Vmax", "Km"]);
  assert.equal(defaultPair(["Slope"]), null);
});

// the example 4PL (engine/tests/reference/fit_region.json)
const cov = {
  params: ["Top", "Bottom", "LogIC50", "HillSlope"],
  matrix: [
    [0.5348179210279762, -0.14615035423907252, -0.00461296451033262, 0.016995963075625578],
    [-0.14615035423907252, 0.5543545310046675, -0.004842221253631982, -0.017454246578524],
    [-0.00461296451033262, -0.004842221253631982, 0.0002164519212133577, 5.409430278166975e-06],
    [0.016995963075625578, -0.017454246578524, 5.409430278166975e-06, 0.0014965618226658543],
  ],
  correlation: [
    [1, -0.26841272169863695, -0.4287423807444772, 0.6007523413561353],
    [-0.26841272169863695, 1, -0.4420486884285216, -0.6059823502310338],
    [-0.4287423807444772, -0.4420486884285216, 1, 0.009504245],
    [0.6007523413561353, -0.6059823502310338, 0.009504245, 1],
  ],
};

test("the correlation table: lower triangle, four significant digits", () => {
  const t = matrixTable({ covariance: cov }, "correlation")!;
  assert.deepEqual(t.params, cov.params);
  assert.deepEqual(t.rows.map((r) => [r.name, ...r.cells]), [
    ["Top", "1", "", "", ""],
    ["Bottom", "-0.2684", "1", "", ""],
    ["LogIC50", "-0.4287", "-0.442", "1", ""],
    ["HillSlope", "0.6008", "-0.606", "0.009504", "1"],
  ]);
  const c = matrixTable({ covariance: cov }, "covariance")!;
  assert.deepEqual(c.rows[2].cells, ["-0.004613", "-0.004842", "2.165e-4", "5.409e-6"]);
  assert.equal(matrixTable({}, "covariance"), null);
  const odd = { ...cov, params: ["A", "B"], correlation: [[1, null], [null, null]] };
  assert.deepEqual(matrixTable({ covariance: odd }, "correlation")!.rows[1].cells, ["n/a", "n/a"]);
});

const fit = (jr: FitResult["joint_region"]) => ({
  name: "Drug A",
  fit: { covariance: cov, joint_region: jr } as unknown as FitResult,
});

test("the graph's view of the region, and what the results say about it", () => {
  const result = { datasets: [fit({
    params: ["LogIC50", "HillSlope"], df: [2, 23], f_crit: 3.422132207861177,
    contour: { x: [1, 2, null, 1], y: [3, 4, null, 3] }, ellipse: { x: [1, 2], y: [3, 4] },
    estimate: [-6.983, -1.103], open: true,
  }), { name: "Drug B", fit: { joint_region: { params: ["LogIC50", "HillSlope"], error: "No joint region: the fit is ambiguous" } } }],
  } as unknown as AnalysisResult;
  assert.deepEqual(regionParams(result), cov.params);
  const v = regionView(result)!;
  assert.deepEqual(v.params, ["LogIC50", "HillSlope"]);
  assert.equal(v.sets.length, 2);
  assert.equal(v.sets[0].open, true);
  assert.equal(v.sets[1].error, "No joint region: the fit is ambiguous");
  assert.equal(regionSentence(v),
    "The joint 95% confidence region of LogIC50 and HillSlope by profile likelihood: with the other "
    + "parameters refitted, the sum of squares stays within SS_min × (1 + 2F/23), F(2, 23) = 3.422 "
    + "(Bates and Watts 1988). The dashed ellipse is the linear approximation behind the asymptotic "
    + "SEs; where the two differ, those SEs and CIs are approximate.");
  assert.equal(regionView({ datasets: [] } as unknown as AnalysisResult), null);
});
