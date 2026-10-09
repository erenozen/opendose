// "Convert Prism files to CSV…": zip layout, CSV contents and README.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { emptyTable, setCell } from "../../project/table.ts";
import { base64Of, prismCsvZip } from "../prismBatch.ts";

const table = () => {
  let t = emptyTable("column", { datasets: 2, rows: 2 });
  t = { ...t, datasets: t.datasets.map((d, i) => ({ ...d, name: ["Ctrl", "Drug"][i] })) };
  return setCell(setCell(t, 0, 0, 0, "1.5"), 1, 1, 0, "2");
};

test("one folder per file, one CSV per table, README listing both and the failures", () => {
  const out = prismCsvZip([
    { name: "Study A.prism", tables: [{ title: "Weights", table_type: "OneWay" },
      { title: "Weights", table_type: "OneWay" }] },
    { name: "study-b.pzfx", tables: [{ title: "", table_type: "OneWay" }] },
    { name: "broken.pzfx", tables: [], error: "not a Prism file" },
  ], () => table(), "2026-10-09");
  assert.equal(out.tables, 3);
  assert.equal(out.files, 2);
  assert.deepEqual(out.failed, ["broken.pzfx: not a Prism file"]);
  const z = unzipSync(out.zip);
  assert.deepEqual(Object.keys(z).sort(), ["README.txt", "study-a/weights-2.csv",
    "study-a/weights.csv", "study-b/table-1.csv"]);
  const csv = strFromU8(z["study-a/weights.csv"]);
  assert.match(csv.split(/\r?\n/)[0], /Ctrl.*Drug/);
  assert.match(csv, /1\.5/);
  const readme = strFromU8(z["README.txt"]);
  assert.match(readme, /converted to CSV by OpenDose, 2026-10-09/);
  assert.match(readme, /analyses are\s+recomputed there|recomputed there/);
  assert.match(readme, /Not converted:\n {2}broken\.pzfx: not a Prism file/);
});

test("base64 of bytes matches Buffer's", () => {
  const bytes = new Uint8Array(70000).map((_, i) => i % 251);
  assert.equal(base64Of(bytes), Buffer.from(bytes).toString("base64"));
});
