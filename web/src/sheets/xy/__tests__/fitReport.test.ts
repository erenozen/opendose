// Initial values and the complete fit report (P-21): typed starts sent
// to the engine, the report's text and CSV rows, and projects saved
// before the option open with automatic starts and unchanged constraints.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { modelMeta } from "../../../lib/modelLibrary.ts";
import { sequentialIds } from "../../../project/ids.ts";
import { parseProjectFile, serializeProject } from "../../../project/persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../../project/prefs.ts";
import type { ResultsSheet } from "../../../project/types.ts";
import { DEFAULT_XY_OPTIONS, formatSig, type FitResult, type OptionsState } from "../../../types.ts";
import {
  builtinBounds, builtinConstraints, builtinStarts, constraintKind, constraintState, startParams,
  withConstraint,
} from "../fitOptions.ts";
import { constraintLines, fitReportRows, fitReportText, fitStarts, startsNote } from "../fitReport.ts";

const meta = modelMeta("log_inhibitor_vs_response_4pl");

// the example 4PL as the engine returns it (engine/tests/test_initial_values.py)
const fit = (over: Partial<FitResult> = {}): FitResult => ({
  model: "log_inhibitor_vs_response_4pl",
  label: "log(inhibitor) vs. response -- Variable slope (four parameters)",
  equation: "Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))",
  status: "converged", dependency: {}, weighting: "none", ci_method: "asymptotic",
  param_order: ["Top", "Bottom", "LogIC50", "HillSlope", "IC50", "Span"],
  params: {
    Top: { value: 99.856, se: 0.7313, ci95: [98.34, 101.4], constrained: false },
    Bottom: { value: 0.98013, se: 0.7445, ci95: [-0.5601, 2.52], constrained: false },
    LogIC50: { value: -6.983, se: 0.01471, ci95: [-7.013, -6.953], constrained: false },
    HillSlope: { value: -1.1035, se: 0.03869, ci95: [-1.183, -1.023], constrained: false },
    IC50: { value: 1.04e-7, se: null, ci95: [9.694e-8, 1.115e-7], constrained: false, derived: true },
    Span: { value: 98.876, se: null, ci95: [96.44, 101.3], constrained: false, derived: true },
  },
  goodness: { df: 23, r_squared: 0.9986, ss_res: 59.58, sy_x: 1.61, n_points: 27 },
  curve: { x: [], y: [] },
  initial_values: {
    Top: { value: 101.5, source: "rule" }, Bottom: { value: 0.5, source: "rule" },
    LogIC50: { value: -7, source: "rule" }, HillSlope: { value: -1, source: "rule" },
  },
  starts: { n: 10, seeded: "LogIC50", restarted: false },
  ...over,
});

test("typed starts go to the engine; blanks and held parameters do not", () => {
  const o: OptionsState = { ...DEFAULT_XY_OPTIONS, initialValues: { LogIC50: "-5", Top: " ", HillSlope: "x" } };
  assert.deepEqual(builtinStarts(meta, o), { LogIC50: -5 });
  const held = withConstraint({ ...o, initialValues: { Top: "90" } }, "Top", { enabled: true, value: "100" });
  assert.deepEqual(startParams(meta, held), ["Bottom", "LogIC50", "HillSlope"]);
  assert.deepEqual(builtinStarts(meta, held), {});
  // a range keeps its start: the parameter is still fitted
  const ranged = withConstraint({ ...o, initialValues: { Bottom: "2" } }, "Bottom",
    { enabled: true, value: "0", kind: "greater", lo: "0", reason: "signal cannot be negative" });
  assert.deepEqual(builtinStarts(meta, ranged), { Bottom: 2 });
});

test("the starts fold lists every free parameter with its source", () => {
  assert.deepEqual(fitStarts(fit()), [
    { name: "Top", value: 101.5, source: "rule" }, { name: "Bottom", value: 0.5, source: "rule" },
    { name: "LogIC50", value: -7, source: "rule" }, { name: "HillSlope", value: -1, source: "rule" },
  ]);
  assert.equal(startsNote(fit()),
    "The fit also tried 9 more starts with LogIC50 set to each X value and kept the best.");
  const typed = fit({ initial_values: { ...fit().initial_values!, LogIC50: { value: -5, source: "typed" } },
    starts: { n: 1, seeded: null, restarted: false } });
  assert.equal(startsNote(typed), "The fit ran from the starts listed, typed ones included, and no others.");
});

