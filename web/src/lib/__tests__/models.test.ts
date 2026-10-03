// Model library, user-defined equation payloads and curve-fit routing.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyModelList, CLASSIC_SHIFT_ID, fitRoute, MODEL_FAMILIES, MODELS_META, modelMeta,
  searchModels, shareableParams,
} from "../modelLibrary.ts";
import {
  constraintsPayload, guessParameters, materialize, normalizeEquation, requiredConstants,
  rulesPayload, sharedParameters, suggestRule, userEquationPayload, type UserEquationDef,
} from "../userEquation.ts";
import {
  builtinConstraints, datasetConstantValues, globalModelToResult, numberInTitle, routeFor,
} from "../../sheets/xy/fitOptions.ts";
import { DEFAULT_XY_OPTIONS, type OptionsState } from "../../types.ts";

const LIST = {
  families: ["Dose-response - Inhibition", "Dose-response - Special, X is log(concentration)"],
  models: [
    { id: "log_inhibitor_vs_response_4pl", label: "log(inhibitor) vs. response -- Variable slope (four parameters)",
      family: "Dose-response - Inhibition", equation: "Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))",
      parameters: ["Top", "Bottom", "LogIC50", "HillSlope"], has_log_x: true, x_label: "log[Inhibitor]",
      derived: ["IC50", "Span"], required_constants: [], dataset_constants: [], shared: [],
      param_scope: {}, global_only: false, fixed_by_default: {},
      constrainable: ["Top", "Bottom", "LogIC50", "HillSlope"] },
    { id: "asymmetric_5pl_log", label: "Asymmetrical (five parameter), X is log(concentration)",
      family: "Dose-response - Special, X is log(concentration)", equation: "…",
      parameters: ["Bottom", "Top", "LogEC50", "HillSlope", "S"], has_log_x: true, x_label: "log[Agonist]",
      derived: ["EC50", "Span"], required_constants: [], dataset_constants: [], shared: [],
      param_scope: {}, global_only: false, fixed_by_default: {},
      constrainable: ["Bottom", "Top", "LogEC50", "HillSlope", "S"] },
    { id: "gaddum_schild_log", label: "Gaddum/Schild EC50 shift, X is log(concentration)",
      family: "Dose-response - Special, X is log(concentration)", equation: "…",
      parameters: ["Bottom", "Top", "LogEC50", "HillSlope", "pA2", "SchildSlope", "B"],
      has_log_x: true, x_label: "log[Agonist]", derived: ["EC50"], required_constants: [],
      dataset_constants: ["B"], shared: ["Bottom", "Top", "LogEC50", "HillSlope", "pA2", "SchildSlope"],
      param_scope: {}, global_only: true, fixed_by_default: {},
      constrainable: ["Bottom", "Top", "LogEC50", "HillSlope", "pA2", "SchildSlope"] },
    { id: "ec50_shift", label: "EC50 shift, X is concentration", family: "Dose-response - Special, X is log(concentration)",
      equation: "…", parameters: ["Bottom", "Top", "HillSlope", "EC50Control", "EC50Ratio"],
      has_log_x: false, x_label: "[Agonist]", global_only: true, param_scope: { EC50Ratio: "rest" },
      shared: ["Bottom", "Top", "HillSlope", "EC50Control"] },
  ],
};

const opts = (patch: Partial<OptionsState> = {}): OptionsState => ({ ...DEFAULT_XY_OPTIONS, ...patch });

test("the fallback holds the original models before the engine boots", () => {
  assert.equal(modelMeta("log_inhibitor_vs_response_4pl").needsLogX, true);
  assert.equal(MODELS_META[CLASSIC_SHIFT_ID].special, "gaddum_schild_classic");
  assert.ok(MODELS_META.one_site_fit_ki.constants?.includes("HotNM"));
});

test("list_models fills the registry and keeps the classic EC50-shift id", () => {
  // 4 listed + the fallback entries the list lacks (kept for saved projects)
  assert.equal(applyModelList(LIST), 20);
  assert.deepEqual(MODEL_FAMILIES.slice(0, 2), LIST.families);
  assert.equal(MODELS_META.asymmetric_5pl_log.label, LIST.models[1].label);
  // the library's own "ec50_shift" is listed under an alias
  assert.equal(MODELS_META.ec50_shift_conc.engineId, "ec50_shift");
  assert.equal(MODELS_META.ec50_shift.special, "gaddum_schild_classic");
  assert.equal(MODELS_META.log_inhibitor_vs_response_4pl.legacy, true);
  assert.equal(applyModelList({ models: [] }), 0, "an empty list keeps the registry");
});

test("search matches every word against name, family and parameters", () => {
  const hit = searchModels("asymmetric five");
  assert.deepEqual(hit.flatMap((g) => g.models.map((m) => m.id)), ["asymmetric_5pl_log"]);
  assert.ok(searchModels("pA2").flatMap((g) => g.models).some((m) => m.id === "gaddum_schild_log"));
  assert.equal(searchModels("nothing like this").length, 0);
});

