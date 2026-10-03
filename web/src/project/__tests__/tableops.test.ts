// Unit tests for table editing, import / export parsers, X dates and
// elapsed times, and the Data Inspector. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockValues, clearBlock, deleteRows, emptyTable, insertDataset, insertSeries,
  isExcluded, moveDataset, normalizeTable, numericData, pasteBlock, reverseRows,
  seriesValues, setCell, setDecimals, setSubcolumnFormat, setX, sortRows,
  toggleBlockExcluded, toggleExcluded, flatColumns,
} from "../table.ts";
import {
  applyImport, defaultRoles, DEFAULT_FILTER, DEFAULT_SOURCE, detectDecimal,
  detectDelimiter, normalizeNumber, pasteNeedsImport, prepareImport, splitDelimited,
} from "../importText.ts";
import { DEFAULT_EXPORT, tableMatrix, toDelimited, fileSlug } from "../exportTable.ts";
import { selectionStats } from "../inspector.ts";
import {
  formatDate, formatElapsed, niceTicks, parseDate, parseElapsed, xDisplay,
  xNumbers, xTickFormatter, localeDateOrder,
} from "../xformat.ts";
import type { DataTableModel } from "../types.ts";

function xyTable(): DataTableModel {
  return normalizeTable({
    type: "xy",
    x: ["3", "1", "", "2"],
    datasets: [
      { name: "A", rows: [["30", "31"], ["10", "11"], ["99", ""], ["20", "21"]] },
      { name: "B", rows: [["c"], ["a"], [""], ["b"]] },
    ],
  });
}

// ------------------------------------------------------------ sorting

test("sortRows by X keeps rows together, sends blanks last and remaps exclusions", () => {
  let t = xyTable();
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 0, sub: 1 }); // "31"
  t = toggleExcluded(t, { kind: "x", row: 3 });                     // X "2"
  const s = sortRows(t, { kind: "x" }, "asc");
  assert.deepEqual(s.x, ["1", "2", "3", ""]);
  assert.deepEqual(s.datasets[0].rows, [["10", "11"], ["20", "21"], ["30", "31"], ["99", ""]]);
  assert.deepEqual(s.datasets[1].rows.map((r) => r[0]), ["a", "b", "c", ""]);
  assert.ok(isExcluded(s, { kind: "y", dataset: 0, row: 2, sub: 1 }));
  assert.ok(!isExcluded(s, { kind: "y", dataset: 0, row: 0, sub: 1 }));
  assert.deepEqual(s.xExcluded, [1]);
  const d = sortRows(t, { kind: "x" }, "desc");
  assert.deepEqual(d.x, ["3", "2", "1", ""]);
});

test("sortRows by a dataset uses the replicate mean or one subcolumn", () => {
  const t = normalizeTable({
    type: "xy", x: ["a", "b", "c"],
    datasets: [{ name: "A", rows: [["5", "1"], ["2", "2"], ["4", "0"]] }],
  });
  assert.deepEqual(sortRows(t, { kind: "dataset", dataset: 0 }).x, ["b", "c", "a"]);
  assert.deepEqual(sortRows(t, { kind: "dataset", dataset: 0, sub: 1 }, "desc").x,
    ["b", "a", "c"]);
  assert.deepEqual(reverseRows(t).x, ["c", "b", "a"]);
});

test("sortRows by row title sorts text naturally", () => {
  const t = normalizeTable({
    type: "grouped", rowTitles: ["Dose 10", "Dose 2", "Dose 1"],
    datasets: [{ name: "A", rows: [["x"], ["y"], ["z"]] }],
  });
  const s = sortRows(t, { kind: "rowTitle" });
  assert.deepEqual(s.rowTitles, ["Dose 1", "Dose 2", "Dose 10"]);
  assert.deepEqual(s.datasets[0].rows.map((r) => r[0]), ["z", "y", "x"]);
});

