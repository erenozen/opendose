// Analysis replay: plan extraction, matching new data to tables by name
// and shape, refilling tables in their own layout, the diff of results
// and the replay log. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSheets, makeDataSheet, makeGraphSheet, makeProject, makeResultsSheet,
} from "../ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { normalizeTable } from "../table.ts";
import type { DataSheet, GraphSheet, LayoutSheet, ResultsSheet } from "../types.ts";
import {
  buildReplayLog, fitIncoming, matchTables, nameScore, normName, planFromJson, planTables,
  replaceTables, replayLogText, replayPlanOf, usedRows,
} from "../replay.ts";
import {
  describeChange, diffResults, flattenNumbers, fmtNumber, isPKey, keyChanges, labelFor,
} from "../replayDiff.ts";
import { projectProvenance } from "../../report/provenance.ts";
import { tableP } from "../../report/pformat.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
let n = 0;
const ids = () => `id${++n}`;

const contingency = () => normalizeTable({
  type: "contingency", x: ["", ""], rowTitles: ["Exposed", "Not exposed"],
  datasets: [{ name: "Event", rows: [["15"], ["5"]] }, { name: "No event", rows: [["85"], ["95"]] }],
});
const xy = () => normalizeTable({
  type: "xy", x: ["-9", "-8", "-7"], xTitle: "log[Drug]",
  datasets: [{ name: "Drug A", rows: [["99", "98", "97"], ["60", "62", "61"], ["5", "4", "6"]] }],
});
const column = () => normalizeTable({
  type: "column", x: ["", "", ""],
  datasets: [{ name: "WT", rows: [["1"], ["2"], ["3"]] }, { name: "KO", rows: [["4"], ["5"], ["6"]] },
    { name: "Het", rows: [["7"], ["8"], ["9"]] }],
});

function project() {
  const layout: LayoutSheet = { id: "L1", kind: "layout", name: "Figure 1", graphIds: ["g1"],
    grid: { rows: 1, cols: 1 } };
  return addSheets(makeProject(prefs, [
    makeDataSheet("d1", "Dose response", xy()),
    makeResultsSheet("r1", "d1", "nonlin", { model: "4pl" }, "Nonlinear fit of Dose response"),
    makeGraphSheet("g1", "d1", "r1", "xy_curve", { titles: { x: "", y: "Response" }, scheme: "default" },
      "Graph of Dose response"),
    makeDataSheet("d2", "Contingency example", contingency()),
    makeResultsSheet("r2", "d2", "contingency", {}, "Contingency of Contingency example"),
    makeDataSheet("d3", "Knockout", column()),
  ], "Study"), [layout]);
}

const csv = (rows: string[][]) => rows.map((r) => r.join(",")).join("\n");

test("plan tables: data sheets that are not derived or frozen", () => {
  const p = project();
  const frozen = { ...p, sheets: p.sheets.map((s) => (s.id === "d3" ? { ...s, frozen: true } : s)) };
  assert.deepEqual(planTables(frozen).map((t) => t.id), ["d1", "d2"]);
  assert.equal(usedRows(xy()), 3);
});

test("a contingency CSV refills the table in its own layout", () => {
  const plan = contingency();
  const fit = fitIncoming(plan, { name: "Contingency example", origin: "x.csv",
    source: csv([["", "Event", "No event"], ["Exposed", "25", "75"], ["Not exposed", "5", "95"]]) })!;
  assert.ok(fit.exact);
  assert.deepEqual(fit.table.datasets.map((d) => d.name), ["Event", "No event"]);
  assert.deepEqual(fit.table.datasets[0].rows, [["25"], ["5"]]);
  assert.deepEqual(fit.table.rowTitles, ["Exposed", "Not exposed"]);
  assert.equal(fit.rows, 2);
  assert.deepEqual(fit.renamed, []);
});

