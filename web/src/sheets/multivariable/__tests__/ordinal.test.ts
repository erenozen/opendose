// P-88 ordinal (proportional-odds) regression: defaults, the engine
// payload (text levels need their order), the proportional-odds chip and
// the answer headline. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTable } from "../../../project/table.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import { meaningOf } from "../../../report/meaning.ts";
import { statsRows } from "../../../report/statsTable.ts";
import { SRC } from "../../../guide/sources.ts";
import {
  ANALYSIS_MV_ORDINAL, defaultOrdinal, normalizeOrdinal, ordinalPayload, parseOrder, proportionalOddsChip,
  runOrdinal, type OrdinalResult,
} from "../ordinal.ts";

// engine/tests/reference/ordinal_regression.json (statsmodels OrderedModel)
const REF = JSON.parse(readFileSync(new URL("../../../../../engine/tests/reference/ordinal_regression.json",
  import.meta.url), "utf8"));
const H = REF.histology;

function histology(names = ["Experiment", "Group", "Score"], score: string[] = H.data.score.map(String)) {
  const cols = [H.data.experiment, H.data.group, score];
  return normalizeTable({
    type: "multivariable", x: score.map(() => ""),
    datasets: names.map((name, c) => ({ name, varType: c < 2 || !/^\d+$/.test(score[0]) && c === 2
      ? "categorical" : "continuous", rows: cols[c].map((v: string) => [v]) })),
  }, "multivariable");
}

const result = {
  analysis: "ordinal_regression", outcome: "Score", ci_level: 0.95, predictors: ["Group", "Experiment"],
  levels: ["0", "1", "2", "3", "4"], n_rows_analyzed: 36,
  reference_levels: { Group: "Vehicle", Experiment: "Exp1" },
  coefficients: H.beta.map((b: number, j: number) => ({
    name: H.columns[j], estimate: b, se: H.beta_se[j], z: Math.abs(b / H.beta_se[j]), p: 1e-5,
    ci: j === 0 ? H.profile_ci[0] : [b - 1, b + 1], odds_ratio: Math.exp(b),
    odds_ratio_ci: (j === 0 ? H.profile_ci[0] : [b - 1, b + 1]).map(Math.exp) })),
  proportional_odds: { method: "lr", any_violation: false,
    tests: [{ term: "Group", df: 3, LR: H.nominal_group.LR, p: H.nominal_group.p, log_likelihood: -37.9 },
      { term: "Experiment", df: 6, LR: 4.2, p: 0.65, log_likelihood: -36 }] },
};

test("defaults: the score column by name, the block last among the predictors", () => {
  const o = defaultOrdinal(histology());
  assert.equal(o.outcome, "Score");
  assert.deepEqual(o.predictors, ["Group", "Experiment"]);
  assert.equal(o.ciMethod, "profile");
  assert.equal(o.outcomeOrder, "");
  // unnamed: the whole-number column with 3 to 11 values
  const plain = defaultOrdinal(histology(["Day", "Arm", "Grade X"]));
  assert.equal(plain.outcome, "Grade X");
  assert.deepEqual(plain.predictors, ["Arm", "Day"]);
  // stored options merge over the defaults
  assert.equal(normalizeOrdinal({ ciMethod: "wald", bogus: 1 }, histology()).ciMethod, "wald");
});

