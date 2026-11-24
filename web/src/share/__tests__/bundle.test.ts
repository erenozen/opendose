// Export bundle assembly: entry names, README contents, zip round trip.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { setReasons } from "../../project/exclusions.ts";
import { emptyTable, setCell, toggleExcluded } from "../../project/table.ts";
import { bundleFiles, withReplayPlan, zipBundle, type BundleInput } from "../bundle.ts";

function input(): BundleInput {
  let t = emptyTable("column", { datasets: 2, rows: 2 });
  t = setCell(setCell(t, 0, 0, 0, "1.5"), 1, 1, 0, "2");
  return {
    title: "My study",
    projectJson: "{\"opendose_project\":2}",
    tables: [{ name: "Dose response", table: t }, { name: "Dose response", table: t }],
    results: [{ name: "Column stats of Dose response", analysis: "Column statistics",
      data: "Dose response", matrix: [["", "Group A"], ["Mean", "1.5"]] }],
    graphs: [{ name: "Graph of Dose response", svg: "<svg/>", png: new Uint8Array([137, 80]) }],
    methods: [{ name: "Column stats of Dose response", text: "Analyses were performed in OpenDose." }],
    citation: { plain: "Ozen E. OpenDose.", bibtex: "@software{opendose}" },
    app: "OpenDose 0.2.0 (build abc, 2026-10-04)",
    libraries: "SciPy 1.14.1 and NumPy 2.0.2",
    date: "2026-10-04T10:20:30.000Z",
    skipped: [],
  };
}

test("bundle lists every part under predictable names", () => {
  const names = bundleFiles(input()).map((f) => f.name);
  assert.deepEqual(names, [
    "README.txt", "project.json",
    "data/dose-response.csv", "data/dose-response.long.csv",
    "data/dose-response-2.csv", "data/dose-response-2.long.csv",
    "results/column-stats-of-dose-response.csv",
    "workbook.xlsx",
    "graphs/graph-of-dose-response.svg", "graphs/graph-of-dose-response.png",
    "methods.txt", "CITATION.txt",
  ]);
});

test("workbook.xlsx holds the tables and results as the CSVs do, numbers as numbers (P-64)", () => {
  const files = bundleFiles(input());
  const z = unzipSync(files.find((f) => f.name === "workbook.xlsx")!.data);
  const names = [...strFromU8(z["xl/workbook.xml"]).matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["README", "Dose response", "Dose response (2)", "Column stats of Dose response"]);
  const sheet2 = strFromU8(z["xl/worksheets/sheet2.xml"]);
  assert.match(sheet2, /<c r="B2"><v>1.5<\/v><\/c>/);
  assert.match(sheet2, /<c r="C3"><v>2<\/v><\/c>/);
  assert.match(strFromU8(z["xl/worksheets/sheet4.xml"]), /<c r="B2"><v>1.5<\/v><\/c>/);
  // a workbook that cannot be written is named in the README with the reason
  const tall = emptyTable("column", { datasets: 1, rows: 1048576 });
  tall.datasets[0].rows = tall.datasets[0].rows.map(() => ["1"]);
  const big = { ...input(), tables: [{ name: "Huge", table: tall }] };
  const out = bundleFiles(big);
  assert.ok(!out.some((f) => f.name === "workbook.xlsx"));
  assert.match(strFromU8(out[0].data), /workbook\.xlsx: “Huge” has 1,048,577 rows; an Excel worksheet holds 1,048,576\./);
});

test("README names the software versions and each file", () => {
  const files = bundleFiles({ ...input(), skipped: ["Graph 2"] });
  const readme = strFromU8(files[0].data);
  assert.match(readme, /OpenDose 0\.2\.0 \(build abc, 2026-10-04\)/);
  assert.match(readme, /SciPy 1\.14\.1 and NumPy 2\.0\.2/);
  for (const f of files.slice(1)) assert.ok(readme.includes(f.name), f.name);
  assert.match(readme, /Not included[\s\S]*Graph 2/);
});