test("an XY file keeps X, the X title and the data set names when the shape matches", () => {
  const fit = fitIncoming(xy(), { name: "week 2", origin: "w2.tsv",
    source: "dose\tA_1\tA_2\tA_3\n-9\t90\t91\t92\n-8\t50\t51\t52\n-7\t3\t2\t1\n-6\t1\t1\t1" })!;
  assert.ok(fit.exact);
  assert.equal(fit.table.xTitle, "log[Drug]");
  assert.deepEqual(fit.table.x, ["-9", "-8", "-7", "-6"]);
  assert.equal(fit.table.datasets[0].name, "Drug A");
  assert.deepEqual(fit.renamed, ["A"]);
  assert.equal(fit.rows, 4);
});

test("the wrong shape is a fit but not an exact one; a .pzfx table needs the same type", () => {
  const fit = fitIncoming(xy(), { name: "c", origin: "c.csv", source: csv([["1", "2"], ["3", "4"]]) })!;
  assert.equal(fit.exact, false);
  assert.equal(fitIncoming(xy(), { name: "t", origin: "p.pzfx", table: contingency() }), null);
  const same = fitIncoming(contingency(), { name: "t", origin: "p.pzfx", table: {
    ...contingency(), datasets: contingency().datasets.map((d) => ({ ...d, name: `${d.name}!` })) } })!;
  assert.ok(same.exact);
  assert.deepEqual(same.table.datasets.map((d) => d.name), ["Event", "No event"]);
  assert.deepEqual(same.renamed, ["Event!", "No event!"]);
});

test("names: normalised, equal or contained", () => {
  assert.equal(normName("Contingency example.csv"), "contingencyexample");
  assert.equal(nameScore("Contingency example.csv", "Contingency example"), 3);
  assert.equal(nameScore("Dose response (week 2)", "Dose response"), 2);
  assert.equal(nameScore("ab", "abc"), 0);
});

test("matching: one table and one source pair up", () => {
  const plan = planTables(project()).filter((t) => t.id === "d2");
  const m = matchTables(plan, [{ name: "anything", origin: "a.csv",
    source: csv([["", "E", "N"], ["a", "1", "2"], ["b", "3", "4"]]) }]);
  assert.deepEqual([...m.assign], [["d2", { source: 0, how: "only" }]]);
  assert.equal(m.ambiguous, false);
});

test("matching: by name first, then by shape; leftovers are reported", () => {
  const plan = planTables(project());
  const cont = csv([["", "Event", "No event"], ["Exposed", "25", "75"], ["Not exposed", "5", "95"]]);
  const byName = matchTables(plan, [{ name: "Contingency example", origin: "c.csv", source: cont }]);
  assert.deepEqual(byName.assign.get("d2"), { source: 0, how: "name" });
  const byShape = matchTables(plan, [
    { name: "plate 7", origin: "p7.csv", source: cont },
    { name: "weird", origin: "w.csv", source: "only text\nhere" },
  ]);
  assert.deepEqual(byShape.assign.get("d2"), { source: 0, how: "shape" });
  assert.deepEqual(byShape.unused, [1]);
});

test("matching: two sources of the same shape for one table stay ambiguous", () => {
  const plan = planTables(project());
  const cont = csv([["", "E", "N"], ["a", "1", "2"], ["b", "3", "4"]]);
  const m = matchTables(plan, [{ name: "x", origin: "x.csv", source: cont },
    { name: "y", origin: "y.csv", source: cont }]);
  assert.equal(m.assign.has("d2"), false);
  assert.equal(m.ambiguous, true);
});

test("replacing tables keeps every analysis, graph and layout", () => {
  const p = project();
  const fit = fitIncoming(contingency(), { name: "c", origin: "c.csv",
    source: csv([["", "Event", "No event"], ["Exposed", "25", "75"], ["Not exposed", "5", "95"]]) })!;
  const next = replaceTables(p, new Map([["d2", fit.table]]));
  assert.equal(next.sheets.length, p.sheets.length);
  assert.deepEqual(next.sheets.map((s) => s.id), p.sheets.map((s) => s.id));
  assert.deepEqual((next.sheets.find((s) => s.id === "d2") as DataSheet).table.datasets[0].rows,
    [["25"], ["5"]]);
  assert.equal(next.sheets.find((s) => s.id === "g1"), p.sheets.find((s) => s.id === "g1"));
  assert.equal(next.sheets.find((s) => s.id === "L1"), p.sheets.find((s) => s.id === "L1"));
});

