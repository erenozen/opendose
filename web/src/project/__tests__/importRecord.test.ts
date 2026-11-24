// Import provenance (P-76): a table records the file it came from (name,
// SHA-256), the recipe or settings and the values as imported; hand edits
// since are counted; Apply to new data re-runs the recipe, and on the
// same file gives the table back byte for byte; older files load as they
// did. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { addSheets, makeDataSheet } from "../ops.ts";
import { sha256Hex } from "../../lib/sha256.ts";
import {
  cellsFingerprint, handEdits, handEditsText, importIntoSheet, makeImportRecord, parseImportRecord,
  SNAPSHOT_CELLS, withImportRecord, type ImportFacts,
} from "../importRecord.ts";
import { sequentialIds } from "../ids.ts";
import { findSheet, makeProject, updateTable } from "../ops.ts";
import { parseProjectFile, projectFromJson, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { matchTables, planTables, replaceTablesRecorded, replayFacts, replayPlanOf, type Reimport } from "../replay.ts";
import { emptyTable } from "../table.ts";
import type { DataSheet, DataTableModel, Project } from "../types.ts";
import { initialConfig, runPipeline } from "../../share/recipes/pipeline.ts";
import { parseSource, recipeById } from "../../share/recipes/presets.ts";
import { reimport, recipeMatrix, replayProblem, runPlain, runRecipe } from "../../share/recipes/reimport.ts";
import { normalizeSpec, specFromConfig, type PlainSpec, type RecipeSpec } from "../../share/recipes/saved.ts";
import { DEFAULT_FILTER, DEFAULT_SOURCE } from "../importText.ts";
import { shareJson } from "../../share/link.ts";
import { pzfxSelection } from "../../share/pzfx.ts";

const FIX = new URL("../../../e2e-fixtures/", import.meta.url);
const plateText = readFileSync(new URL("plate-reader.csv", FIX), "utf8");
// "next week's file": the same layout, other readings
const nextWeek = plateText.replace("1.623,1.584", "1.701,1.555").replace("0.248,0.163", "0.301,0.199");
const prefs = projectPrefs(DEFAULT_PREFS);
const ctx = () => ({ prefs, ids: sequentialIds("z") });
let nextId = 0;
/** A data table added to a project (app/factory's addFamily without the analyses). */
function addFamily(p: Project, table: DataTableModel, name: string) {
  const dataId = `d${++nextId}`;
  return { project: addSheets(p, [makeDataSheet(dataId, name, table)]), dataId };
}

/** The plate recipe, as the recipe dialog runs it with its proposal. */
function plateImport(text: string) {
  const staged = recipeById("plate").stage(parseSource(text));
  const cfg = initialConfig(staged);
  const out = runPipeline(staged.staging, cfg, { wellColumn: staged.wells?.column, yTitle: staged.yTitle });
  return { table: out.result!.table, spec: specFromConfig(staged, cfg) };
}

async function plateProject(): Promise<{ p: Project; dataId: string; spec: RecipeSpec }> {
  const { table, spec } = plateImport(plateText);
  const r = addFamily(makeProject(prefs, [], "Plates"), table, "Plate");
  const facts: ImportFacts = {
    at: "2026-11-24T10:00:00.000Z", how: "recipe", mode: "new", basis: "Plate reader grid (8 × 12 or 16 × 24)",
    sources: [{ name: "plate-reader.csv", bytes: Buffer.byteLength(plateText), sha256: await sha256Hex(plateText) }],
    spec: JSON.parse(JSON.stringify(spec)), replayable: true,
  };
  const p = { ...r.project, sheets: r.project.sheets.map((s) => (s.id === r.dataId
    ? withImportRecord(s as DataSheet, facts) : s)) };
  return { p, dataId: r.dataId, spec };
}

const dataOf = (p: Project, id: string) => findSheet(p, id) as DataSheet;
const reimportFn: Reimport = (plan, src) => (plan.imported && src.source !== undefined
  ? reimport(plan.imported, src.source, plan.table) : null);

test("the file's SHA-256 is Web Crypto's, the same as node's", async () => {
  const bytes = readFileSync(new URL("plate-reader.csv", FIX));
  assert.equal(await sha256Hex(new Uint8Array(bytes)), createHash("sha256").update(bytes).digest("hex"));
  // pasted text: the UTF-8 bytes of the text
  assert.equal(await sha256Hex("µM,1\n"), createHash("sha256").update(Buffer.from("µM,1\n", "utf8")).digest("hex"));
});

test("replaying a recorded recipe on its own file reproduces the table byte for byte", async () => {
  const { p, dataId, spec } = await plateProject();
  const before = dataOf(p, dataId).table;
  // the spec as the file stores it, read back
  const back = normalizeSpec(JSON.parse(JSON.stringify(spec))) as RecipeSpec;
  assert.equal(JSON.stringify(runRecipe(recipeMatrix(plateText), back)), JSON.stringify(before));
  // through Apply to new data: matched, re-run, written back
  const plan = planTables(p);
  const m = matchTables(plan, [{ name: "plate-reader", origin: "plate-reader.csv", source: plateText }], reimportFn);
  const fit = m.fits[0][0]!;
  assert.ok(fit.rerun && fit.exact);
  const facts = replayFacts(plan[0], { name: "plate-reader", origin: "plate-reader.csv", source: plateText,
    file: dataOf(p, dataId).imported!.sources[0] }, fit, "2026-11-25T00:00:00.000Z");
  const q = replaceTablesRecorded(p, new Map([[dataId, fit.table]]), facts ? new Map([[dataId, facts]]) : new Map());
  assert.equal(JSON.stringify(dataOf(q, dataId).table), JSON.stringify(before));
});

test("one cell edited by hand is counted and named; the record survives the file and a share link", async () => {
  const { p, dataId } = await plateProject();
  const edited = updateTable(p, dataId, (t) => ({ ...t, datasets: t.datasets.map((d, i) => (i === 2
    ? { ...d, rows: d.rows.map((r, j) => (j === 1 ? ["9.99", ...r.slice(1)] : r)) } : d)) }));
  const s = dataOf(edited, dataId);
  const e = handEdits(s.imported!, s.table);
  assert.equal(e.count, 1);
  assert.equal(handEditsText(e), "1 cell edited by hand");
  assert.equal(e.cells[0].after, "9.99");
  assert.match(e.cells[0].where, /^3, row 2/);
  // saved and reopened, and through a share link: the same record
  const reopened = parseProjectFile(serializeProject(edited), ctx());
  const r2 = (reopened.sheets.find((x) => x.kind === "data") as DataSheet).imported!;
  assert.deepEqual(r2, s.imported);
  assert.equal(handEdits(r2, s.table).count, 1);
  const linked = projectFromJson(JSON.parse(shareJson(edited)), ctx());
  assert.deepEqual((linked.sheets.find((x) => x.kind === "data") as DataSheet).imported, s.imported);
  // the hash and file name as recorded
  assert.equal(r2.sources[0].sha256, createHash("sha256").update(plateText).digest("hex"));
  assert.equal(r2.sources[0].name, "plate-reader.csv");
});

test("Apply to new data with next week's file re-runs the recipe and records the new file", async () => {
  const { p, dataId } = await plateProject();
  const edited = updateTable(p, dataId, (t) => ({ ...t, x: t.x.map((v, i) => (i === 0 ? "0.5" : v)) }));
  const plan = planTables(edited);
  const src = { name: "plate-week2", origin: "plate-week2.csv", source: nextWeek,
    file: { name: "plate-week2.csv", bytes: Buffer.byteLength(nextWeek), sha256: await sha256Hex(nextWeek) } };
  const m = matchTables(plan, [src], reimportFn);
  const fit = m.fits[0][0]!;
  assert.ok(fit.rerun);
  // the recipe's table of the new file, in the table's layout
  assert.deepEqual(fit.table.datasets.map((d) => d.rows), plateImport(nextWeek).table.datasets.map((d) => d.rows));
  const facts = replayFacts(plan[0], src, fit, "2026-12-01T09:00:00.000Z");
  assert.equal(facts.how, "recipe");
  const q = replaceTablesRecorded(edited, new Map([[dataId, fit.table]]), new Map([[dataId, facts]]));
  const rec = dataOf(q, dataId).imported!;
  assert.equal(rec.sources[0].name, "plate-week2.csv");
  assert.equal(rec.basis, "Plate reader grid (8 × 12 or 16 × 24)");
  assert.equal(handEdits(rec, dataOf(q, dataId).table).count, 0);
  // the earlier import, with the one hand edit made after it
  assert.equal(rec.earlier?.length, 1);
  assert.equal(rec.earlier![0].sources[0].name, "plate-reader.csv");
  assert.equal(rec.earlier![0].editedCells, 1);
  // a file the recipe cannot read is refused with the recipe's reason
  const bad = matchTables(plan, [{ name: "junk", origin: "junk.csv", source: "no,plate\nhere,at all\n" }], reimportFn);
  assert.equal(bad.fits[0][0], null);
  assert.match(bad.errors[0][0] ?? "", /No plate block/);
});

test("the plain Import dialog's settings re-run to the same table; an append is not replayable", async () => {
  const csv = "Dose;Response\n0,1;98,5\n1;50,2\n10;12,0\n";
  const spec: PlainSpec = { kind: "plain", source: { ...DEFAULT_SOURCE, titlesRow: true },
    filter: DEFAULT_FILTER, roles: {}, place: { mode: "replace", perDataset: 1, useTitles: true } };
  const t1 = runPlain(csv, spec, emptyTable("xy"));
  assert.deepEqual(t1.x, ["0.1", "1", "10"]);
  assert.equal(JSON.stringify(runPlain(csv, spec, emptyTable("xy"))), JSON.stringify(t1));
  const sha = await sha256Hex(csv);
  const base: ImportFacts = { at: "", how: "import", mode: "new", basis: "Plain import",
    sources: [{ name: "a.csv", bytes: csv.length, sha256: sha }], spec: spec as unknown as Record<string, unknown>,
    replayable: true };
  const r = addFamily(makeProject(prefs), t1, "A");
  const p = { ...r.project, sheets: r.project.sheets.map((s) => (s.id === r.dataId ? withImportRecord(s as DataSheet, base) : s)) };
  assert.equal(replayProblem(dataOf(p, r.dataId).imported!), "");
  const again = reimport(dataOf(p, r.dataId).imported!, csv, t1);
  assert.ok(again && "table" in again && JSON.stringify(again.table) === JSON.stringify(t1));
  // rows appended from a second file: recorded, not replayable, the first import kept
  const q = importIntoSheet(p, r.dataId, (t) => ({ ...t, x: [...t.x, "100"],
    rowTitles: [...t.rowTitles, ""], datasets: t.datasets.map((d) => ({ ...d, rows: [...d.rows, ["3,1"]] })) }),
  { ...base, mode: "append", sources: [{ name: "b.csv", bytes: 9, sha256: sha }] });
  const rec = dataOf(q, r.dataId).imported!;
  assert.equal(rec.replayable, false);
  assert.match(replayProblem(rec), /rows were added/);
  assert.equal(rec.earlier?.[0].sources[0].name, "a.csv");
  assert.equal(rec.earlier?.[0].editedCells, 0);
});

test("a table too large to copy keeps only its fingerprint", () => {
  const rows = Math.ceil(SNAPSHOT_CELLS / 3) + 10;
  const t: DataTableModel = { ...emptyTable("column"), x: Array(rows).fill(""), rowTitles: Array(rows).fill(""),
    datasets: [{ name: "A", rows: Array.from({ length: rows }, (_, i) => [String(i)]) }] };
  const rec = makeImportRecord(t, { at: "", how: "import", mode: "new", basis: "Plain import",
    sources: [{ name: "big.csv", bytes: 1, sha256: "0".repeat(64) }], replayable: true });
  assert.equal(rec.snapshot, undefined);
  assert.equal(handEdits(rec, t).count, 0);
  const t2 = { ...t, datasets: [{ ...t.datasets[0], rows: t.datasets[0].rows.map((r, i) => (i === 7 ? ["x"] : r)) }] };
  assert.notEqual(cellsFingerprint(t2), cellsFingerprint(t));
  const e = handEdits(rec, t2);
  assert.deepEqual([e.changed, e.count], [true, null]);
  assert.match(handEditsText(e), /too many cells to count/);
});

test("records read from a file are checked; garbage is dropped, not trusted", () => {
  assert.equal(parseImportRecord(null), null);
  assert.equal(parseImportRecord({ how: "recipe", mode: "new", cells: "x", sources: [{ name: "a", sha256: "nothex" }] }), null);
  assert.equal(parseImportRecord({ how: "evil", mode: "new", cells: "x", sources: [{ name: "a", sha256: "a".repeat(64) }] }), null);
  const ok = parseImportRecord({ how: "import", mode: "replace", cells: "fnv1a32x2:00", replayable: "yes",
    sources: [{ name: "a.csv", sha256: "A".repeat(64), bytes: -3 }], snapshot: { x: [1], rowTitles: [], y: [] } });
  assert.ok(ok);
  assert.equal(ok!.sources[0].sha256, "a".repeat(64));
  assert.equal(ok!.sources[0].bytes, 0);
  assert.equal(ok!.replayable, false);
  assert.equal(ok!.snapshot, undefined);
});

test("a project saved before import records opens unchanged", () => {
  // e2e-fixtures/project-study.json was saved before P-76
  const text = readFileSync(new URL("project-study.json", FIX), "utf8");
  assert.ok(!text.includes("\"imported\""));
  const p = parseProjectFile(text, ctx());
  assert.ok(p.sheets.every((s) => s.kind !== "data" || s.imported === undefined));
  const again = serializeProject(p);
  assert.ok(!again.includes("\"imported\""));
  assert.equal(serializeProject(parseProjectFile(again, ctx())), again);
});

test("the replay plan keeps the settings, not the copy of the values; .pzfx export is unchanged", async () => {
  const { p, dataId } = await plateProject();
  const plan = replayPlanOf(p) as { sheets: Record<string, unknown>[] };
  const data = plan.sheets.find((s) => s.id === dataId) as { imported?: Record<string, unknown> };
  assert.ok(data.imported?.spec);
  assert.equal(data.imported?.snapshot, undefined);
  // the .pzfx file holds the table, never the record
  const plain = { ...p, sheets: p.sheets.map((s) => (s.kind === "data" ? { ...s, imported: undefined } : s)) };
  assert.equal(JSON.stringify(pzfxSelection(p)), JSON.stringify(pzfxSelection(plain)));
});
