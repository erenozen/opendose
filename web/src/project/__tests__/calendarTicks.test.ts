// Calendar ticks on date X axes (xformat.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarTicks, formatDateWith, parseDate, xTicks } from "../xformat.ts";
import { normalizeTable } from "../table.ts";

const D = (s: string) => parseDate(s, "dmy")!;

test("strftime codes", () => {
  const d = D("2024-03-05");
  assert.equal(formatDateWith(d, "%Y-%m-%d"), "2024-03-05");
  assert.equal(formatDateWith(d, "%b %-d, %Y"), "Mar 5, 2024");
  assert.equal(formatDateWith(d, "%e %B %y (%a, day %j)"), "5 March 24 (Tue, day 065)");
});

test("steps: weeks on Mondays, first of the month, years", () => {
  const w = calendarTicks(D("2024-03-01"), D("2024-04-15"))!;
  assert.equal(w.step.unit, "day");
  assert.equal(w.step.n, 7);
  assert.ok(w.days.every((d) => formatDateWith(d, "%a") === "Mon"));
  const m = calendarTicks(D("2024-01-10"), D("2024-07-20"))!;
  assert.deepEqual(m.days.map((d) => formatDateWith(d, "%Y-%m-%d")),
    ["2024-02-01", "2024-03-01", "2024-04-01", "2024-05-01", "2024-06-01", "2024-07-01"]);
  const y = calendarTicks(D("2001-05-01"), D("2023-02-01"))!;
  assert.equal(y.step.unit, "year");
  assert.ok(y.days.every((d) => formatDateWith(d, "%m-%d") === "01-01"));
  assert.equal(calendarTicks(D("2024-03-01"), D("2024-03-02")), null);
});

test("table X in days since the first date; labels in the table's units", () => {
  const t = normalizeTable({ type: "xy", xFormat: "dates", xDateOrder: "dmy",
    x: ["2024-01-10", "2024-03-15", "2024-07-20"], datasets: [{ name: "A", rows: [["1"], ["2"], ["3"]] }] });
  const r = xTicks(t, 0, D("2024-07-20") - D("2024-01-10"))!;
  assert.equal(r.ticktext[0], "Feb 2024");
  assert.equal(r.tickvals[0], D("2024-02-01") - D("2024-01-10"));
  assert.equal(xTicks(t, 0, 192, "%d/%m")!.ticktext[0], "01/02");
});
