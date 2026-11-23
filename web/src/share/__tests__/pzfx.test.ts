// .pzfx export selection and its place in the export bundle.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDataSheet, makeInfoSheet, makeProject } from "../../project/ops.ts";
import { emptyPlan } from "../../project/plan.ts";
import { DEFAULT_PREFS } from "../../project/prefs.ts";
import { emptyTable } from "../../project/table.ts";
import { bundleFiles, type BundleInput } from "../bundle.ts";
import { exportPzfx, infoSheetsFromPrism, planText, pzfxFileName, pzfxSelection } from "../pzfx.ts";

const project = () => makeProject(DEFAULT_PREFS, [
  makeDataSheet("a", "Doses", emptyTable("xy", { subcolumnFormat: "mean_sd_n" })),
  makeDataSheet("b", "Cells", emptyTable("multivariable")),
  makeDataSheet("c", "Limits", emptyTable("column", { subcolumnFormat: "upper_lower" })),
  makeDataSheet("d", "Survival", { ...emptyTable("survival"),
    datasets: emptyTable("survival").datasets.map((x) => ({ ...x, rows: x.rows.map((r) => [...r, ""]) })) }),
], "Study");

test("exportable tables, with what is lost", () => {
  const s = pzfxSelection(project());
  assert.deepEqual(s.tables.map((t) => t.title), ["Doses", "Limits", "Survival"]);
  assert.equal(s.skipped.length, 1);
  assert.match(s.skipped[0], /Cells/);
  assert.equal(s.notes.length, 2);
  assert.match(s.notes.join(" "), /Limits.*plain values/);
  assert.match(s.notes.join(" "), /covariate columns/);
  assert.deepEqual(pzfxSelection(project(), "a").tables.map((t) => t.title), ["Doses"]);
  assert.equal(pzfxFileName("My study: 2026"), "my-study-2026.pzfx");
});

test("export call and its errors", () => {
  const sel = pzfxSelection(project(), "a");
  let sent: unknown = null;
  const ok = exportPzfx({ analyze: (p) => { sent = p; return { xml: "<x/>", warnings: [] }; } }, sel);
  assert.deepEqual(ok, { xml: "<x/>", messages: [] });
  assert.equal((sent as { analysis: string }).analysis, "pzfx_export");
  const none = exportPzfx({ analyze: () => ({}) }, pzfxSelection(project(), "b"));
  assert.match((none as { error: string }).error, /Nothing to export/);
});

test("the bundle lists data.pzfx when there is one", () => {
  const b: BundleInput = {
    title: "S", projectJson: "{}", tables: [], results: [], graphs: [], methods: [],
    citation: { plain: "c", bibtex: "b" }, app: "OpenDose", libraries: "SciPy", date: "2026-10-04T00:00:00Z",
    skipped: [], pzfx: "<GraphPadPrismFile/>",
  };
  const names = bundleFiles(b).map((f) => f.name);
  assert.ok(names.includes("data.pzfx"));
  assert.ok(!bundleFiles({ ...b, pzfx: undefined }).map((f) => f.name).includes("data.pzfx"));
});

// ---- P-59: info sheets (constants, notes, analysis plan) as Prism Info sheets
const withInfo = () => {
  const p = project();
  const own = { ...makeInfoSheet("i1", "Project info"), notes: "Viability after 48 h.",
    constants: [{ name: "Cell line", value: "HeLa" }, { name: "Experiment ID", value: "" }, { name: " ", value: "x" }] };
  const blank = makeInfoSheet("i2", "Info 2");
  const plan = { ...emptyPlan("2026-11-02T10:00:00Z"), primaryOutcome: "Viability (%)", nPerGroup: 6,
    exclusionRule: "Wells with a lid fault", locked: true, lockedAt: "2026-11-03T08:00:00Z" };
  const linked = { ...makeInfoSheet("i3", "Analysis plan: Doses", "a"), plan };
  const other = { ...makeInfoSheet("i4", "Notes on Limits", "c"), notes: "Upper limits only." };
  return { ...p, sheets: [...p.sheets, own, blank, linked, other] };
};

test("P-59: info sheets go into the export; empty ones are left out", () => {
  const s = pzfxSelection(withInfo());
  assert.deepEqual(s.info.map((i) => i.title), ["Project info", "Analysis plan: Doses", "Notes on Limits"]);
  assert.deepEqual(s.info[0], { title: "Project info", notes: "Viability after 48 h.",
    constants: [{ name: "Cell line", value: "HeLa" }, { name: "Experiment ID", value: "" }] });
  // one table: the project's own sheets and that table's, not another table's
  assert.deepEqual(pzfxSelection(withInfo(), "a").info.map((i) => i.title), ["Project info", "Analysis plan: Doses"]);
  // the plan is written as text into the notes
  assert.equal(s.info[1].notes, [
    "Analysis plan (written 2026-11-02, locked 2026-11-03)",
    "Primary outcome: Viability (%)",
    "Test: two-tailed Welch t test, n = 6 per group",
    "Exclusions: Wells with a lid fault",
    "α = 0.05",
  ].join("\n"));
  assert.equal(planText(emptyPlan("2026-11-02T10:00:00Z")).split("\n")[0],
    "Analysis plan (written 2026-11-02, not locked)");
});

test("P-59: the export sends the info sheets and says which are in the file", () => {
  let sent: { data: { info: unknown } } | null = null;
  const r = exportPzfx({ analyze: (p) => { sent = p as typeof sent; return { xml: "<x/>" }; } },
    pzfxSelection(withInfo(), "a"));
  assert.deepEqual(sent!.data.info, pzfxSelection(withInfo(), "a").info);
  assert.deepEqual((r as { messages: string[] }).messages,
    ["Info sheets in it: “Project info”, “Analysis plan: Doses”"]);
});

test("P-59: Prism Info sheets open as project info sheets; empty ones are skipped", () => {
  let n = 0;
  const ids = () => `n${++n}`;
  const p = infoSheetsFromPrism(project(), [
    { title: "Project info 1", notes: "Two lines\nof notes", constants: [{ name: "Cell line", value: "HeLa" },
      { name: "Experiment ID", value: "" }] },
    { title: "Project info 1", notes: "", constants: [] },
    { title: "Project info 1", notes: "Second", constants: [] },
  ], ids);
  const info = p.sheets.filter((s) => s.kind === "info");
  assert.deepEqual(info.map((s) => [s.name, s.kind === "info" && s.parentId, s.kind === "info" && s.notes]),
    [["Project info 1", null, "Two lines\nof notes"], ["Project info 1 (2)", null, "Second"]]);
  assert.deepEqual(info[0].kind === "info" && info[0].constants,
    [{ name: "Cell line", value: "HeLa" }, { name: "Experiment ID", value: "" }]);
  assert.equal(infoSheetsFromPrism(project(), undefined, ids).sheets.length, project().sheets.length);
});
