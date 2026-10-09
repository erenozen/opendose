// Survival data entry: counts per day and dates -> one row per subject,
// and the "read as" wording. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable, normalizeTable } from "../../../project/table.ts";
import {
  cellNumber, countsToSubjects, datesToSubjects, fmtTime, guessDateRoles, parseEventCode,
  parseGrid, readAs, readTable, survivalTableFrom, timeUnitOf, type EntryFill,
} from "../entry.ts";

const ok = (r: ReturnType<typeof countsToSubjects>): EntryFill => {
  if ("error" in r) throw new Error(r.error);
  return r;
};
const rowsOf = (f: EntryFill, g: number) => f.groups[g].subjects.map((s) => [s.time, s.event]);

test("parseGrid: tabs, commas and blank lines", () => {
  assert.deepEqual(parseGrid("Day\tA\tB\n0\t10\t8\n\n1\t9\t8\n"), [["Day", "A", "B"], ["0", "10", "8"], ["1", "9", "8"]]);
  assert.deepEqual(parseGrid("Day,A\n0,5\n"), [["Day", "A"], ["0", "5"]]);
  assert.deepEqual(parseGrid("  \n"), []);
});

test("cellNumber reads times written with a unit", () => {
  assert.equal(cellNumber("12"), 12);
  assert.equal(cellNumber("Day 12"), 12);
  assert.equal(cellNumber("d3"), 3);
  assert.equal(cellNumber("5 d"), 5);
  assert.equal(cellNumber("1,5"), 1.5);
  assert.equal(cellNumber("abc"), null);
  assert.equal(cellNumber(""), null);
});