// ------------------------------------------------------------ rows / columns

test("deleteRows removes a block and shifts exclusions; one row always stays", () => {
  let t = xyTable();
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 3, sub: 0 });
  const d = deleteRows(t, 1, 2);
  assert.deepEqual(d.x, ["3", "2"]);
  assert.ok(isExcluded(d, { kind: "y", dataset: 0, row: 1, sub: 0 }));
  const all = deleteRows(t, 0, 10);
  assert.equal(all.x.length, 1);
  assert.equal(all.datasets[0].rows.length, 1);
  assert.deepEqual(all.datasets[0].rows[0], ["", ""]);
});

test("insertDataset and moveDataset place columns where asked", () => {
  const t = xyTable();
  const i = insertDataset(t, 0, "New");
  assert.deepEqual(i.datasets.map((d) => d.name), ["New", "A", "B"]);
  assert.equal(i.datasets[0].rows.length, 4);
  const m = moveDataset(i, 0, 2);
  assert.deepEqual(m.datasets.map((d) => d.name), ["A", "B", "New"]);
  assert.equal(moveDataset(m, 2, 9).datasets[2].name, "New");
});

test("setSubcolumnFormat resizes subcolumns and titles them", () => {
  let t = emptyTable("xy", { datasets: 2, subcolumns: 3, rows: 2 });
  t = setCell(t, 0, 0, 0, "50");
  t = setCell(t, 0, 0, 2, "3");
  const s = setSubcolumnFormat(t, "mean_ci_n");
  assert.equal(s.subcolumnFormat, "mean_ci_n");
  assert.deepEqual(s.datasets[1].subTitles, ["Mean", "Lower CI", "Upper CI", "N"]);
  assert.deepEqual(s.datasets[0].rows[0], ["50", "", "3", ""]);
  const back = setSubcolumnFormat(s, "replicates", 2);
  assert.equal(back.datasets[0].subTitles, undefined);
  assert.equal(back.datasets[0].rows[0].length, 2);
  // column tables accept summary formats; contingency tables do not
  assert.equal(setSubcolumnFormat(emptyTable("column"), "mean_sd_n").datasets[0].rows[0].length, 3);
  assert.equal(setSubcolumnFormat(emptyTable("contingency"), "mean_sd_n").subcolumnFormat,
    "replicates");
  assert.equal(emptyTable("column", { subcolumnFormat: "mean_sem_n" }).subcolumnFormat, "mean_sem_n");
});

test("setDecimals stores a display setting that survives normalizeTable", () => {
  const t = setDecimals(xyTable(), 2);
  assert.equal(normalizeTable(t).decimals, 2);
  assert.equal(setDecimals(t, undefined).decimals, undefined);
});

// ------------------------------------------------------------ blocks / series

test("block copy, clear and exclude work in flat-column coordinates", () => {
  const t = xyTable(); // flat: X, A:Y1, A:Y2, B:Y1
  const rect = { r0: 0, c0: 1, r1: 1, c1: 2 };
  assert.deepEqual(blockValues(t, rect), [["30", "31"], ["10", "11"]]);
  const ex = toggleBlockExcluded(t, rect);
  assert.ok(isExcluded(ex, { kind: "y", dataset: 0, row: 1, sub: 1 }));
  const inc = toggleBlockExcluded(ex, rect);
  assert.ok(!isExcluded(inc, { kind: "y", dataset: 0, row: 1, sub: 1 }));
  const cl = clearBlock(ex, { r0: 1, c0: 0, r1: 1, c1: 3 });
  assert.equal(cl.x[1], "");
  assert.deepEqual(cl.datasets[0].rows[1], ["", ""]);
  assert.ok(!isExcluded(cl, { kind: "y", dataset: 0, row: 1, sub: 0 }));
  assert.ok(isExcluded(cl, { kind: "y", dataset: 0, row: 0, sub: 0 }));
});

