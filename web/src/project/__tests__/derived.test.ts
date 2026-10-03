// Derived tables (chains of analyses): link bookkeeping, sync writes
// outside undo history, unlink on delete, copies and file round trips.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chainOf, derivedFrom, derivedOutputs, linkDerived, makeDerivedSheet,
  producerOf, producerOrder, pruneDerivedLinks, unlinkDerived, writeDerivedTable,
} from "../derived.ts";
import { amend, commit, initHistory, undo, redo } from "../history.ts";
import { sequentialIds } from "../ids.ts";
import {
  deleteSheet, duplicateFamily, duplicateSheet, findSheet, makeDataSheet,
  makeProject, makeResultsSheet, repairLinks, updateTable,
} from "../ops.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { emptyTable, normalizeTable, setCell } from "../table.ts";
import type { DataSheet, Project, ResultsSheet } from "../types.ts";

const prefs = projectPrefs(DEFAULT_PREFS);

function table(vals: string[]) {
  return normalizeTable({
    type: "xy", x: vals.map((_, i) => String(i + 1)),
    datasets: [{ name: "A", rows: vals.map((v) => [v]) }],
  });
}

/** source d1 -> (r1 transform) -> d2 -> (r2 normalize) -> d3 */
function chain(): Project {
  return makeProject(prefs, [
    makeDataSheet("d1", "Raw", table(["1", "2"])),
    makeResultsSheet("r1", "d1", "transform", {}, "Transform of Raw"),
    makeDerivedSheet("d2", "Transformed Raw", table(["", ""]), { sourceId: "d1", resultsId: "r1" }),
    makeResultsSheet("r2", "d2", "normalize", {}, "Normalize of Transformed Raw"),
    makeDerivedSheet("d3", "Normalized", table(["", ""]), { sourceId: "d2", resultsId: "r2" }),
  ]);
}

test("lookups follow the chain both ways", () => {
  const p = chain();
  assert.deepEqual(derivedOutputs(p, "r1").map((s) => s.id), ["d2"]);
  assert.deepEqual(derivedFrom(p, "d2").map((s) => s.id), ["d3"]);
  assert.equal(producerOf(p, "d3")?.id, "r2");
  assert.equal(producerOf(p, "d1"), undefined);
  assert.deepEqual(chainOf(p, "d3").map((c) => [c.data.id, c.producer?.id ?? null]),
    [["d1", null], ["d2", "r1"], ["d3", "r2"]]);
});

test("producers run upstream first, whatever the sheet order", () => {
  const p = chain();
  const r1 = findSheet(p, "r1") as ResultsSheet;
  const r2 = findSheet(p, "r2") as ResultsSheet;
  assert.deepEqual(producerOrder(p, [r2, r1]).map((r) => r.id), ["r1", "r2"]);
});

test("derived tables refuse edits until unlinked", () => {
  const p = chain();
  const edited = updateTable(p, "d2", (t) => setCell(t, 0, 0, 0, "99"));
  assert.equal(edited, p);
  const free = unlinkDerived(p, "d2");
  assert.equal((findSheet(free, "d2") as DataSheet).derived, undefined);
  const now = updateTable(free, "d2", (t) => setCell(t, 0, 0, 0, "99"));
  assert.equal((findSheet(now, "d2") as DataSheet).table.datasets[0].rows[0][0], "99");
  // the downstream link is untouched
  assert.equal(producerOf(now, "d3")?.id, "r2");
});

test("writeDerivedTable replaces content, and is a no-op when unchanged", () => {
  const p = chain();
  const next = writeDerivedTable(p, "d2", table(["0", "0.301"]));
  assert.notEqual(next, p);
  assert.equal((findSheet(next, "d2") as DataSheet).table.datasets[0].rows[1][0], "0.301");
  assert.equal(writeDerivedTable(next, "d2", table(["0", "0.301"])), next);
  // ordinary and frozen tables are never overwritten
  assert.equal(writeDerivedTable(p, "d1", table(["5", "5"])), p);
  const frozen = { ...p, sheets: p.sheets.map((s) => (s.id === "d2" ? { ...s, frozen: true } : s)) };
  assert.equal(writeDerivedTable(frozen, "d2", table(["5", "5"])), frozen);
});

