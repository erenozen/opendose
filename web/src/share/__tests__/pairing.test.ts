// Pairing values by subject ID (P-38): share/recipes/pairing.ts, the
// recipes' column pivot and "From long table…" (paired).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyTable, normalizeTable } from "../../project/table.ts";
import { pairBySubject, pairingReport, sharesSubjects, type PairRecord, type Pairing } from "../recipes/pairing.ts";
import { makeStaging, pivot } from "../recipes/staging.ts";
import { fillFromLong, guessRoles, parseLongText, type LongFill, type LongSource } from "../../sheets/common/longTable.ts";

// web/e2e-fixtures/import/paired_long.csv: M1 to M6, before and after, shuffled
const CSV = readFileSync(new URL("../../../e2e-fixtures/import/paired_long.csv", import.meta.url), "utf8");
// the same values aligned by hand, one row per mouse, in the order the
// mice first appear in the file (M4, M1, M6, M3, M2, M5), columns in the
// order the conditions first appear (after, before)
const HAND = normalizeTable({
  type: "column",
  x: ["", "", "", "", "", ""],
  rowTitles: ["M4", "M1", "M6", "M3", "M2", "M5"],
  datasets: [
    { name: "after", rows: [["12.6"], ["14.3"], ["15.0"], ["13.1"], ["11.9"], ["13.4"]] },
    { name: "before", rows: [["9.7"], ["12.1"], ["12.9"], ["13.8"], ["10.4"], ["11.2"]] },
  ],
}, "column");

const rec = (id: string, group: string, value: string, row = 0): PairRecord => ({ id, group, value, row });
const ok = (r: Pairing | { error: string }) => {
  assert.ok(!("error" in r), JSON.stringify(r));
  return r as Pairing;
};

test("acceptance: shuffled M1 to M6 pair M1 with M1, identical to the hand-aligned wide table", () => {
  const src = parseLongText(CSV) as LongSource;
  const roles = guessRoles(src, "paired");
  assert.deepEqual(roles, { subject: 0, value: 2, condition: 1 });
  const fill = fillFromLong("paired", src, roles, "", emptyTable("column")) as LongFill;
  assert.ok("table" in fill, JSON.stringify(fill));
  assert.deepEqual(fill.table.rowTitles, HAND.rowTitles);
  assert.deepEqual(fill.table.datasets.map((d) => [d.name, d.rows]), HAND.datasets.map((d) => [d.name, d.rows]));
  assert.equal(fill.summary, "6 subjects paired by mouse across “after”, “before”");
  assert.deepEqual(fill.notes, ["Paired (one row each, titled with the ID): M4, M1, M6, M3, M2, M5."]);
  // each row holds one mouse's own pair, whatever the record order
  const lines = CSV.trim().split("\n").slice(1).map((l) => l.split(","));
  fill.table.rowTitles.forEach((m, r) => {
    for (const [d, g] of [[0, "after"], [1, "before"]] as const) {
      assert.equal(fill.table.datasets[d].rows[r][0], lines.find((l) => l[0] === m && l[1] === g)![2]);
    }
  });
});

test("the order of the records does not matter (any permutation, same table)", () => {
  const src = parseLongText(CSV) as LongSource;
  const base = pairBySubject(src.rows.map((x) => rec(x[0], x[1], x[2])));
  const rev = ok(pairBySubject([...src.rows].reverse().map((x) => rec(x[0], x[1], x[2]))));
  const p = ok(base);
  const cellOf = (q: Pairing, id: string, g: string) => q.cells[q.subjects.indexOf(id)][q.groups.indexOf(g)];
  for (const id of p.subjects) for (const g of p.groups) assert.equal(cellOf(rev, id, g), cellOf(p, id, g));
});

test("a duplicate ID in one condition stops the pairing, naming the ID and the rows", () => {
  const src = parseLongText(`${CSV}M3,before,14.0\n`) as LongSource;
  const r = fillFromLong("paired", src, guessRoles(src, "paired"), "", emptyTable("column"));
  assert.deepEqual(r, { error: "Subject “M3” has 2 records for “before” (rows 5 and 14). "
    + "Pairing needs one value per subject and condition: remove the extra records, or average them first." });
  // made by aggregation: no row numbers to name
  const e = pairBySubject([rec("A", "x", "1"), rec("A", "x", "2"), rec("A", "y", "3")]);
  assert.match((e as { error: string }).error, /^Subject “A” has 2 records for “x”\. /);
});