test("column tables have editable row titles in the first grid column", () => {
  const t = pasteBlock(emptyTable("column", { rows: 2 }), 0, 0, [["Mouse 1", "5"]]);
  assert.equal(flatColumns(t)[0].kind, "rowTitle");
  assert.equal(t.rowTitles[0], "Mouse 1");
  assert.equal(t.datasets[0].rows[0][0], "5");
});

test("series: arithmetic and geometric, clean decimals, rows added", () => {
  assert.deepEqual(seriesValues({ start: 0, step: 0.1, kind: "arithmetic", count: 4 }),
    ["0", "0.1", "0.2", "0.3"]);
  assert.deepEqual(seriesValues({ start: 1e-9, step: 10, kind: "geometric", count: 3 }),
    ["1e-9", "1e-8", "1e-7"]);
  const t = insertSeries(emptyTable("xy", { rows: 2 }), 1, 0,
    { start: 5, step: -2, kind: "arithmetic", count: 3 });
  assert.deepEqual(t.x, ["", "5", "3", "1"]);
  assert.equal(t.datasets[0].rows.length, 4);
});

// ------------------------------------------------------------ dates / times

test("parseElapsed reads h:mm:ss, h:mm (or m:ss), units and decimal hours", () => {
  assert.equal(parseElapsed("1:12:30.2"), 4350.2);
  assert.equal(parseElapsed("0:30"), 1800);
  assert.equal(parseElapsed("2:30", "ms"), 150);
  assert.equal(parseElapsed("1.5"), 5400);
  assert.equal(parseElapsed("90 s"), 90);
  assert.equal(parseElapsed("2d"), 172800);
  assert.equal(parseElapsed("1,5 h"), 5400);
  assert.equal(parseElapsed("-0:01:00"), -60);
  assert.equal(parseElapsed("1:75"), null);
  assert.equal(parseElapsed("soon"), null);
  assert.equal(formatElapsed(4350.2), "1:12:30.2");
  assert.equal(formatElapsed(65), "0:01:05");
});

test("parseDate reads ISO, day/month order, month names and times", () => {
  const d = (s: string, o: "dmy" | "mdy" = "dmy") => {
    const v = parseDate(s, o);
    return v === null ? null : formatDate(v);
  };
  assert.equal(d("2024-03-05"), "2024-03-05");
  assert.equal(d("05/03/2024"), "2024-03-05");
  assert.equal(d("03/05/2024", "mdy"), "2024-03-05");
  assert.equal(d("13/01/2024", "mdy"), "2024-01-13"); // impossible month: other order
  assert.equal(d("5.3.24"), "2024-03-05");
  assert.equal(d("5 Mar 2024"), "2024-03-05");
  assert.equal(d("March 5, 2024"), "2024-03-05");
  assert.equal(d("2024-03-05T14:30"), "2024-03-05 14:30");
  assert.equal(d("31/02/2024"), null);
  assert.equal(d("not a date"), null);
  assert.equal(localeDateOrder("en-US"), "mdy");
  assert.equal(localeDateOrder("de-DE"), "dmy");
});

test("date and elapsed X columns become numbers for analyses", () => {
  const dates = normalizeTable({
    type: "xy", xFormat: "dates", xDateOrder: "dmy",
    x: ["03/01/2024", "01/01/2024", "08/01/2024", "nope"],
    datasets: [{ name: "A", rows: [["1"], ["2"], ["3"], ["4"]] }],
  });
  assert.deepEqual(xNumbers(dates), [2, 0, 7, null]);
  assert.deepEqual(numericData(dates).x, [2, 0, 7, null]);
  assert.equal(xDisplay(dates, "03/01/2024"), "2024-01-03");
  assert.equal(xTickFormatter(dates)!(7), "2024-01-08");
  const weeks = { ...dates, xTimeUnit: "weeks" as const };
  assert.deepEqual(xNumbers(weeks).slice(0, 3), [2 / 7, 0, 1]);
  const elapsed = normalizeTable({
    type: "xy", xFormat: "elapsed", xTimeUnit: "minutes",
    x: ["0:00:30", "1:00:00", ""],
    datasets: [{ name: "A", rows: [["1"], ["2"], [""]] }],
  });
  assert.deepEqual(xNumbers(elapsed), [0.5, 60, null]);
  assert.equal(xTickFormatter(elapsed)!(90), "1:30:00");
  // sorting a dates column sorts chronologically
  assert.deepEqual(sortRows(dates, { kind: "x" }).x,
    ["01/01/2024", "03/01/2024", "08/01/2024", "nope"]);
  assert.deepEqual(niceTicks(0, 10, 6), [0, 2, 4, 6, 8, 10]);
});