test("tidy CSV is long, wide CSV is the grid; zip round-trips", () => {
  const files = bundleFiles(input());
  const long = strFromU8(files.find((f) => f.name === "data/dose-response.long.csv")!.data);
  assert.equal(long, "Group,Replicate,Value,excluded,exclusion_reason\r\nGroup A,1,1.5,FALSE,\r\nGroup B,2,2,FALSE,\r\n");
  const wide = strFromU8(files.find((f) => f.name === "data/dose-response.csv")!.data);
  assert.equal(wide, "Row title,Group A,Group B\r\n,1.5,\r\n,,2\r\n");
  const back = unzipSync(zipBundle(files));
  assert.deepEqual(Object.keys(back), files.map((f) => f.name));
  assert.deepEqual([...back["graphs/graph-of-dose-response.png"]], [137, 80]);
});

test("provenance.json carries the replay plan when there is one", () => {
  const plan = { opendose_project: 2, version: 2, sheets: [] };
  const files = bundleFiles({ ...input(), provenance: "{\"opendose_provenance\":1,\"families\":[]}",
    replayPlan: plan });
  const prov = JSON.parse(strFromU8(files.find((f) => f.name === "provenance.json")!.data));
  assert.equal(prov.opendose_provenance, 1);
  assert.deepEqual(prov.replay_plan, plan);
  assert.match(strFromU8(files[0].data), /replay_plan re-applies/);
  assert.equal(withReplayPlan("{\"a\":1}"), "{\"a\":1}");
  assert.equal(withReplayPlan("not json", plan), "not json");
});

test("tidy CSV keeps excluded values with their reason (source data)", () => {
  const base = input();
  const ref = { kind: "y", dataset: 1, row: 1, sub: 0 } as const;
  const t = setReasons(toggleExcluded(base.tables[0].table, ref), [ref], "tumour ulceration, day 12");
  const files = bundleFiles({ ...base, tables: [{ name: "Dose response", table: t }] });
  const long = strFromU8(files.find((f) => f.name === "data/dose-response.long.csv")!.data);
  assert.equal(long, "Group,Replicate,Value,excluded,exclusion_reason\r\n"
    + "Group A,1,1.5,FALSE,\r\nGroup B,2,2,TRUE,\"tumour ulceration, day 12\"\r\n");
});

test("graphs as PDF and layout pages as PDF and SVG (P-63); the README lists every file", () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 45]); // "%PDF-"
  const files = bundleFiles({
    ...input(),
    graphs: [{ name: "Graph of Dose response", svg: "<svg/>", png: new Uint8Array([137, 80]), pdf }],
    layouts: [{ name: "Layout 1", svg: "<svg/>", pdf, sourceData: new Uint8Array([80, 75]) },
      { name: "Figure 2: dose", svg: null, pdf: null }],
    skipped: ["Figure 2: dose"],
  });
  const names = files.map((f) => f.name);
  assert.deepEqual(names.filter((n) => /^(graphs|layouts)\//.test(n)), [
    "graphs/graph-of-dose-response.svg", "graphs/graph-of-dose-response.png",
    "graphs/graph-of-dose-response.pdf",
    "layouts/layout-1.pdf", "layouts/layout-1.svg", "layouts/layout-1-source-data.xlsx",
  ]);
  const readme = strFromU8(files[0].data);
  for (const n of names) assert.ok(readme.includes(`\n${n}\n`), `README lists ${n}`);
  assert.match(readme, /layouts\/layout-1\.pdf\n {4}Page layout "Layout 1" as a vector PDF/);
  assert.match(readme, /layouts\/layout-1-source-data\.xlsx\n {4}Source data of page layout "Layout 1": a sheet per panel letter/);
  assert.match(readme, /Not included[\s\S]*Figure 2: dose/);
  // PDFs are stored as they are (already compressed) and round-trip
  const back = unzipSync(zipBundle(files));
  assert.deepEqual([...back["layouts/layout-1.pdf"]], [...pdf]);
  // without PDFs (a bundle made before, or a graph that failed) nothing changes
  assert.deepEqual(bundleFiles(input()).map((f) => f.name).filter((n) => n.endsWith(".pdf")), []);
});
