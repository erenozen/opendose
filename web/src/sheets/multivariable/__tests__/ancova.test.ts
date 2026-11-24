// P-82 baseline-adjusted comparison (ANCOVA): defaults, the engine
// payload, the equal-slopes chip and the answer headline.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTable } from "../../../project/table.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import {
  ANALYSIS_MV_ANCOVA, ROW_TITLES, ancovaPayload, defaultAncova, equalSlopesChip, groupLevels, runAncova,
} from "../ancova.ts";

// engine/tests/reference/ancova.json (statsmodels): two groups of 10
const REF = JSON.parse(readFileSync(new URL("../../../../../engine/tests/reference/ancova.json", import.meta.url),
  "utf8")).two_groups;

function table(names = ["Group", "Baseline", "Follow-up"], cat = [true, false, false]) {
  const d = REF.data;
  const cols = [d.group, d.pre.map(String), d.post.map(String)];
  return normalizeTable({
    type: "multivariable",
    x: d.group.map(() => ""),
    datasets: names.map((name, c) => ({
      name, varType: cat[c] ? "categorical" : "continuous", rows: cols[c].map((v: string) => [v]),
    })),
  }, "multivariable");
}

// The result the engine returns for REF (values from the reference).
const result = {
  analysis: "ancova", outcome: "Follow-up", group: "Group", baseline: "Baseline",
  reference_level: "Control", levels: ["Control", "Treated"], ci_level: 0.95,
  adjusted_means: REF.adjusted_means.map((m: { level: string }) => ({ ...m, n: 10 })),
  differences: REF.differences.map((d: object) => ({ ...d, df: 17 })),
  equal_slopes: REF.equal_slopes,
};

test("defaults: the text column is the group, baseline and follow-up found by name", () => {
  const o = defaultAncova(table(["Arm", "Week 12", "Day 0"]));
  assert.equal(o.group, "Arm");
  assert.equal(o.baseline, "Day 0");
  assert.equal(o.outcome, "Week 12");
  const plain = defaultAncova(table(["Group", "A", "B"]));
  assert.deepEqual([plain.group, plain.baseline, plain.outcome], ["Group", "A", "B"]);
  // a numeric 1/2 group column named like a group
  const coded = defaultAncova(normalizeTable({ type: "multivariable", x: ["", "", ""], datasets: [
    { name: "Group", varType: "continuous", rows: [["1"], ["2"], ["1"]] },
    { name: "Pre", varType: "continuous", rows: [["5"], ["6"], ["7"]] },
    { name: "Post", varType: "continuous", rows: [["5"], ["4"], ["8"]] },
  ] }, "multivariable"));
  assert.deepEqual([coded.group, coded.baseline, coded.outcome], ["Group", "Pre", "Post"]);
});

test("payload: three variables, the group as labels, the reference level checked", () => {
  const t = table();
  const o = { ...defaultAncova(t), referenceLevel: "Treated" };
  const b = ancovaPayload(t, o);
  assert.ok(b.payload);
  const p = b.payload as { analysis: string; data: { variables: { name: string; kind: string; values: unknown[] }[] };
    options: Record<string, unknown> };
  assert.equal(p.analysis, "ancova");
  assert.deepEqual(p.data.variables.map((v) => [v.name, v.kind]),
    [["Group", "categorical"], ["Baseline", "continuous"], ["Follow-up", "continuous"]]);
  assert.equal(p.data.variables[1].values[0], 52);
  assert.deepEqual(p.options, { outcome: "Follow-up", group: "Group", baseline: "Baseline",
    reference_level: "Treated", ci_level: 0.95 });
  assert.equal((ancovaPayload(t, { ...o, referenceLevel: "Sham" }).payload as typeof p).options.reference_level, null);
  assert.deepEqual(groupLevels(t, "Group"), ["Control", "Treated"]);
});

test("a first column of text, imported as row titles, is the group", () => {
  const d = REF.data;
  const t = normalizeTable({
    type: "multivariable", x: d.group.map(() => ""), rowTitles: d.group,
    datasets: [{ name: "Baseline", varType: "continuous", rows: d.pre.map((v: number) => [String(v)]) },
      { name: "Follow-up", varType: "continuous", rows: d.post.map((v: number) => [String(v)]) }],
  }, "multivariable");
  const o = defaultAncova(t);
  assert.equal(o.group, ROW_TITLES);
  assert.deepEqual(groupLevels(t, ROW_TITLES), ["Control", "Treated"]);
  const p = ancovaPayload(t, o).payload as { data: { variables: { name: string; values: unknown[] }[] };
    options: Record<string, unknown> };
  assert.equal(p.data.variables[0].name, "Group");
  assert.equal(p.data.variables[0].values[19], "Treated");
  assert.equal(p.options.group, "Group");
});

test("payload errors say what to choose", () => {
  const t = table();
  const o = defaultAncova(t);
  assert.match(ancovaPayload(t, { ...o, outcome: "" }).error!, /Choose the follow-up/);
  assert.match(ancovaPayload(t, { ...o, baseline: "Nope" }).error!, /Choose the baseline/);
  assert.match(ancovaPayload(t, { ...o, group: "" }).error!, /Choose the group/);
  assert.match(ancovaPayload(t, { ...o, baseline: "Follow-up" }).error!, /three different variables/);
  const dup = table(["Group", "X", "X"]);
  assert.match(ancovaPayload(dup, defaultAncova(dup)).error!, /unique name/);
  assert.match(runAncova({ analyze: () => assert.fail("no engine call") }, t, { ...o, group: "" }).error!,
    /Choose the group/);
});

test("the equal-slopes chip: ok, warn when the slopes differ, info when not computed", () => {
  const ok = equalSlopesChip(ANALYSIS_MV_ANCOVA, result)!;
  assert.equal(ok.state, "ok");
  assert.equal(ok.label, "Equal slopes (P = 0.5634)");
  assert.match(ok.detail, /F\(1, 16\) = 0\.3481, P = 0\.5634; slopes Control 0\.8417, Treated 0\.7887/);
  assert.ok(ok.sources?.some((s) => s.url === "https://doi.org/10.1136/bmj.323.7321.1123"));
  const warn = equalSlopesChip(ANALYSIS_MV_ANCOVA, { ...result, equal_slopes: { ...REF.equal_slopes, p: 0.012 } })!;
  assert.equal(warn.state, "warn");
  assert.equal(warn.label, "Slopes differ between groups (P = 0.012)");
  assert.match(warn.detail, /depends on the baseline value/);
  const info = equalSlopesChip(ANALYSIS_MV_ANCOVA, { ...result, equal_slopes: { error: "too few rows" } })!;
  assert.equal(info.state, "info");
  assert.equal(equalSlopesChip("mv_regression", result), null);
  assert.equal(equalSlopesChip(ANALYSIS_MV_ANCOVA, { error: "x" }), null);
  assert.equal(equalSlopesChip(ANALYSIS_MV_ANCOVA, null), null);
});

test("the answer headline is the adjusted difference with its 95% CI", () => {
  const k = keyFacts(result);
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  assert.equal(k.items.length, 1);
  assert.equal(k.items[0].title, "Treated vs. Control, adjusted for Baseline");
  const f = k.items[0].figure!;
  assert.equal(f.name, "Adjusted difference");
  assert.equal(f.value, "-5.663");
  assert.equal(f.ci, "95% CI -6.732 to -4.595");
  assert.deepEqual(f.facts, ["P < 0.0001", "n = 10 and 10"]);
});
