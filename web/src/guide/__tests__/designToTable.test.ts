// Describe the experiment -> table type and layout. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asksFactors, asksRepeats, DESIGN_EXAMPLES, recommendTable, type DesignAnswers,
} from "../designToTable.ts";

const rec = (a: Partial<DesignAnswers>) =>
  recommendTable({ value: "measurement", factors: "one", repeats: "independent", ...a });

test("the same mice at 4 times: a grouped table with subjects as subcolumns", () => {
  const ex = DESIGN_EXAMPLES.find((e) => e.label.startsWith("I measured the same mice"))!;
  const r = recommendTable(ex.answers);
  assert.equal(r.type, "grouped");
  assert.equal(r.title, "Grouped table, subjects as subcolumns");
  assert.deepEqual(r.init, { datasets: 2, subcolumns: 4, rows: 4 });
  assert.match(r.layout, /same subject in the same subcolumn on every row/);
  assert.match(r.analyses, /mixed-effects model when values are missing/);
});

test("one factor: independent -> column, paired -> one row per subject, nested -> nested", () => {
  assert.equal(rec({}).type, "column");
  const paired = rec({ repeats: "repeated" });
  assert.equal(paired.type, "column");
  assert.match(paired.layout, /each row is one subject/);
  assert.match(paired.analyses, /Paired/);
  assert.equal(rec({ repeats: "nested" }).type, "nested");
  assert.equal(rec({ factors: "two" }).type, "grouped");
  assert.equal(rec({ factors: "x" }).type, "xy");
  assert.match(rec({ factors: "x", repeats: "repeated" }).analyses, /not a separate test at each X/);
});

test("other kinds of value pick their own table", () => {
  assert.equal(recommendTable({ value: "count", factors: "one", repeats: "independent" }).type, "contingency");
  assert.match(recommendTable({ value: "count", factors: "one", repeats: "repeated" }).analyses, /McNemar/);
  assert.equal(recommendTable({ value: "time-to-event", factors: "one", repeats: "independent" }).type, "survival");
  assert.equal(recommendTable({ value: "variables", factors: "one", repeats: "independent" }).type, "multivariable");
  assert.equal(recommendTable({ value: "fraction", factors: "one", repeats: "independent" }).type, "partsofwhole");
  assert.ok(asksFactors("measurement") && !asksFactors("count"));
  assert.ok(asksRepeats("count") && !asksRepeats("time-to-event"));
});

test("every recommendation cites a source and every example has a table", () => {
  for (const value of ["measurement", "count", "time-to-event", "variables", "fraction"] as const) {
    for (const factors of ["one", "two", "x"] as const) {
      for (const repeats of ["independent", "repeated", "nested"] as const) {
        const r = recommendTable({ value, factors, repeats });
        assert.ok(r.sources.length > 0 && r.sources.every((s) => /^https:\/\//.test(s.url)));
        assert.ok(r.layout.length > 20 && r.analyses.length > 10);
      }
    }
  }
  for (const e of DESIGN_EXAMPLES) assert.ok(recommendTable(e.answers).type);
});