test("alive per day: falls are deaths, the rest censored at the last time", () => {
  const m = parseGrid("Day\tControl\tTreated\n0\t5\t5\n3\t4\t5\n5\t2\t5\n8\t2\t4\n10\t1\t4");
  const f = ok(countsToSubjects(m, { kind: "alive" }));
  assert.deepEqual(f.groups.map((g) => g.name), ["Control", "Treated"]);
  assert.deepEqual(rowsOf(f, 0), [[3, 1], [5, 1], [5, 1], [10, 1], [10, 0]]);
  assert.deepEqual(rowsOf(f, 1), [[8, 1], [10, 0], [10, 0], [10, 0], [10, 0]]);
  assert.equal(f.summary, "2 groups, 10 subjects: 5 deaths, 5 censored");
  assert.match(f.notes.join(" "), /still alive at a group's last recorded time are censored/);
});

test("alive per day: blank cells are not recorded; censoring at the group's last count", () => {
  const m = parseGrid("Day,A,B\n0,3,2\n2,2,\n4,,1\n6,1,");
  const f = ok(countsToSubjects(m, { kind: "alive" }));
  assert.deepEqual(rowsOf(f, 0), [[2, 1], [6, 1], [6, 0]]);
  assert.deepEqual(rowsOf(f, 1), [[4, 1], [4, 0]]);
});

test("alive per day: a rising count is an error that suggests deaths per day", () => {
  const r = countsToSubjects(parseGrid("Day,A\n0,3\n1,4"), { kind: "alive" });
  assert.ok("error" in r && /rises from 3 to 4/.test(r.error) && /deaths per day/.test(r.error));
});

test("alive per day: rows out of order are sorted; repeated times refused", () => {
  const f = ok(countsToSubjects(parseGrid("Day,A\n2,1\n0,2"), { kind: "alive" }));
  assert.deepEqual(rowsOf(f, 0), [[2, 1], [2, 0]]);
  assert.match(f.notes.join(" "), /time order/);
  const r = countsToSubjects(parseGrid("Day,A\n2,1\n0,2\n2,1"), { kind: "alive" });
  assert.ok("error" in r && /appears twice/.test(r.error));
});

test("no header row: groups named A, B…", () => {
  const f = ok(countsToSubjects(parseGrid("0\t2\t1\n4\t1\t1"), { kind: "alive" }));
  assert.deepEqual(f.groups.map((g) => g.name), ["Group A", "Group B"]);
});

test("deaths per day: start numbers, survivors censored at the last time in the table", () => {
  const m = parseGrid("Day\tA\tB\n2\t1\t\n4\t2\t1\n9\t\t");
  const f = ok(countsToSubjects(m, { kind: "deaths", startN: [4, 2] }));
  assert.deepEqual(rowsOf(f, 0), [[2, 1], [4, 1], [4, 1], [9, 0]]);
  assert.deepEqual(rowsOf(f, 1), [[4, 1], [9, 0]]);
  const one = ok(countsToSubjects(m, { kind: "deaths", startN: [5] }));
  assert.equal(one.groups[1].subjects.length, 5);
  const missing = countsToSubjects(m, { kind: "deaths" });
  assert.ok("error" in missing && /at the start/.test(missing.error));
  const tooMany = countsToSubjects(m, { kind: "deaths", startN: [2] });
  assert.ok("error" in tooMany && /3 deaths but only 2/.test(tooMany.error));
});

test("non-count cells are refused with the row and group", () => {
  const r = countsToSubjects(parseGrid("Day,A\n0,3\n1,2.5"), { kind: "alive" });
  assert.ok("error" in r && /Row 3, A/.test(r.error));
});

test("event codes: 1/0, yes/no, dead/alive, death/censored, true/false", () => {
  for (const s of ["1", "yes", "Y", "TRUE", "dead", "Died", "death", "event"]) assert.equal(parseEventCode(s), 1, s);
  for (const s of ["0", "no", "false", "alive", "Censored", "censor"]) assert.equal(parseEventCode(s), 0, s);
  for (const s of ["2", "maybe", ""]) assert.equal(parseEventCode(s), null, s);
});

test("dates: columns guessed from the headers", () => {
  assert.deepEqual(guessDateRoles(["Mouse", "Group", "Start date", "End date", "Status"]),
    { group: 1, start: 2, end: 3, status: 4 });
  assert.deepEqual(guessDateRoles(["Group", "Date of death or last seen", "Dead?"]),
    { group: 0, start: -1, end: 1, status: 2 });
});

test("dates: time in days, weeks; one start date for all; bad rows left out", () => {
  const m = parseGrid([
    "Group,Start,End,Status",
    "WT,2024-01-01,2024-01-13,dead",
    "WT,2024-01-01,2024-01-31,alive",
    "KO,2024-01-05,2024-02-04,1",
    "KO,2024-01-05,,0",
    "KO,2024-01-05,2024-01-02,1",
    "KO,2024-01-05,2024-01-20,maybe",
  ].join("\n"));
  const roles = guessDateRoles(m[0]);
  const r = datesToSubjects(m, { roles, order: "dmy", unit: "days" });
  if ("error" in r) throw new Error(r.error);
  assert.deepEqual(r.groups.map((g) => g.name), ["WT", "KO"]);
  assert.deepEqual(rowsOf(r, 0), [[12, 1], [30, 0]]);
  assert.deepEqual(rowsOf(r, 1), [[30, 1]]);
  assert.match(r.notes.join(" "), /Left out \(3\): row 5: no end date; row 6: the end date is before the start date; row 7: event code “maybe” not read/);
  const w = datesToSubjects(m, { roles, order: "dmy", unit: "weeks" });
  if ("error" in w) throw new Error(w.error);
  assert.equal(fmtTime(w.groups[0].subjects[0].time), "1.7143");

  const noStart = parseGrid("End,Event\n15/03/2024,yes\n01/04/2024,no");
  const r2 = datesToSubjects(noStart, { roles: { group: -1, start: -1, end: 0, status: 1 },
    startDate: "01/03/2024", order: "dmy", unit: "days" });
  if ("error" in r2) throw new Error(r2.error);
  assert.deepEqual(rowsOf(r2, 0), [[14, 1], [31, 0]]);
  assert.equal(r2.groups[0].name, "All subjects");
  const r3 = datesToSubjects(noStart, { roles: { group: -1, start: -1, end: 0, status: 1 },
    order: "dmy", unit: "days" });
  assert.ok("error" in r3 && /start date/.test(r3.error));
});

test("readAs: death on day 12 / censored on day 30", () => {
  assert.equal(readAs(12, 1, "days"), "death on day 12");
  assert.equal(readAs(30, 0, "days"), "censored on day 30");
  assert.equal(readAs(4.5, 1, "weeks", "relapse"), "relapse on week 4.5");
  assert.equal(readAs(7, 0, ""), "censored at time 7");
});

test("survivalTableFrom writes Time/Event per group, keeps the unit, drops covariates", () => {
  const base = normalizeTable({ type: "survival", decimals: 2, datasets: [
    { name: "Old", subTitles: ["Time", "Event", "Age"], rows: [["1", "1", "60"]] }] });
  const f = ok(countsToSubjects(parseGrid("Day,A,B\n0,2,1\n5,1,1"), { kind: "alive" }));
  const t = survivalTableFrom(base, f.groups, "days");
  assert.equal(t.type, "survival");
  assert.equal(t.xUnit, "days");
  assert.equal(t.decimals, 2);
  assert.equal(t.x.length, 2);
  assert.deepEqual(t.datasets.map((d) => d.name), ["A", "B"]);
  assert.deepEqual(t.datasets[0].rows, [["5", "1"], ["5", "0"]]);
  assert.deepEqual(t.datasets[1].rows, [["5", "0"], ["", ""]]);
  assert.deepEqual(t.datasets[0].subTitles, ["Time", "Event"]);
  assert.equal(timeUnitOf(t), "days");
});

test("readTable: per-group counts, other codes and the reading of each row", () => {
  const t = normalizeTable({ type: "survival", xUnit: "days", datasets: [
    { name: "A", subTitles: ["Time", "Event"], rows: [["12", "1"], ["30", "0"], ["", ""], ["8", "2"], ["9", ""]] },
    { name: "B", subTitles: ["Time", "Event"], rows: [["4", "0"]], excluded: [] },
  ] });
  const r = readTable(t);
  assert.equal(r[0].events, 1);
  assert.equal(r[0].censored, 1);
  assert.deepEqual(r[0].otherCodes, [{ row: 4, code: "2" }]);
  assert.equal(r[0].incomplete, 1);
  assert.deepEqual(r[0].rows.map((x) => x.text), ["event on day 12", "censored on day 30",
    "event code “2” is not 1 or 0", "no event code: left out"]);
  assert.equal(r[1].events, 0);
  assert.equal(timeUnitOf(emptyTable("survival")), "");
});
