// P-44: reliability ICC from a column table (columns = raters, rows =
// targets): the payload, the options, the form names and the headline.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  chosenForm, DEFAULT_ICC_FORM, formName, iccPayload, normalizeIccOptions, type IccResult,
} from "../icc.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import { formatSig } from "../../../types.ts";
import { pLabel } from "../../../report/pformat.ts";

// Shrout & Fleiss (1979): 6 targets x 4 judges
const SF = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]];
const sfTable = () => normalizeTable({ type: "column", datasets: [0, 1, 2, 3].map((j) => ({
  name: `Judge ${j + 1}`, rows: SF.map((r) => [String(r[j])]) })) });

test("one data set per rater, the rows as targets, blanks kept as null", () => {
  const t = normalizeTable({ type: "column", datasets: [
    { name: "A", rows: [["1"], [""]] }, { name: "B", rows: [["2"], ["3"]] }] });
  const p = iccPayload(t, { form: "ICC2", ciLevel: "90" }) as
    unknown as { analysis: string; data: { datasets: { name: string; ys: unknown[][] }[] }; options: unknown };
  assert.equal(p.analysis, "icc");
  assert.deepEqual(p.data.datasets.map((d) => d.ys.map((r) => r[0])), [[1, null], [2, 3]]);
  assert.deepEqual(p.options, { ci_level: 0.9 });
  assert.equal((iccPayload(sfTable(), { form: "ICC2", ciLevel: "95" }) as { analysis: string }).analysis, "icc");
});

test("one column is not enough", () => {
  const t = normalizeTable({ type: "column", datasets: [{ name: "A", rows: [["1"]] }] });
  assert.match((iccPayload(t, { form: "ICC2", ciLevel: "95" }) as { error: string }).error, /two columns/);
});

test("the default form is two-way random, absolute agreement, single rater", () => {
  assert.equal(DEFAULT_ICC_FORM, "ICC2");
  assert.deepEqual(normalizeIccOptions({ form: "ICC9" }), { form: "ICC2", ciLevel: "95" });
  assert.deepEqual(normalizeIccOptions({ form: "ICC3k", ciLevel: "90" }), { form: "ICC3k", ciLevel: "90" });
});

test("form names carry the number of raters", () => {
  assert.equal(formName("ICC2", 4), "ICC(2,1)");
  assert.equal(formName("ICC2k", 4), "ICC(2,4)");
});

// engine/tests/reference/icc_reliability.json (McGraw & Wong CIs)
const result = {
  analysis: "icc", n_targets: 6, k_raters: 4, ci_level: 0.95, options: { form: "ICC2", ciLevel: "95" },
  forms: [{ form: "ICC2", value: 0.28976377952755916, ci: [0.018786513374712033, 0.761084369648953],
    model: "two_way_random", type: "absolute", unit: "single", F: 11.027247956403299, df1: 5, df2: 15,
    p: 0.000134566516484335 }],
} as unknown as IccResult;

test("the headline is the chosen form with its CI, F and P", () => {
  assert.equal(chosenForm(result)?.form, "ICC2");
  const k = keyFacts(result);
  assert.equal(k?.kind, "figures");
  if (k?.kind !== "figures") return;
  const f = k.items[0].figure!;
  assert.equal(k.items[0].title, "6 targets, 4 raters");
  assert.equal(f.name, "ICC(2,1)");
  assert.equal(f.value, formatSig(0.28976377952755916));
  assert.equal(f.ci, `95% CI ${formatSig(0.018786513374712033)} to ${formatSig(0.761084369648953)}`);
  assert.deepEqual(f.facts, [`F(5, 15) = ${formatSig(11.027247956403299)}`, pLabel(0.000134566516484335)]);
});