// ------------------------------------------------------------ import

test("splitDelimited handles quotes, embedded separators and CRLF", () => {
  assert.deepEqual(splitDelimited('a,"b,c",d\r\n1,"say ""hi""",3\r\n', ","),
    [["a", "b,c", "d"], ["1", 'say "hi"', "3"]]);
  assert.deepEqual(splitDelimited('"line\nbreak",2', ","), [["line\nbreak", "2"]]);
  assert.deepEqual(splitDelimited("  1   2\t3\n4 5 6", " "), [["1", "2", "3"], ["4", "5", "6"]]);
  assert.deepEqual(splitDelimited("1\t\t3", "\t"), [["1", "", "3"]]);
});

test("delimiter and decimal separator detection", () => {
  assert.equal(detectDelimiter("a\tb\n1\t2"), "\t");
  assert.equal(detectDelimiter("dose;resp\n1,5;2,25\n3;4"), ";");
  assert.equal(detectDelimiter("dose,resp\n1.5,2\n3,4"), ",");
  assert.equal(detectDelimiter("1 2 3\n4 5 6"), " ");
  assert.equal(detectDecimal([["1,5", "2,25"], ["3", "4"]]), ",");
  assert.equal(detectDecimal([["1.5", "2"]]), ".");
  assert.equal(normalizeNumber("1,5", ","), "1.5");
  assert.equal(normalizeNumber("1.234,5", ","), "1234.5");
  assert.equal(normalizeNumber("1,234.5", "."), "1234.5");
  assert.equal(normalizeNumber("3.162e-9", ","), "3.162e-9");
  assert.equal(normalizeNumber("-1,5e-3", ","), "-1.5e-3");
  assert.equal(normalizeNumber("12.345", ","), "12345");
  assert.equal(normalizeNumber("Drug A", ","), "Drug A");
  assert.ok(pasteNeedsImport("a;b\n1;2\n3;4"));
  assert.ok(!pasteNeedsImport("1\t2\n3\t4"));
  assert.ok(!pasteNeedsImport("12.5"));
});

const CSV = [
  "Instrument export v2",
  "Dose;Rep 1;Rep 2;Note",
  "0,001;98,5;99*;ok",
  "0,01;80;81,5;ok",
  ";;;",
  "0,1;50,25;49,75;ok",
  "1;10;NA;ok",
].join("\n");

test("prepareImport: skip lines, titles, decimal comma, filters", () => {
  const p = prepareImport(CSV, { ...DEFAULT_SOURCE, skipLines: 1, titlesRow: true },
    { ...DEFAULT_FILTER, missingCode: "NA" });
  assert.equal(p.delimiter, ";");
  assert.equal(p.decimal, ",");
  assert.deepEqual(p.titles, ["Dose", "Rep 1", "Rep 2", "Note"]);
  assert.deepEqual(p.rows[0], ["0.001", "98.5", "99*", "ok"]);
  assert.deepEqual(p.rows[4], ["1", "10", "", "ok"]);
  const cols = prepareImport(CSV, { ...DEFAULT_SOURCE, skipLines: 1, titlesRow: true },
    { ...DEFAULT_FILTER, colFrom: 1, colTo: 3, rowFrom: 2, everyK: 2 });
  assert.deepEqual(cols.columns, [1, 2, 3]);
  assert.deepEqual(cols.rows.map((r) => r[0]), ["0.01", "0.1"]);
  const tr = prepareImport("a,b,c\n1,2,3", { ...DEFAULT_SOURCE, transpose: true, titlesRow: true },
    DEFAULT_FILTER);
  assert.deepEqual(tr.titles, ["a", "1"]);
  assert.deepEqual(tr.rows, [["b", "2"], ["c", "3"]]);
});