test("sync writes are not undo steps; undo restores the matching table", () => {
  let h = initHistory(writeDerivedTable(chain(), "d2", table(["0", "1"])));
  // the user edits the source ...
  h = commit(h, updateTable(h.present, "d1", (t) => setCell(t, 0, 0, 0, "10")), null, 1);
  // ... and the sync recomputes the derived table
  h = amend(h, writeDerivedTable(h.present, "d2", table(["10", "1"])));
  assert.equal(h.past.length, 1);
  assert.equal(amend(h, h.present), h);
  h = undo(h);
  assert.equal((findSheet(h.present, "d1") as DataSheet).table.datasets[0].rows[0][0], "1");
  assert.equal((findSheet(h.present, "d2") as DataSheet).table.datasets[0].rows[0][0], "0");
  h = redo(h);
  assert.equal((findSheet(h.present, "d2") as DataSheet).table.datasets[0].rows[0][0], "10");
});

test("deleting the producer or the source family unlinks, keeping values", () => {
  const p = writeDerivedTable(chain(), "d2", table(["7", "8"]));
  const noProducer = deleteSheet(p, "r1");
  const d2 = findSheet(noProducer, "d2") as DataSheet;
  assert.equal(d2.derived, undefined);
  assert.equal(d2.table.datasets[0].rows[0][0], "7");
  const noSource = deleteSheet(p, "d1");
  assert.equal(findSheet(noSource, "r1"), undefined);
  assert.equal((findSheet(noSource, "d2") as DataSheet).derived, undefined);
  assert.equal(producerOf(noSource, "d3")?.id, "r2"); // downstream still chained
});

test("copies of derived tables are plain data", () => {
  const ids = sequentialIds("c");
  const p = chain();
  const dup = duplicateSheet(p, "d2", ids);
  const copy = dup.sheets.find((s) => s.kind === "data" && s.name === "Transformed Raw copy") as DataSheet;
  assert.ok(copy);
  assert.equal(copy.derived, undefined);
  const fam = duplicateFamily(p, "d2", { name: "Second", withData: true }, ids);
  const root = fam.sheets.find((s) => s.name === "Second") as DataSheet;
  assert.equal(root.derived, undefined);
  // copying the source family copies the producer but not its output link
  const src = duplicateFamily(p, "d1", { name: "Raw 2", withData: true }, ids);
  const r1copy = src.sheets.find((s) => s.kind === "results" && s.parentId !== "d1"
    && s.analysis === "transform") as ResultsSheet;
  assert.ok(r1copy);
  assert.equal(derivedOutputs(src, r1copy.id).length, 0);
});

test("pruneDerivedLinks drops dangling or mismatched links", () => {
  const p = chain();
  assert.equal(pruneDerivedLinks(p), p);
  const bad = { ...p, sheets: p.sheets.map((s) => (s.id === "d3"
    ? { ...s, derived: { sourceId: "d1", resultsId: "r2" } } : s)) } as Project;
  assert.equal((findSheet(pruneDerivedLinks(bad), "d3") as DataSheet).derived, undefined);
  assert.equal((findSheet(repairLinks(bad), "d3") as DataSheet).derived, undefined);
});

test("linkDerived refuses cycles and producers on other tables", () => {
  const p = chain();
  assert.equal(linkDerived(p, "d1", { sourceId: "d2", resultsId: "r2" }), p);
  assert.equal(linkDerived(p, "d3", { sourceId: "d1", resultsId: "r2" }), p);
  const extra = { ...p, sheets: [...p.sheets, makeDataSheet("d9", "Loose", emptyTable("xy"))] };
  const linked = linkDerived(extra, "d9", { sourceId: "d1", resultsId: "r1" });
  assert.deepEqual((findSheet(linked, "d9") as DataSheet).derived, { sourceId: "d1", resultsId: "r1" });
});

test("derived links and simulation specs survive save and open", () => {
  const p = chain();
  p.sheets[0] = { ...(p.sheets[0] as DataSheet), simulation: { kind: "xy", seed: 42, form: { model: "m" } } };
  const back = parseProjectFile(serializeProject(p), { prefs, ids: sequentialIds("x") });
  assert.deepEqual((findSheet(back, "d3") as DataSheet).derived, { sourceId: "d2", resultsId: "r2" });
  assert.deepEqual((findSheet(back, "d1") as DataSheet).simulation,
    { kind: "xy", seed: 42, form: { model: "m" } });
  // a file whose producer is missing opens with the table unlinked
  const raw = JSON.parse(serializeProject(p));
  raw.sheets = raw.sheets.filter((s: { id: string }) => s.id !== "r2");
  const pruned = parseProjectFile(JSON.stringify(raw), { prefs, ids: sequentialIds("y") });
  assert.equal((findSheet(pruned, "d3") as DataSheet).derived, undefined);
});
