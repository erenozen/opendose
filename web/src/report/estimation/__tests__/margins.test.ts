// The equivalence margin on the estimation plot (P-12 follow-up): which t
// test it comes from, its orientation on the plot (test minus control),
// the reasons it is left off, the figure's lines and the legend sentence.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimationFigure } from "../figure.ts";
import { equivalenceSheet, estimationMargins, familyEquivalence, marginsLegend } from "../margins.ts";
import { CHROME_LIGHT } from "../../../lib/palette.ts";

// engine/tests/reference/equivalence_tost.py, the acceptance data (A =
// 10.8, 10.75, 10.55, 10.5, 9.6, 9.65, 9.85, 9.9; B = A - 0.2): statsmodels
// ttost_ind, margin ±1: A − B = 0.2, 90% CI -0.2403 to 0.6403, P 0.00321
const BLOCK = { kind: "equivalence", scale: "difference", alpha: 0.05, ci_level: 0.9,
  lower: -1, upper: 1, estimate: 0.2, ci: [-0.24032753394372358, 0.6403275339437222],
  p: 0.003210270582712357, shown: true };
const TTEST = { analysis: "ttest", names: ["A", "B"], equivalence: BLOCK };
const UNPAIRED = { analysis: "ttest", ttestKind: "unpaired" };
const A = [10.8, 10.75, 10.55, 10.5, 9.6, 9.65, 9.85, 9.9];
const B = A.map((v) => +(v - 0.2).toFixed(2));
/** An estimation result of A (control) and B: the difference B − A =
 *  -0.2; the bootstrap CI here is illustrative (no number is pinned on
 *  it), the margins come from the t test above. */
const est = (control = "A", test = "B", effect = "mean_diff", paired = false) => ({
  analysis: "estimation", paired,
  groups: [{ name: "A", n: 8, mean: 10.2, sd: 0.5, values: A }, { name: "B", n: 8, mean: 10.0, sd: 0.5, values: B }],
  comparisons: [{ control, test, paired, effects: [{ effect, label: effect === "mean_diff" ? "Mean difference"
    : "Hedges' g", difference: control === "A" ? -0.2 : 0.2, ci: control === "A" ? [-0.6, 0.2] : [-0.2, 0.6] }] }],
  plot: { kind: "gardner_altman", order: [control, test], reference_mean: control === "A" ? 10.2 : 10.0 },
});

test("the family's t test with a margin is found; others are not", () => {
  const sheets = [
    { kind: "results", id: "r0", parentId: "d", analysis: "column", options: { analysis: "ttest", equivalence: "off" } },
    { kind: "results", id: "r1", parentId: "d", analysis: "column", options: { analysis: "ttest", equivalence: "equivalence" } },
    { kind: "results", id: "r2", parentId: "e", analysis: "column", options: { analysis: "ttest", equivalence: "equivalence" } },
  ];
  assert.equal(equivalenceSheet(sheets, "d")?.id, "r1");
  assert.equal(equivalenceSheet(sheets, "e")?.id, "r2");
  assert.equal(equivalenceSheet(sheets, "x"), null);
  assert.equal(equivalenceSheet(sheets.slice(0, 1), "d"), null, "margin off");
});

test("the plot's control is A: margin and 90% CI are mirrored onto B − A", () => {
  const a = estimationMargins(est(), TTEST, UNPAIRED)!;
  assert.equal(a.drawn, true);
  if (!a.drawn) return;
  assert.deepEqual([a.m.control, a.m.test, a.m.sign], ["A", "B", -1]);
  assert.deepEqual([a.m.lower, a.m.upper], [-1, 1]);
  assert.deepEqual(a.m.ci, [-0.6403275339437222, 0.24032753394372358]);
  assert.equal(a.m.estimate, -0.2);
  assert.equal(a.m.level, 0.9);
});

test("the plot's control is B: the t test's own A − B", () => {
  const a = estimationMargins(est("B", "A"), TTEST, UNPAIRED)!;
  assert.ok(a.drawn);
  if (!a.drawn) return;
  assert.equal(a.m.sign, 1);
  assert.deepEqual(a.m.ci, [-0.24032753394372358, 0.6403275339437222]);
  assert.equal(a.m.estimate, 0.2);
  // non-inferiority, higher is better (A − B above -1): one bound, on the
  // other side once mirrored
  const ni = { ...TTEST, equivalence: { ...BLOCK, kind: "noninferiority", upper: null } };
  const n1 = estimationMargins(est("B", "A"), ni, UNPAIRED)!;
  const n2 = estimationMargins(est(), ni, UNPAIRED)!;
  assert.ok(n1.drawn && n2.drawn);
  if (!n1.drawn || !n2.drawn) return;
  assert.deepEqual([n1.m.lower, n1.m.upper], [-1, null]);
  assert.deepEqual([n2.m.lower, n2.m.upper], [null, 1]);
});