test("prepareImport unstacks indexed data into one column per group", () => {
  const text = "id,value,group\n1,123,5\n2,142,6\n3,152,5\n4,116,6\n5,125,6\n6,134,5";
  const p = prepareImport(text, { ...DEFAULT_SOURCE, titlesRow: true },
    { ...DEFAULT_FILTER, unstack: { dataCol: 2, groupCol: 3 } });
  assert.deepEqual(p.titles, ["5", "6"]);
  assert.deepEqual(p.rows, [["123", "142"], ["152", "116"], ["134", "125"]]);
  const t = emptyTable("column");
  const out = applyImport(t, p, defaultRoles(t, p),
    { mode: "replace", row: 0, col: 0, perDataset: 1, useTitles: true },
    { skipBlankX: false, asteriskExcluded: true });
  assert.deepEqual(out.datasets.map((d) => d.name), ["5", "6"]);
  assert.deepEqual(out.datasets[1].rows.map((r) => r[0]), ["142", "116", "125"]);
});

test("applyImport replace: X, replicates per dataset, titles, exclusions, skip blank X", () => {
  const t = emptyTable("xy", { datasets: 1, subcolumns: 3, rows: 9 });
  const p = prepareImport(CSV, { ...DEFAULT_SOURCE, skipLines: 1, titlesRow: true },
    DEFAULT_FILTER);
  const roles = defaultRoles(t, p);
  assert.deepEqual(roles, ["x", "y", "y", "y"]);
  roles[3] = "ignore";
  const out = applyImport(t, p, roles,
    { mode: "replace", row: 0, col: 0, perDataset: 2, useTitles: true },
    { skipBlankX: true, asteriskExcluded: true });
  assert.deepEqual(out.x, ["0.001", "0.01", "0.1", "1"]);
  assert.equal(out.xTitle, "Dose");
  assert.equal(out.datasets.length, 1);
  assert.equal(out.datasets[0].name, "Rep 1");
  assert.deepEqual(out.datasets[0].rows[0], ["98.5", "99"]);
  assert.ok(isExcluded(out, { kind: "y", dataset: 0, row: 0, sub: 1 }));
  assert.deepEqual(out.datasets[0].rows[3], ["10", "NA"]);
});

test("applyImport insert and append grow the table and add datasets", () => {
  let t = emptyTable("column", { datasets: 1, rows: 2 });
  t = setCell(t, 0, 0, 0, "1");
  const p = prepareImport("Grp,G1,G2\nm1,5,6\nm2,7,8", { ...DEFAULT_SOURCE, titlesRow: true },
    DEFAULT_FILTER);
  const roles = defaultRoles(t, p);
  assert.deepEqual(roles, ["rowTitle", "y", "y"]);
  const app = applyImport(t, p, roles,
    { mode: "append", row: 0, col: 0, perDataset: 1, useTitles: false },
    { skipBlankX: false, asteriskExcluded: true });
  assert.equal(app.x.length, 3);
  assert.deepEqual(app.datasets.map((d) => d.rows.map((r) => r[0])), [["1", "5", "7"], ["", "6", "8"]]);
  assert.deepEqual(app.rowTitles, ["", "m1", "m2"]);
  // insert at row 1, starting at the grid's second Y column (flat col 2)
  const ins = applyImport(t, p, ["ignore", "y", "y"],
    { mode: "insert", row: 1, col: 2, perDataset: 1, useTitles: true },
    { skipBlankX: false, asteriskExcluded: true });
  assert.equal(ins.datasets.length, 3);
  assert.deepEqual(ins.datasets[1].rows.map((r) => r[0]), ["", "5", "7"]);
  assert.equal(ins.datasets[1].name, "G1");
  assert.equal(ins.datasets[2].name, "G2");
  assert.equal(ins.datasets[0].rows[0][0], "1");
});