test("routing: legacy sharing keeps global_fit; library models use global_model_fit", () => {
  const four = modelMeta("log_inhibitor_vs_response_4pl");
  assert.equal(fitRoute(four, []), "dose_response");
  assert.equal(fitRoute(four, ["HillSlope"]), "global_fit");
  assert.equal(fitRoute(modelMeta("asymmetric_5pl_log"), ["S"]), "global_model_fit");
  assert.equal(fitRoute(modelMeta("gaddum_schild_log"), []), "global_model_fit");
  assert.equal(fitRoute(modelMeta("ec50_shift"), []), "classic_shift");
  // scoped parameters and data-set constants cannot be shared
  assert.ok(!shareableParams(modelMeta("ec50_shift_conc")).includes("EC50Ratio"));
  assert.equal(routeFor(opts()), "dose_response");
});

test("default 4PL options send no constraints (the reference fit is unchanged)", () => {
  assert.deepEqual(builtinConstraints(modelMeta("log_inhibitor_vs_response_4pl"), opts()), {});
  const o = opts({ top: { enabled: true, value: "100" }, paramConstraints: { LogIC50: { enabled: true, value: "-7" } } });
  assert.deepEqual(builtinConstraints(modelMeta("log_inhibitor_vs_response_4pl"), o),
    { Top: 100, LogIC50: -7 });
});

test("data-set constants come from typed values, else the data set titles", () => {
  assert.equal(numberInTitle("10 nM"), 10);
  assert.equal(numberInTitle("1e-7"), 1e-7);
  const ok = datasetConstantValues(["B"], opts({ datasetConstants: { B: ["", "2"] } }), ["0", "Drug"]);
  assert.deepEqual(ok.values, { B: [0, 2] });
  const bad = datasetConstantValues(["B"], opts(), ["Control", "1e-7"]);
  assert.match(bad.error ?? "", /Enter B for data set "Control"/);
});

test("global_model_fit results read like per-data-set fits", () => {
  const r = globalModelToResult({
    model: "log_agonist_vs_response_4pl", label: "4PL", equation: "Y=…LogEC50…",
    shared: ["HillSlope"], goodness: { df: 21, sy_x: 0.6 },
    datasets: [{ name: "A", params: { LogXmid: { value: -7 }, HillSlope: { value: 1, shared: true } },
      param_order: ["LogXmid", "HillSlope"], n_points: 9, r_squared: 0.99, ss_res: 3,
      curve: { x: [0], y: [0] }, points: { x: [0], bars: [] } }],
  });
  const fit = r.datasets[0].fit!;
  assert.deepEqual(fit.param_order, ["LogEC50", "HillSlope"]);
  assert.equal(fit.goodness.df, 21);
  assert.match(fit.label ?? "", /shared: HillSlope/);
});

const fourPL = (): UserEquationDef => ({
  id: "", name: "My 4PL", xIsLog: true,
  text: "Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))",
  rules: {}, constraints: {}, transforms: [{ name: "IC50", expr: "10^LogIC50", ci: "asymmetrical" }],
});

test("parameters are read from the equation; rules are suggested by name", () => {
  assert.deepEqual(guessParameters(fourPL().text), ["Bottom", "Top", "LogIC50", "HillSlope"]);
  assert.deepEqual(guessParameters("; comment\nSpan = Top - Bottom\nY = Bottom + Span*exp(-K*X)"),
    ["Top", "Bottom", "K"]);
  const def = materialize(fourPL(), guessParameters(fourPL().text));
  assert.deepEqual(rulesPayload(def), {
    Bottom: "1*YMIN", Top: "1*YMAX", LogIC50: "1*XATYMID", HillSlope: "1*SIGN" });
  assert.equal(suggestRule("Foo").kind, "value");
});

test("default constraints become the engine's constraint specs", () => {
  const def: UserEquationDef = { ...fourPL(), constraints: {
    Bottom: { kind: "constant", value: "0", min: "", max: "" },
    Top: { kind: "constant", value: "", min: "", max: "" },
    LogIC50: { kind: "between", value: "", min: "-9", max: "-5" },
    HillSlope: { kind: "shared", value: "", min: "", max: "" },
  } };
  assert.deepEqual(constraintsPayload(def), {
    Bottom: 0, Top: "constant", LogIC50: { type: "range", min: -9, max: -5 }, HillSlope: "shared" });
  assert.deepEqual(requiredConstants(def), ["Top"]);
  assert.deepEqual(sharedParameters(def), ["HillSlope"]);
  const p = userEquationPayload(def);
  assert.equal(p.name, "My 4PL");
  assert.equal(p.x_is_log, true);
  assert.deepEqual(p.transforms, [{ name: "IC50", expr: "10^LogIC50", ci: "asymmetrical" }]);
  assert.equal(routeFor(opts({ model: "user", userEquation: def })), "global_model_fit");
});

test("imported equations are repaired or rejected", () => {
  assert.equal(normalizeEquation({ name: "x" }), null);
  const e = normalizeEquation({ equation: "Y = A*X", rules: { A: "2*YMAX", B: 3 } });
  assert.deepEqual(e?.rules.A, { kind: "rule", value: "2", op: "*", of: "YMAX" });
  assert.deepEqual(e?.rules.B, { kind: "value", value: "3", op: "*", of: "YMAX" });
});
