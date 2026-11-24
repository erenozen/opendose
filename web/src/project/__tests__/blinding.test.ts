// Blinding a table (P-124): the group names become codes everywhere the
// project goes (file, share link, replay plan, provenance, .pzfx), the
// key stays outside it, values and exclusions are untouched, and an
// exclusion made while blind is recorded and reported once unblinded.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blindProblem, blindTable, blindingMethodsSentence, codeFor, codesText, leakScan, parseBlinding,
  parseKey, serializeKey, unblindTable, type BlindingKey,
} from "../blinding.ts";
import { makeImportRecord } from "../importRecord.ts";
import { sequentialIds } from "../ids.ts";
import { addSheets, makeDataSheet, makeGraphSheet, makeProject, makeResultsSheet, updateTable } from "../ops.ts";
import { parseProjectFile, projectFromJson, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { replayPlanOf } from "../replay.ts";
import { normalizeTable, toggleExcluded } from "../table.ts";
import { setReasons } from "../exclusions.ts";
import type { DataSheet, Project } from "../types.ts";
import { shareJson } from "../../share/link.ts";
import { pzfxSelection } from "../../share/pzfx.ts";
import { projectProvenance } from "../../report/provenance.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const NAMES = ["Vehicle", "Low dose", "High dose", "Positive control"];

function project(): Project {
  const table = normalizeTable({
    type: "column",
    datasets: NAMES.map((name, i) => ({ name, rows: [["10"], ["11"], ["12"], [String(13 + i)]].map((r) => [String(Number(r[0]) + i * 2)]) })),
  });
  const data = { ...makeDataSheet("d1", "Weights", table),
    imported: makeImportRecord(table, { at: "2026-11-20T00:00:00.000Z", how: "recipe", mode: "new", basis: "Long (tidy) table",
      sources: [{ name: "w.csv", bytes: 9, sha256: "a".repeat(64) }],
      spec: { kind: "recipe", recipe: "tidy", plateMap: { A1: { role: "sample", compound: "Vehicle" } } }, replayable: true }) };
  const res = { ...makeResultsSheet("r1", "d1", "column_anova", { comparisons: "dunnett", controlIndex: 0, controlGroup: "Vehicle" },
    "ANOVA of Weights"), cached: { names: NAMES, p: 0.01 }, cachedKey: "k" };
  const graph = makeGraphSheet("g1", "d1", "r1", "scatter", { titles: { x: "", y: "" }, scheme: "okabe-ito",
    format: { annotations: [{ kind: "text", text: "High dose works best" }, { kind: "text", text: "Low dose" }] } } as never, "Graph of Weights");
  const p = addSheets(makeProject(prefs, [], "Study"), [data, res, graph]);
  return { ...p, groupColors: [{ name: "vehicle", color: "#000000" }, { name: "Other", color: "#ffffff" }] };
}

const AT = "2026-11-24T09:00:00.000Z";
const data = (p: Project) => p.sheets.find((s) => s.id === "d1") as DataSheet;
const deps = {
  analysisLabel: () => "One-way ANOVA", defaultOptions: () => ({}), resolveOptions: (_t: unknown, _i: unknown, raw: unknown) => raw,
  result: () => null,
};

function blinded(): { p: Project; key: BlindingKey } {
  const r = blindTable(project(), "d1", { id: "blind-1", at: AT });
  assert.ok(!("error" in r));
  return { p: r.project, key: r.key };
}

test("codes run A … Z, AA, AB; ranges read A to D", () => {
  assert.deepEqual([0, 3, 25, 26, 27, 52].map(codeFor), ["A", "D", "Z", "AA", "AB", "BA"]);
  assert.equal(codesText(["A", "B", "C", "D"]), "A to D");
  assert.equal(codesText(["A", "B"]), "A and B");
});

test("blinding: the names become A to D; the key holds them, the project does not", () => {
  const { p, key } = blinded();
  assert.deepEqual(data(p).table.datasets.map((d) => d.name), ["A", "B", "C", "D"]);
  assert.deepEqual(key.names, NAMES.map((name, i) => ({ code: codeFor(i), name })));
  // an option value that is a name is coded; prose is not touched
  const res = p.sheets.find((s) => s.id === "r1")!;
  assert.equal((res as { options: { controlGroup: string } }).options.controlGroup, "A");
  assert.equal((res as { cached?: unknown }).cached, undefined);
  // the import record (its plate map names a group) and the pinned colour go with the key
  assert.equal(data(p).imported, undefined);
  assert.ok(key.imported);
  assert.deepEqual(p.groupColors, [{ name: "Other", color: "#ffffff" }]);
  assert.deepEqual(key.pins, [{ name: "vehicle", color: "#000000" }]);
  // no name in the file, a share link, the replay plan, provenance.json or the .pzfx selection
  const ctx = { prefs, ids: sequentialIds("z") };
  const outputs = {
    file: serializeProject(p), link: shareJson(p), plan: JSON.stringify(replayPlanOf(p)),
    provenance: JSON.stringify(projectProvenance(p, deps, { app: "x", engine: null, date: AT })),
    pzfx: JSON.stringify(pzfxSelection(p)),
    reopened: serializeProject(parseProjectFile(serializeProject(p), ctx)),
  };
  for (const [what, text] of Object.entries(outputs)) {
    for (const n of ["Vehicle", "Low dose", "Positive control"]) {
      assert.ok(!text.toLowerCase().includes(n.toLowerCase()), `${what} names ${n}`);
    }
  }
  // prose in the graph still names a group (the dialog lists it first); an annotation that is a name is coded
  assert.ok(outputs.file.includes("High dose"));
  assert.deepEqual(leakScan(project(), "d1"), ["a setting of “Graph of Weights”"]);
  // the record survives the file
  const back = data(projectFromJson(JSON.parse(outputs.file), ctx));
  assert.deepEqual(back.blinding, data(p).blinding);
});

test("unblinding with the key: names back, values identical, the exclusion made blind recorded and reported", () => {
  const before = project();
  const { p, key } = blinded();
  // exclude one value of group B (Low dose) while blind, with a reason
  const ref = { kind: "y" as const, dataset: 1, row: 2, sub: 0 };
  const excluded = updateTable(p, "d1", (t) => setReasons(toggleExcluded(t, ref), [ref], "pipetting error"));
  assert.match(blindingMethodsSentence(data(excluded)), /^The group names are blinded: the groups are coded A to D\.$/);
  // a key of another blinding is refused
  assert.deepEqual(unblindTable(excluded, "d1", { ...key, id: "other" }, AT), { error: "this key belongs to another blinding (its id does not match)" });
  const r = unblindTable(excluded, "d1", parseKey(JSON.parse(serializeKey(key)))!, "2026-11-25T10:00:00.000Z");
  assert.ok(!("error" in r));
  const after = data(r.project);
  assert.deepEqual(after.table.datasets.map((d) => d.name), NAMES);
  // identity: every value as it was; only the one exclusion added
  assert.deepEqual(after.table.datasets.map((d) => d.rows), data(before).table.datasets.map((d) => d.rows));
  assert.deepEqual(after.table.datasets[1].excluded, ["2:0"]);
  assert.equal(after.blinding, undefined);
  assert.deepEqual(after.imported, data(before).imported);
  assert.deepEqual(r.project.groupColors, before.groupColors?.slice(1).concat(before.groupColors.slice(0, 1)));
  const opts = (r.project.sheets.find((s) => s.id === "r1") as { options: { controlGroup: string } }).options;
  assert.equal(opts.controlGroup, "Vehicle");
  assert.deepEqual(after.blindLog?.[0].exclusions, [{ dataset: "Low dose", row: 2, sub: 0, value: "14", reason: "pipetting error" }]);
  assert.equal(blindingMethodsSentence(after),
    "The analysis was blinded to group from 2026-11-24 to 2026-11-25 (groups coded A to D); the value excluded in that time was excluded blind to group.");
});

test("an exclusion made before blinding is not counted as blind", () => {
  const ref = { kind: "y" as const, dataset: 0, row: 0, sub: 0 };
  const p0 = updateTable(project(), "d1", (t) => toggleExcluded(t, ref));
  const r = blindTable(p0, "d1", { id: "b2", at: AT });
  assert.ok(!("error" in r));
  const u = unblindTable(r.project, "d1", r.key, AT);
  assert.ok(!("error" in u));
  assert.deepEqual(u.session.exclusions, []);
  assert.match(blindingMethodsSentence(data(u.project)), /no value was excluded in that time\.$/);
});

test("refused: already blind, one group, a frozen sheet, a table computed from it", () => {
  const { p } = blinded();
  assert.equal(blindProblem(p, "d1"), "it is already blinded");
  const one = addSheets(makeProject(prefs), [makeDataSheet("x", "One", normalizeTable({ type: "column", datasets: [{ name: "A", rows: [["1"]] }] }))]);
  assert.equal(blindProblem(one, "x"), "it has fewer than two groups");
  const frozen = { ...project(), sheets: project().sheets.map((s) => (s.id === "g1" ? { ...s, frozen: true } : s)) };
  assert.match(blindProblem(frozen, "d1"), /frozen results sheet or graph/);
  const chained = addSheets(project(), [{ ...makeDataSheet("d2", "Normalized", normalizeTable({ type: "column" })),
    derived: { sourceId: "d1", resultsId: "r1" } }]);
  assert.match(blindProblem(chained, "d1"), /unlink them first/);
  assert.match(blindTable(frozen, "d1", { id: "x", at: AT }).hasOwnProperty("error") ? "error" : "", /error/);
});

test("the leak scan names what blinding leaves showing a name", () => {
  const p = { ...project(), title: "Vehicle vs drug study",
    sheets: project().sheets.map((s) => (s.id === "r1" ? { ...s, name: "Low dose vs vehicle" } : s)) };
  const hits = leakScan(p, "d1");
  assert.ok(hits.includes("the project title"));
  assert.ok(hits.includes("the name of the sheet “Low dose vs vehicle”"));
  assert.ok(hits.includes("a setting of “Graph of Weights”"));
  // a value that is exactly a name is coded, so it is not a leak
  assert.ok(!hits.some((h) => h.includes("ANOVA")));
});

test("records and keys from files are checked; an older project opens unchanged", () => {
  assert.equal(parseBlinding({ id: "", codes: ["A"] }), null);
  assert.equal(parseBlinding({ id: "x", codes: [] }), null);
  const b = parseBlinding({ id: "x", codes: ["A", "B"], paths: [{ sheetId: "r", path: ["__proto__", "y"], code: "A" },
    { sheetId: "r", path: ["options", "__proto__"], code: "A" }, { sheetId: "r", path: ["options", 3], code: "A" },
    { sheetId: "r", path: ["options", "c"], code: "A" }] });
  assert.deepEqual(b?.paths, [{ sheetId: "r", path: ["options", "c"], code: "A" }]);
  assert.equal(parseKey({ opendose_blinding_key: 2, id: "x", names: [] }), null);
  assert.equal(parseKey({ opendose_blinding_key: 1, id: "x", names: [{ code: "A", name: "Vehicle" }], pins: [{ name: "v", color: "red" }] })?.pins?.length, 0);
  const text = readFileSync(new URL("../../../e2e-fixtures/project-study.json", import.meta.url), "utf8");
  const ctx = { prefs, ids: sequentialIds("z") };
  const p = parseProjectFile(text, ctx);
  const out = serializeProject(p);
  assert.ok(!/"blinding"|"blindLog"/.test(out));
  assert.equal(serializeProject(parseProjectFile(out, ctx)), out);
});