test("unmatched IDs are kept with a blank and listed; never dropped", () => {
  const src = parseLongText(`${CSV}M7,before,10.0\nM8,after,\n`) as LongSource;
  const fill = fillFromLong("paired", src, guessRoles(src, "paired"), "", emptyTable("column")) as LongFill;
  assert.deepEqual(fill.table.rowTitles.slice(6), ["M7", "M8"]);
  assert.deepEqual(fill.table.datasets.map((d) => d.rows.slice(6).map((r) => r[0])), [["", ""], ["10.0", ""]]);
  assert.equal(fill.summary, "6 subjects paired by mouse across “after”, “before”");
  assert.equal(fill.notes[1], "Unmatched, kept as rows with a blank that paired analyses leave out: "
    + "M7 (no “after”), M8 (no “after” or “before”).");
});

test("records without an ID or a condition are left out and listed by row", () => {
  const p = ok(pairBySubject([rec("A", "x", "1", 2), rec("A", "y", "2", 3), rec("", "x", "5", 4),
    rec("B", " ", "6", 5), rec("NA", "y", "7", 6)]));
  assert.deepEqual([p.noId, p.noGroup], [[4, 6], [5]]);
  const notes = pairingReport(p, "Animal").notes;
  assert.deepEqual(notes.slice(1), ["2 records without a subject ID left out (rows 4 and 6).",
    "1 record without a condition left out (row 5)."]);
});

test("IDs and conditions match after trimming; missing-value codes are blanks", () => {
  const p = ok(pairBySubject([rec(" M1", "pre", "1"), rec("M1 ", " post", "NaN"), rec("M2", "pre", "3"),
    rec("M2", "post", "4")]));
  assert.deepEqual(p.subjects, ["M1", "M2"]);
  assert.deepEqual(p.cells, [["1", ""], ["3", "4"]]);
  assert.deepEqual(p.unmatched, [{ id: "M1", missing: ["post"] }]);
});

test("three or more conditions: one column each (repeated measures)", () => {
  const p = ok(pairBySubject(["d0", "d7", "d14"].flatMap((g, j) =>
    ["S2", "S1"].map((s, i) => rec(s, g, String(10 * j + i))))));
  assert.deepEqual(p.groups, ["d0", "d7", "d14"]);
  assert.deepEqual(p.cells, [["0", "10", "20"], ["1", "11", "21"]]);
});

test("one condition, or no subject in every condition: an error that says what to check", () => {
  assert.match((pairBySubject([rec("A", "x", "1"), rec("B", "x", "2")]) as { error: string }).error,
    /^Only one condition \(“x”\)/);
  assert.match((pairBySubject([rec("A", "x", "1"), rec("B", "y", "2")]) as { error: string }).error,
    /^No subject has a value in every condition/);
  assert.match((pairBySubject([]) as { error: string }).error, /^No record has both/);
});

test("non-numeric values are kept as typed and reported", () => {
  const src = parseLongText("id,t,v\nA,1,5\nA,2,high\nB,1,6\nB,2,7\n") as LongSource;
  const fill = fillFromLong("paired", src, { subject: 0, condition: 1, value: 2 }, "", emptyTable("column")) as LongFill;
  assert.equal(fill.table.datasets[1].rows[0][0], "high");
  assert.ok(fill.notes.includes("1 value not a number, kept as typed: analyses read it as blank."), fill.notes.join(" | "));
});

test("recipes, column output: shared subject IDs pair by ID; different subjects per group stack as before", () => {
  const src = parseLongText(CSV) as LongSource;
  const st = makeStaging(src.headers, src.rows, ["subject", "group", "value"]);
  const r = pivot(st, "column");
  assert.deepEqual(r.table.rowTitles, HAND.rowTitles);
  assert.deepEqual(r.table.datasets.map((d) => d.rows), HAND.datasets.map((d) => d.rows));
  assert.deepEqual(r.pairing?.paired, ["M4", "M1", "M6", "M3", "M2", "M5"]);
  // a duplicate stops the pivot with the same message
  const dup = makeStaging(src.headers, [...src.rows, ["M3", "before", "14.0"]], ["subject", "group", "value"]);
  assert.throws(() => pivot(dup, "column"), /Subject “M3” has 2 records for “before” \(rows 5 and 14\)/);
  // unpaired design: every animal in one group only
  const un = makeStaging(["animal", "group", "v"], [["a1", "WT", "1"], ["a2", "WT", "2"], ["b1", "KO", "3"]],
    ["subject", "group", "value"]);
  const u = pivot(un, "column");
  assert.equal(u.pairing, undefined);
  assert.deepEqual(u.table.datasets.map((d) => d.rows.map((x) => x[0])), [["1", "2"], ["3", ""]]);
});

test("sharesSubjects: an ID in two groups", () => {
  assert.ok(sharesSubjects([rec("A", "x", "1"), rec("A", "y", "2")]));
  assert.ok(!sharesSubjects([rec("A", "x", "1"), rec("A", "x", "2"), rec("B", "y", "2")]));
});