test("the copied fit report holds every part a reviewer asks for", () => {
  const o = withConstraint({ ...DEFAULT_XY_OPTIONS }, "Bottom",
    { enabled: true, value: "0", kind: "greater", lo: "0", reason: "signal cannot be negative" });
  const f = fit({ bounds: { Bottom: [0, null] }, params: { ...fit().params,
    Bottom: { value: 0, se: 1.454, ci95: [-3.008, 3.008], constrained: false, at_bound: "lower" } } });
  const text = fitReportText("Drug A", f, o);
  const lines = text.split("\n");
  assert.equal(lines[0], "Fit report: Drug A");
  for (const want of [
    "  Model: log(inhibitor) vs. response -- Variable slope (four parameters)",
    "  Equation: Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))",
    `  LogIC50 = ${formatSig(-7)} (from the model's rules)`,
    "  Bottom > 0, stated reason: signal cannot be negative",
    "  Weighting: No weighting",
    "  Confidence intervals: asymptotic (symmetrical), 95%",
    `  LogIC50 = ${formatSig(-6.983)}, SE ${formatSig(0.01471)}, 95% CI ${formatSig(-7.013)} to ${formatSig(-6.953)}`,
    "  Bottom = 0, SE 1.454, at its constraint: SE not reliable",
    `  IC50 = ${formatSig(1.04e-7)}, 95% CI ${formatSig(9.694e-8)} to ${formatSig(1.115e-7)}, derived`,
    "  Degrees of freedom: 23",
    `  Sy.x: ${formatSig(1.61)}`,
  ]) assert.ok(lines.includes(want), `missing: ${want}\n${text}`);
  for (const sec of ["Fit", "Initial values", "Constraints", "Method", "Parameters", "Goodness of fit"]) {
    assert.ok(lines.includes(sec), sec);
  }
});

test("the CSV rows have one header and seven columns throughout", () => {
  const rows = fitReportRows("Drug A", fit());
  assert.deepEqual(rows[0], ["Section", "Item", "Value", "Std. Error", "95% CI lower", "95% CI upper", "Note"]);
  assert.ok(rows.every((r) => r.length === 7));
  assert.deepEqual(rows.find((r) => r[1] === "Top" && r[0] === "Initial values"),
    ["Initial values", "Top", formatSig(101.5), "", "", "", "from the model's rules"]);
  assert.deepEqual(rows.find((r) => r[0] === "Constraints"), ["Constraints", "None", "", "", "", "", ""]);
});

test("constants come from the fit itself", () => {
  const f = fit({ params: { ...fit().params, Top: { value: 100, se: null, ci95: null, constrained: true } } });
  assert.deepEqual(constraintLines(f), ["Top = 100 (held constant)"]);
});

// committed before initial values and ranges existed (git log: d1fe1cb and earlier)
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "e2e-fixtures");
for (const file of ["potency-experiments.json", "stage/fit-graph.json"]) {
  test(`${file}: opens with automatic starts and its constraints as constants`, () => {
    const text = readFileSync(join(fixtures, file), "utf8");
    const p = parseProjectFile(text, { prefs: projectPrefs(DEFAULT_PREFS), ids: sequentialIds("t") });
    const fits = p.sheets.filter((s): s is ResultsSheet => s.kind === "results" && s.analysis === "nonlin");
    assert.ok(fits.length > 0);
    for (const s of fits) {
      const o = { ...DEFAULT_XY_OPTIONS, ...(s.options as Partial<OptionsState>) };
      assert.equal(o.initialValues, undefined);
      const m = modelMeta(o.model);
      assert.deepEqual(builtinStarts(m, o), {});
      assert.deepEqual(builtinBounds(m, o), {});
      for (const prm of m.constrainable) assert.equal(constraintKind(constraintState(o, prm)), "constant");
      const before = builtinConstraints(m, o);
      assert.deepEqual(builtinConstraints(m, { ...o }), before);
    }
    const again = parseProjectFile(serializeProject(p), { prefs: projectPrefs(DEFAULT_PREFS), ids: sequentialIds("u") });
    assert.deepEqual(again.sheets.map((s) => (s as ResultsSheet).options), p.sheets.map((s) => (s as ResultsSheet).options));
  });
}