test("payload: numeric scores sort themselves; text levels need their order", () => {
  const p = ordinalPayload(histology(), defaultOrdinal(histology())) as { options: Record<string, unknown> };
  assert.deepEqual(p.options.predictors, ["Group", "Experiment"]);
  assert.equal(p.options.ci_method, "profile");
  assert.equal(p.options.outcome_order, undefined);
  const words = ["none", "mild", "moderate", "marked", "severe"];
  const t = histology(undefined, H.data.score.map((s: number) => words[s]));
  const o = { ...defaultOrdinal(t), outcome: "Score", predictors: ["Group"] };
  const e = ordinalPayload(t, o) as { error: string };
  assert.match(e.error, /^Give the order of the levels of Score, lowest first \(for example /);
  const ok = ordinalPayload(t, { ...o, outcomeOrder: "none, mild,moderate ,marked, severe" }) as
    { options: Record<string, unknown> };
  assert.deepEqual(ok.options.outcome_order, words);
  assert.deepEqual(parseOrder("a; b\nc,,"), ["a", "b", "c"]);
});

test("run: duplicate names and a missing outcome never reach the engine", () => {
  let calls = 0;
  const engine = { analyze: (p: unknown) => { calls++; return { ...result, payload: p }; } };
  const t = histology(["Score", "Group", "Score"]);
  assert.match(runOrdinal(engine, t, defaultOrdinal(t)).error ?? "", /called “Score”/);
  const t2 = histology();
  assert.match(runOrdinal(engine, t2, { ...defaultOrdinal(t2), outcome: "" }).error ?? "", /Choose the outcome/);
  assert.equal(calls, 0);
  const r = runOrdinal(engine, t2, defaultOrdinal(t2)) as OrdinalResult & { payload: { analysis: string } };
  assert.equal(r.payload.analysis, "ordinal_regression");
  assert.deepEqual(r.predictors, ["Group", "Experiment"]);
});

test("proportional-odds chip: ok, warn with the terms, info when untested, none for two levels", () => {
  const ok = proportionalOddsChip(ANALYSIS_MV_ORDINAL, result)!;
  assert.equal(ok.state, "ok");
  assert.equal(ok.label, "Proportional odds not rejected");
  assert.match(ok.detail, /Group: χ² = 0\.4389 on 3 df, P = 0\.93/);
  const bad = { ...result, proportional_odds: { ...result.proportional_odds, any_violation: true,
    tests: [{ term: "Group", df: 3, LR: 19.2, p: 0.0002 }] } };
  const warn = proportionalOddsChip(ANALYSIS_MV_ORDINAL, bad)!;
  assert.equal(warn.state, "warn");
  assert.equal(warn.label, "Proportional odds rejected for Group");
  assert.ok(warn.sources?.some((s) => s.url.includes("2347760")));
  const untested = { ...result, proportional_odds: { ...result.proportional_odds,
    tests: [{ term: "Group", df: 3, LR: null, p: null, note: "could not be fitted" }] } };
  assert.equal(proportionalOddsChip(ANALYSIS_MV_ORDINAL, untested)!.state, "info");
  assert.equal(proportionalOddsChip(ANALYSIS_MV_ORDINAL, { ...result, proportional_odds: { tests: [] } }), null);
  assert.equal(proportionalOddsChip("mv_logistic", result), null);
  assert.equal(proportionalOddsChip(ANALYSIS_MV_ORDINAL, { error: "x" }), null);
});

test("headline: the odds ratio of a higher score for the first predictor (no intercept row)", () => {
  const k = keyFacts(result);
  assert.ok(k && k.kind === "figures");
  assert.equal(k.items.length, 1);
  assert.equal(k.items[0].title, "Group: Drug vs. Vehicle");
  const fig = k.items[0].figure!;
  assert.equal(fig.name, "Odds ratio of a higher score");
  assert.equal(fig.value, "0.01825");
  assert.equal(fig.ci, "95% CI 0.002086 to 0.1006");
  assert.deepEqual(fig.facts.slice(1), ["ordinal (proportional odds) regression, 36 rows"]);
});

test("what this means: the odds ratio of a higher score, the proportional-odds caveat when it fails", () => {
  const m = meaningOf({ result: { ...result, coefficients: result.coefficients.map((c: { p: number }, i: number) =>
    ({ ...c, p: i === 0 ? 0.00003 : 0.2 })) }, analysisId: ANALYSIS_MV_ORDINAL, style: "graphpad" })!;
  assert.equal(m.sentence, "Group Drug (vs. Vehicle) multiplies the odds of a higher Score by 0.01825 (odds ratio, "
    + "95% CI 0.002086 to 0.1006), holding Experiment constant; a ratio this far from 1 would be unusual "
    + "(P < 0.0001) if Group had no association with Score.");
  assert.ok(m.sources.some((s) => s.url === SRC.mccullagh1980.url));
  assert.match(m.test ?? "", /^Ordinal \(proportional-odds\) regression/);
  const bad = { ...result, proportional_odds: { tests: [{ term: "Group", df: 3, LR: 19, p: 0.0003 }] } };
  const m2 = meaningOf({ result: bad, analysisId: ANALYSIS_MV_ORDINAL, style: "graphpad" })!;
  assert.match(m2.sentence, /the proportional-odds check rejects one ratio for every cut point/);
  assert.ok(m2.sources.some((s) => s.url === SRC.petersonHarrell1990.url));
});

test("statistics table: one row per coefficient with its odds ratio", () => {
  const rows = statsRows({ sheet: "Ordinal", data: "Scores", analysisId: ANALYSIS_MV_ORDINAL,
    analysisLabel: "Ordinal regression", panels: [], result });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].test, "ordinal logistic regression (proportional odds)");
  assert.equal(rows[0].estimate, "Odds ratio");
  assert.equal(rows[0].estimateValue, "0.01825");
  assert.equal(rows[0].statistic, "z");
});