test("left off, with the reason, when the two do not describe one difference", () => {
  const why = (r: unknown) => (r && !(r as { drawn: boolean }).drawn ? (r as { reason: string }).reason : null);
  assert.equal(why(estimationMargins(est(), { ...TTEST, equivalence: { ...BLOCK, scale: "ratio", ci_ratio: [0.9, 1.1] } }, UNPAIRED)),
    "the margin is a ratio (A/B) and the plot shows a difference");
  assert.equal(why(estimationMargins(est("A", "B", "hedges_g"), TTEST, UNPAIRED)),
    "the margin is in the data's units and the plot shows hedges' g");
  assert.equal(why(estimationMargins(est(), TTEST, { ttestKind: "paired" })),
    "the t test is paired and the plot is not");
  assert.equal(why(estimationMargins(est("A", "B", "mean_diff", true), TTEST, UNPAIRED)),
    "the plot is paired and the t test is not");
  assert.equal(why(estimationMargins(est(), { ...TTEST, names: ["A", "C"] }, UNPAIRED)),
    "the plot does not compare A with C");
  // nothing to say: no usable equivalence block, or no estimation yet
  assert.equal(estimationMargins(est(), { analysis: "ttest", names: ["A", "B"] }, UNPAIRED), null);
  assert.equal(estimationMargins(est(), { ...TTEST, equivalence: { unavailable: "x" } }, UNPAIRED), null);
  assert.equal(estimationMargins({ error: "x" }, TTEST, UNPAIRED), null);
});

test("the Gardner-Altman figure: dashed margin lines and the capped 90% CI on the difference axis", () => {
  const inp = { chrome: CHROME_LIGHT, font: "Inter", yTitle: "Y", dsOf: (g: string) => (g === "A" ? 0 : 1),
    color: () => "#2a78d6", symbol: () => "circle" };
  const before = estimationFigure({ ...inp, result: est() });
  const a = estimationMargins(est(), TTEST, UNPAIRED)!;
  assert.ok(a.drawn);
  if (!a.drawn) return;
  const after = estimationFigure({ ...inp, result: est(), margins: a.m });
  const lines = (after.layout.shapes ?? []).filter((s) => String(s.name ?? "").startsWith("equivalence-margin"));
  assert.deepEqual(lines.map((s) => [s.name, s.yref, s.y0, s.y1, (s.line as { dash?: string }).dash]),
    [["equivalence-margin:lower", "y2", -1, -1, "dash"], ["equivalence-margin:upper", "y2", 1, 1, "dash"]]);
  const xEff = 1 + 1.2;
  assert.deepEqual([lines[0].x0, lines[0].x1].map((v) => Math.round(Number(v) * 1e9) / 1e9), [xEff - 0.42, xEff + 0.5].map((v) => Math.round(v * 1e9) / 1e9));
  const ci = (after.traces as Record<string, any>[]).find((t) => t.name === "equivalence-ci")!;
  assert.equal(ci.x[0], xEff - 0.14);
  assert.equal(ci.y[0], -0.2);
  assert.ok(Math.abs(ci.y[0] + ci.error_y.array[0] - 0.24032753394372358) < 1e-12);
  assert.ok(Math.abs(ci.y[0] - ci.error_y.arrayminus[0] + 0.6403275339437222) < 1e-12);
  assert.deepEqual((after.layout.annotations ?? []).map((n) => n.text), ["margin −1", "margin +1"]);
  // the difference axis holds both margins (0 at the control mean 10.2)
  const r = after.layout.yaxis2!.range as number[];
  assert.ok(r[0] < -1 && r[1] > 1, JSON.stringify(r));
  // without a margin the figure is exactly as before
  assert.deepEqual(estimationFigure({ ...inp, result: est(), margins: null }), before);
  assert.equal(before.layout.annotations, undefined);
});

test("the legend says what the lines and the bar are, or why there are none", () => {
  assert.equal(marginsLegend(estimationMargins(est(), TTEST, UNPAIRED)),
    "Dashed lines mark the equivalence margin of the t test (A − B within ±1, drawn as B minus A); "
    + "the capped bar left of the difference is that test's 90% CI (-0.6403 to 0.2403), which lies "
    + "inside the margin exactly when the two one-sided tests show equivalence (Schuirmann 1987).");
  assert.equal(marginsLegend(estimationMargins(est("B", "A"), TTEST, UNPAIRED)),
    "Dashed lines mark the equivalence margin of the t test (A − B within ±1); the capped bar left "
    + "of the difference is that test's 90% CI (-0.2403 to 0.6403), which lies inside the margin "
    + "exactly when the two one-sided tests show equivalence (Schuirmann 1987).");
  const ni = { ...TTEST, equivalence: { ...BLOCK, kind: "noninferiority", upper: null } };
  assert.match(marginsLegend(estimationMargins(est("B", "A"), ni, UNPAIRED)),
    /^A dashed line marks the non-inferiority margin of the t test \(A − B above -1\)/);
  assert.equal(marginsLegend(estimationMargins(est(), TTEST, { ttestKind: "paired" })),
    "No equivalence margin on this plot: the t test is paired and the plot is not.");
  assert.equal(marginsLegend(null), "");
});

test("exports find the same t test: estimation graphs only, not frozen ones", () => {
  const sheets = [{ kind: "results", id: "r1", parentId: "d", analysis: "column",
    options: { analysis: "ttest", ttestKind: "unpaired", equivalence: "equivalence" } }];
  const resultOf = () => TTEST;
  assert.deepEqual(familyEquivalence(sheets, { graphType: "estimation", parentId: "d" }, resultOf),
    { result: TTEST, options: sheets[0].options });
  assert.equal(familyEquivalence(sheets, { graphType: "estimation", parentId: "d", frozen: true }, resultOf), null);
  assert.equal(familyEquivalence(sheets, { graphType: "scatter", parentId: "d" }, resultOf), null);
});
