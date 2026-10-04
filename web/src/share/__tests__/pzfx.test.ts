// .pzfx export selection and its place in the export bundle.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDataSheet, makeProject } from "../../project/ops.ts";
import { DEFAULT_PREFS } from "../../project/prefs.ts";
import { emptyTable } from "../../project/table.ts";
import { bundleFiles, type BundleInput } from "../bundle.ts";
import { exportPzfx, pzfxFileName, pzfxSelection } from "../pzfx.ts";

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