test("the replay plan holds layouts but no values; it loads back as a project", () => {
  const p = project();
  const withCache = { ...p, sheets: p.sheets.map((s) => (s.kind === "results" ? { ...s, cached: { p: 0.03 } } : s)) };
  const plan = replayPlanOf(withCache);
  const text = JSON.stringify(plan);
  assert.ok(!text.includes("\"cached\""));
  assert.ok(!text.includes("\"85\""), "Y values cleared");
  const doc = { opendose_provenance: 1, families: [], replay_plan: plan };
  const loaded = planFromJson(JSON.parse(JSON.stringify(doc)), { prefs, ids });
  assert.equal(loaded.kind, "provenance");
  assert.equal(loaded.partial, undefined);
  const g = loaded.project.sheets.find((s) => s.id === "g1") as GraphSheet;
  assert.equal(g.settings.titles.y, "Response");
  assert.equal(g.resultsId, "r1");
  assert.ok(loaded.project.sheets.some((s) => s.kind === "layout" && s.id === "L1"));
  const d1 = loaded.project.sheets.find((s) => s.id === "d1") as DataSheet;
  assert.deepEqual(d1.table.x, ["-9", "-8", "-7"]);
  assert.equal(d1.table.datasets[0].rows[0].length, 3);
});

test("an older provenance file rebuilds tables, analyses with options and graphs", () => {
  const p = project();
  const deps = {
    analysisLabel: () => undefined,
    defaultOptions: () => ({}),
    resolveOptions: (_t: unknown, _a: unknown, raw: unknown) => raw,
    result: () => null,
  };
  const doc = projectProvenance(p, deps, { app: "OpenDose", engine: null, date: "2026-10-09" });
  const loaded = planFromJson(JSON.parse(JSON.stringify(doc)), { prefs, ids });
  assert.equal(loaded.partial, true);
  const r1 = loaded.project.sheets.find((s) => s.id === "r1") as ResultsSheet;
  assert.deepEqual(r1.options, { model: "4pl" });
  const g1 = loaded.project.sheets.find((s) => s.id === "g1") as GraphSheet;
  assert.equal(g1.resultsId, "r1");
  const d2 = loaded.project.sheets.find((s) => s.id === "d2") as DataSheet;
  assert.equal(d2.table.type, "contingency");
  assert.deepEqual(d2.table.datasets.map((d) => d.name), ["Event", "No event"]);
  // a project file is a plan too, with its results to compare against
  const asFile = planFromJson({ opendose_project: 2, version: 2, title: "t", prefs,
    sheets: [{ ...p.sheets[0] }, { ...p.sheets[1], cached: { a: 1 } }] }, { prefs, ids });
  assert.equal(asFile.kind, "project");
  assert.equal(asFile.hasResults, true);
  assert.throws(() => planFromJson({ hello: 1 }, { prefs, ids }));
});

// ------------------------------------------------------------ the diff

const fitResult = (logIC50: number, p: number) => ({
  analysis: "dose_response",
  datasets: [{ name: "Drug A", fit: { params: { LogIC50: { value: logIC50, se: 0.01, ci95: [logIC50 - 0.03, logIC50 + 0.03] } },
    curve: { x: Array.from({ length: 200 }, (_, i) => i), y: Array.from({ length: 200 }, (_, i) => i * logIC50) } } }],
  fisher_exact: { p, odds_ratio: 3.3 },
  proportions: { p1: 0.15 },
});

test("P keys are recognised; proportions p1/p2 are not P values", () => {
  for (const k of ["p", "P", "p_value", "p_adjusted", "p_two_sided", "adjusted_p", "p_logrank"]) {
    assert.ok(isPKey(k), k);
  }
  for (const k of ["p1", "p2", "power", "params", "pct"]) assert.ok(!isPKey(k), k);
});

