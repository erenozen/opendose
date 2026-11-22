// The results headline's key facts (keyFacts.ts): each figure is the
// string the results table prints, and ambiguous figures are demoted.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyFacts, paramCI, paramLabel } from "../keyFacts.ts";
import { formatSig } from "../../../types.ts";

const fit = (over: Record<string, unknown> = {}) => ({
  model: "log_inhibitor_variable", equation: "", status: "converged", dependency: {},
  param_order: ["Top", "Bottom", "LogIC50", "HillSlope", "IC50", "Span"],
  params: {
    Top: { value: 99.86, se: 0.7313, ci95: [98.34, 101.4], constrained: false },
    Bottom: { value: 0.9801, se: 0.7445, ci95: [-0.5601, 2.52], constrained: false },
    LogIC50: { value: -6.983, se: 0.01471, ci95: [-7.013, -6.953], constrained: false },
    HillSlope: { value: -1.103, se: 0.03869, ci95: [-1.183, -1.023], constrained: false },
    IC50: { value: 1.04e-7, se: null, ci95: [9.694e-8, 1.115e-7], constrained: false, derived: true },
    Span: { value: 98.88, se: null, ci95: [96.44, 101.3], constrained: false, derived: true },
  },
  goodness: { df: 23, r_squared: 0.9986, ss_res: 59.58, sy_x: 1.61, n_points: 27 },
  ...over,
});

test("a curve fit's headline is its IC50, as the table prints it", () => {
  const k = keyFacts({ analysis: "dose_response", datasets: [{ name: "Drug A", fit: fit() }] }, { xUnit: "M" });
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  const f = k.items[0].figure!;
  assert.equal(k.items[0].title, "Drug A");
  assert.equal(f.name, "IC50 (M)");
  assert.equal(f.value, formatSig(1.04e-7));
  assert.equal(f.ci, `95% CI ${paramCI(fit().params.IC50 as never)}`);
  assert.deepEqual(f.facts, [`R² ${formatSig(0.9986)}`, "27 points"]);
  assert.equal(f.demoted, undefined);
});

test("an ambiguous fit's figure is demoted, the reason first", () => {
  const k = keyFacts({ analysis: "dose_response",
    datasets: [{ name: "B", fit: fit({ status: "ambiguous" }) }] });
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  assert.match(k.items[0].figure!.demoted ?? "", /^Ambiguous fit: .*should not be reported\.$/);
});

test("a data set that failed keeps the table's message", () => {
  const k = keyFacts({ analysis: "dose_response",
    datasets: [{ name: "C", error: "too few points" }] });
  assert.deepEqual(k, { kind: "figures", items: [{ title: "C", error: "Could not fit: too few points" }] });
});

test("a failed analysis is an error headline", () => {
  assert.deepEqual(keyFacts({ error: "the engine stopped" }),
    { kind: "error", message: "Analysis failed: the engine stopped" });
});

test("a t test leads with the difference and its CI, then P", () => {
  const k = keyFacts({ analysis: "ttest", names: ["Treated A", "Control"], difference: 5.2,
    ci_difference: [3.129, 7.271], p_two_tailed: 0.0002 });
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  const f = k.items[0].figure!;
  assert.equal(f.name, "Difference between means (Treated A − Control)");
  assert.equal(f.value, "5.2");
  assert.equal(f.ci, "95% CI 3.129 to 7.271");
  assert.match(f.facts[0], /^P\b.*\(two-tailed\)$/);
});

test("a one-way ANOVA leads with P, then F", () => {
  const k = keyFacts({ analysis: "anova", kind: "parametric",
    table: { p: 0.0123, F: 6.5, df_between: 2, df_within: 12, r_squared: 0.52 } });
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  assert.equal(k.items[0].figure!.name, "P value");
  assert.deepEqual(k.items[0].figure!.facts, ["F(2, 12) = 6.5", "R² 0.52"]);
});

test("results no mapper knows show their table first", () => {
  assert.equal(keyFacts({ analysis: "two_way_anova" }), null);
  assert.equal(keyFacts(null), null);
});

test("parameter labels and CIs match the fit table", () => {
  assert.equal(paramLabel("IC50", { value: 1, se: null, ci95: null, constrained: false }, "µM"), "IC50 (µM)");
  assert.equal(paramLabel("Top", { value: 1, se: null, ci95: null, constrained: false, shared: true }, "M"),
    "Top (shared)");
  assert.equal(paramCI({ value: 1, se: 1, ci95: [null as never, 2], constrained: false }), "(very wide) to 2");
});
