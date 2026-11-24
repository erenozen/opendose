// n in figure legends when the counts differ (report/legend.ts nStatement,
// sheets/xy/fitLegend.ts xyReplicateGroups): an XY table whose replicates
// differ between X values (R's cars: 1 to 5 distances per speed) states
// the range, never its largest count as every X value's n; equal counts
// keep their sentence byte for byte. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTable } from "../../project/table.ts";
import type { DataSheet, DataTableModel } from "../../project/types.ts";
import { xyN, xyReplicateGroups } from "../../sheets/xy/fitLegend.ts";
import { describeResult, nCount } from "../describe.ts";
import { nStatement } from "../legend.ts";
import { legendFor } from "../legendFor.ts";
import { DEFAULT_REPORT } from "../prefs.ts";
import { RULES } from "../checklists.ts";
import { statsRows } from "../statsTable.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "stats-fixtures.json"), "utf8")) as Record<string, { result: any }>;

// R's cars (speed, dist), the ties at each speed as replicates (the layout
// of e2e-fixtures/stage/build.mjs smoothing.json)
const SPEED = [4, 4, 7, 7, 8, 9, 10, 10, 10, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14, 14, 15, 15,
  15, 16, 16, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 20, 20, 20, 20, 20, 22, 23, 24, 24, 24, 24, 25];
const DIST = [2, 10, 4, 22, 16, 10, 18, 26, 34, 17, 28, 14, 20, 24, 28, 26, 34, 34, 46, 26, 36, 60, 80, 20,
  26, 54, 32, 40, 32, 40, 50, 42, 56, 76, 84, 36, 46, 68, 32, 48, 52, 56, 64, 66, 54, 70, 92, 93, 120, 85];
const speeds = [...new Set(SPEED)];
const cars: DataTableModel = normalizeTable({ type: "xy", x: speeds.map(String), datasets: [{ name: "Distance",
  rows: speeds.map((s) => { const r = DIST.filter((_, i) => SPEED[i] === s).map(String); return [...r, ...Array(5 - r.length).fill("")]; }) }] });
const equal: DataTableModel = normalizeTable({ type: "xy", x: ["1", "2", "3"], datasets: [{ name: "A",
  rows: [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]] }] });

test("cars: 1 to 5 replicates per speed is stated as a range", () => {
  assert.deepEqual(xyReplicateGroups(cars), [{ name: "Distance", n: 1, nMax: 5 }]);
  // before: "n = 5 replicates per X value" (the largest count)
  assert.equal(xyN(cars), "n = 1 to 5 replicates per X value");
  const data: DataSheet = { id: "d", kind: "data", name: "Cars", table: cars };
  const text = legendFor({ data, table: cars, graph: null, result: null, options: null,
    prefs: DEFAULT_REPORT, software: "OpenDose 0.3.0" });
  assert.equal(text, "n = 1 to 5 replicates per X value. Analysed and drawn with OpenDose 0.3.0.");
});

test("equal replicates at every X keep the single n, byte for byte", () => {
  assert.deepEqual(xyReplicateGroups(equal), [{ name: "A", n: 3 }]);
  assert.equal(xyN(equal), "n = 3 replicates per X value");
  const one = normalizeTable({ type: "xy", x: ["1", "2"], datasets: [{ name: "A", rows: [["1"], ["2"]] }] });
  assert.equal(xyN(one), "n = 1 replicate per X value");
});

test("two data sets: each range, or one range when they share it", () => {
  const two = normalizeTable({ type: "xy", x: ["1", "2", "3"], datasets: [
    { name: "A", rows: [["1", "", ""], ["4", "5", "6"], ["7", "8", ""]] },
    { name: "B", rows: [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]] }] });
  assert.equal(xyN(two), "n = 1 to 3 (A), 3 (B) replicates per X value");
  const same = normalizeTable({ type: "xy", x: ["1", "2"], datasets: [
    { name: "A", rows: [["1", ""], ["4", "5"]] }, { name: "B", rows: [["1", "2"], ["4", ""]] }] });
  assert.equal(xyN(same), "n = 1 to 2 replicates per X value per group");
  // an X value with no value at all is not a count of 0
  const gap = normalizeTable({ type: "xy", x: ["1", "2", "3"], datasets: [
    { name: "A", rows: [["1", "2"], ["", ""], ["7", "8"]] }] });
  assert.equal(xyN(gap), "n = 2 replicates per X value");
});

test("nStatement and nCount: a range wherever one count would hide unequal counts", () => {
  assert.equal(nCount({ name: "A", n: 4 }), "4");
  assert.equal(nCount({ name: "A", n: 2, nMax: 4 }), "2 to 4");
  assert.equal(nCount({ name: "A", n: 4, nMax: 4 }), "4");
  const info = { nUnit: "values" as const };
  assert.equal(nStatement([{ name: "A", n: 2, nMax: 3 }, { name: "B", n: 2, nMax: 3 }], info), "n = 2 to 3 per group");
  assert.equal(nStatement([{ name: "A", n: 2, nMax: 3 }, { name: "B", n: 3 }], info), "n = 2 to 3 (A), 3 (B)");
  assert.equal(nStatement([{ name: "A", n: 2, nMax: 3 }, { name: "B", n: 2, nMax: 3 }], { nUnit: "pairs" }),
    "n = 2 to 3 pairs");
});

test("multiple t tests (one per row): rows with blanks give a range, not the smallest n", () => {
  const r = JSON.parse(JSON.stringify(FX.multi_t.result));
  // the recorded run has 3 per cell: unchanged
  assert.deepEqual(describeResult(r).groups.map(nCount), ["3", "3"]);
  r.rows[1].n_a = 2;
  const g = describeResult(r).groups;
  assert.deepEqual(g.map(nCount), ["2 to 3", "3"]);
  // before: "n = 3 (Vehicle) ... " stated 2 (the minimum) for every row
  assert.equal(nStatement(g, describeResult(r)), "n = 2 to 3 (Vehicle), 3 (Drug)");
  const rows = statsRows({ sheet: "Multiple t", data: "Data 1", analysisId: "grouped", analysisLabel: "Multiple t tests",
    panels: [], result: r });
  // the statistics table states each row's own n
  assert.deepEqual(rows.map((x) => x.n), ["Vehicle 3; Drug 3", "Vehicle 2; Drug 3", "Vehicle 3; Drug 3"]);
  const met = RULES.n_exact({ results: [{ sheetId: "s", name: "Multiple t", info: describeResult(r) }] } as any);
  assert.equal(met.reason, "Exact n per group is in the legend (Vehicle 2 to 3, Drug 3).");
});
