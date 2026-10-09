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
    "graphs/graph-of-dose-response.svg", "graphs/graph-of-dose-response.png",
    "methods.txt", "CITATION.txt",
  ]);
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