test("applyImport works for multiple-variables tables (categorical detection)", () => {
  const t = emptyTable("multivariable");
  const p = prepareImport("age\tsex\n30\tF\n41\tM", { ...DEFAULT_SOURCE, titlesRow: true },
    DEFAULT_FILTER);
  const out = applyImport(t, p, defaultRoles(t, p),
    { mode: "replace", row: 0, col: 0, perDataset: 1, useTitles: true },
    { skipBlankX: false, asteriskExcluded: false });
  assert.deepEqual(out.datasets.map((d) => [d.name, d.varType]),
    [["age", "continuous"], ["sex", "categorical"]]);
});

// ------------------------------------------------------------ export

test("tableMatrix and toDelimited: titles, exclusions, decimal comma, quoting", () => {
  let t = xyTable();
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 1, sub: 0 });
  t = { ...t, xTitle: "Dose, M" };
  const m = tableMatrix(t, DEFAULT_EXPORT);
  assert.deepEqual(m[0], ["Dose, M", "A", "A", "B"]);
  assert.deepEqual(m[2], ["1", "10*", "11", "a"]);
  assert.equal(m.length, 5);
  const csv = toDelimited(m, "csv");
  assert.ok(csv.startsWith('"Dose, M",A,A,B\r\n3,30,31,c\r\n'));
  const blank = tableMatrix(t, { ...DEFAULT_EXPORT, excluded: "blank", titles: false });
  assert.deepEqual(blank[1], ["1", "", "11", "a"]);
  const eu = tableMatrix(setX(t, 0, "0.5"), { ...DEFAULT_EXPORT, decimal: "," });
  assert.equal(eu[1][0], "0,5");
  assert.ok(toDelimited(eu, "csv", ",").includes("0,5;30;31;c"));
  assert.equal(toDelimited([["a\tb", "c"]], "tsv"), "a b\tc\n");
  const summary = emptyTable("xy", { subcolumnFormat: "mean_sd_n", rows: 1 });
  assert.deepEqual(tableMatrix(summary, DEFAULT_EXPORT)[1], ["", "Mean", "SD", "N"]);
  assert.equal(fileSlug("Dose response (2)"), "dose-response-2");
});

// ------------------------------------------------------------ inspector

test("selectionStats: n, mean, SD, SEM, min, max, missing, excluded", () => {
  let t = xyTable();
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 2, sub: 0 }); // 99
  const s = selectionStats(t, { r0: 0, c0: 1, r1: 3, c1: 2 });
  // values 30 31 10 11 20 21 (99 excluded, one blank)
  assert.equal(s.cells, 8);
  assert.equal(s.n, 6);
  assert.equal(s.missing, 1);
  assert.equal(s.excluded, 1);
  assert.equal(s.mean, 123 / 6);
  assert.equal(s.min, 10);
  assert.equal(s.max, 31);
  assert.ok(Math.abs((s.sd ?? 0) - Math.sqrt(80.3)) < 1e-9);
  assert.ok(Math.abs((s.sem ?? 0) - Math.sqrt(80.3 / 6)) < 1e-9);
  const txt = selectionStats(t, { r0: 0, c0: 3, r1: 3, c1: 3 });
  assert.equal(txt.text, 3);
  assert.equal(txt.n, 0);
  assert.equal(txt.mean, null);
});