test("flattening keys named items by name and skips curves", () => {
  const f = flattenNumbers(fitResult(-7, 0.03));
  assert.ok(f.has("datasets[Drug A].fit.params.LogIC50.value"));
  assert.ok(![...f.keys()].some((k) => k.includes("curve")));
  assert.equal(labelFor(f.get("datasets[Drug A].fit.params.LogIC50.value")!.segs), "Drug A · LogIC50");
  assert.equal(labelFor(f.get("datasets[Drug A].fit.params.LogIC50.ci95[0]")!.segs),
    "Drug A · LogIC50 · 95% CI lower");
  assert.equal(labelFor(f.get("fisher_exact.p")!.segs), "Fisher's exact · P");
  assert.equal(labelFor(["effect_size", "ci_cramers_v", "#0"]), "Effect size · Cramér's V CI lower");
  assert.equal(labelFor(["chi_square_yates", "p"]), "Chi-square (Yates) · P");
  assert.equal(labelFor(["pairs", "#2", "p_adjusted"]), "Pairs · Row 3 · P (adjusted)");
});

test("the diff lists P first, then fitted parameters, with both values", () => {
  const d = diffResults(fitResult(-7, 0.0317), fitResult(-6.9, 0.0012));
  assert.equal(d.changed.length, 4);
  const key = keyChanges(d, 2);
  assert.equal(key[0].kind, "p");
  assert.equal(key[0].label, "Fisher's exact · P");
  assert.equal(describeChange(key[0]), "0.0317 → 0.0012");
  assert.equal(key[1].kind, "param");
  assert.equal(describeChange(key[1]), "-7 → -6.9 (+1.4%)");
  assert.equal(diffResults(fitResult(-7, 0.03), fitResult(-7 + 1e-14, 0.03)).changed.length, 0);
  assert.equal(fmtNumber(1.0398e-7), "1.04e-7");
  assert.equal(fmtNumber(null), "none");
});

test("errors on either side are reported, not diffed", () => {
  const d = diffResults(fitResult(-7, 0.03), { error: "too few points" });
  assert.equal(d.afterError, "too few points");
  assert.equal(d.changed.length, 0);
});

test("the replay log names tables, changed numbers, kept graphs and leftovers", () => {
  const p = project();
  const cont = csv([["", "Event", "No event"], ["Exposed", "25", "75"], ["Not exposed", "5", "95"]]);
  const incoming = [{ name: "Contingency example", origin: "Contingency example.csv", source: cont },
    { name: "notes", origin: "notes.txt", source: "hello" }];
  const fit = fitIncoming(contingency(), incoming[0])!;
  const next = replaceTables(p, new Map([["d2", fit.table]]));
  const log = buildReplayLog({
    date: "2026-10-09T10:00:00.000Z", plan: "this project", project: next,
    replaced: [{ planId: "d2", origin: incoming[0].origin, fit }], incoming, unused: [1],
    before: new Map<string, unknown>([["r1", fitResult(-7, 0.5)], ["r2", fitResult(-7, 0.0317)]]),
    after: new Map<string, unknown>([["r1", fitResult(-7, 0.5)], ["r2", fitResult(-7, 0.00042)]]),
  });
  assert.deepEqual(log.tables.map((t) => [t.name, t.status]),
    [["Dose response", "kept"], ["Contingency example", "replaced"], ["Knockout", "kept"]]);
  const r2 = log.results.find((r) => r.id === "r2")!;
  assert.equal(r2.status, "changed");
  assert.deepEqual(r2.changes[0], { label: "Fisher's exact · P", text: `0.0317 → ${tableP(0.00042)}`, kind: "p" });
  assert.equal(log.results.find((r) => r.id === "r1")!.status, "same");
  assert.equal(log.graphs, 1);
  assert.equal(log.layouts, 1);
  const text = replayLogText(log);
  assert.match(text, /- Contingency example: new data from Contingency example.csv \(2 rows, 2 data sets\)/);
  assert.ok(text.includes("- Contingency of Contingency example: 1 number changed\n"
    + `    Fisher's exact · P: 0.0317 → ${tableP(0.00042)}`));
  assert.match(text, /- notes.txt: did not match any table/);
  assert.match(text, /1 graph and 1 page layout kept/);
});
