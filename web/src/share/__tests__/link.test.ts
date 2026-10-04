// Share links: round trip through the URL fragment, the size guard, and
// the family subset. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { sequentialIds } from "../../project/ids.ts";
import {
  addSheets, makeDataSheet, makeGraphSheet, makeInfoSheet, makeProject, makeResultsSheet,
} from "../../project/ops.ts";
import { projectFromJson } from "../../project/persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import { emptyTable, setCell } from "../../project/table.ts";
import type { DataSheet, Project } from "../../project/types.ts";
import {
  decodePayload, encodePayload, familyProject, fromBase64Url, makeFragment, readFragment,
  sharePayload, SHARE_LIMIT, shareJson, toBase64Url,
} from "../link.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const settings = { titles: { x: "", y: "" }, scheme: "default" as const };

function sample(): Project {
  let t = emptyTable("xy", { datasets: 1, subcolumns: 2, rows: 3 });
  t = setCell(t, 0, 0, 0, "1.5");
  t = setCell(t, 0, 2, 1, "µ ± 3");
  const p = makeProject({ ...prefs, digits: 6 }, [
    makeDataSheet("d1", "October data", t),
    makeResultsSheet("r1", "d1", "nonlin", { model: "x" }, "Nonlin fit of October data"),
    makeGraphSheet("g1", "d1", "r1", "xy", settings, "Graph of October data"),
    makeDataSheet("d2", "Other", emptyTable("column")),
  ], "Shared study");
  return addSheets(p, [{ ...makeInfoSheet("i1", "Notes on October"), parentId: "d1" }]);
}

test("base64url round-trips every byte value without padding", () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const s = toBase64Url(bytes);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([...fromBase64Url(s)], [...bytes]);
  for (const n of [1, 2, 3, 4, 5]) {
    const b = bytes.subarray(0, n);
    assert.deepEqual([...fromBase64Url(toBase64Url(b))], [...b]);
  }
});

test("a project survives the link: same sheets, tables and title", () => {
  const p = sample();
  const out = makeFragment(p);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.match(out.fragment, /^#p=[A-Za-z0-9_-]+$/);
  const back = projectFromJson(readFragment(out.fragment), { prefs, ids: sequentialIds() });
  assert.equal(back.title, "Shared study");
  assert.deepEqual(back.sheets.map((s) => s.id), p.sheets.map((s) => s.id));
  const d = back.sheets[0] as DataSheet;
  assert.equal(d.table.datasets[0].rows[0][0], "1.5");
  assert.equal(d.table.datasets[0].rows[2][1], "µ ± 3");
});

test("the link carries no preferences and no autosave", () => {
  const json = JSON.parse(shareJson(sample()));
  assert.equal(json.prefs, undefined);
  assert.equal(json.opendose_project, 2);
  assert.ok(!JSON.stringify(json).includes("autosave"));
  // the receiver's own preferences fill in
  const back = projectFromJson(json, { prefs, ids: sequentialIds() });
  assert.equal(back.prefs.digits, prefs.digits);
});

test("cached results go in when they fit, and are dropped before giving up", () => {
  const p = sample();
  const results = new Map<string, unknown>([["r1", { logIC50: -6.983, note: "x".repeat(50) }]]);
  const withRes = makeFragment(p, results);
  assert.ok(withRes.ok && withRes.withResults);
  const back = readFragment((withRes as { fragment: string }).fragment) as { sheets: { cached?: unknown }[] };
  assert.deepEqual(back.sheets[1].cached, results.get("r1"));
  // a limit between the two sizes keeps the project, drops the results
  const bare = makeFragment(p);
  assert.ok(bare.ok);
  const big = new Map<string, unknown>([["r1", { blob: Array.from({ length: 4000 }, (_, i) => i * 1.37) }]]);
  const mid = makeFragment(p, big, (bare as { length: number }).length + 10);
  assert.ok(mid.ok && !mid.withResults);
});

test("size guard: a project too big for a pasteable link is refused with its size", () => {
  let t = emptyTable("column", { datasets: 20, rows: 400 });
  let seed = 7;
  for (let d = 0; d < 20; d++) {
    for (let r = 0; r < 400; r++) {
      seed = (seed * 16807) % 2147483647;
      t = { ...t, datasets: t.datasets.map((ds, i) => (i === d ? {
        ...ds, rows: ds.rows.map((row, k) => (k === r ? [String(seed / 1e5)] : row)) } : ds)) };
    }
  }
  const p = makeProject(prefs, [makeDataSheet("d1", "Big", t)], "Big");
  const out = makeFragment(p);
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.limit, SHARE_LIMIT);
  assert.ok(out.length > SHARE_LIMIT);
});

test("damaged links fail with a readable reason", () => {
  assert.throws(() => readFragment("#q=abc"), /not a share link/);
  assert.throws(() => decodePayload("abc$"), /characters/);
  assert.throws(() => decodePayload("AAAA"), /incomplete or damaged/);
  const good = encodePayload("{\"a\":1}");
  assert.equal(decodePayload(good), "{\"a\":1}");
  assert.equal(sharePayload("#x=1&p=abc"), "abc");
  assert.equal(sharePayload("#validation"), null);
});

test("sharing one family keeps the table, its results, graphs and attached info only", () => {
  const p = sample();
  const fam = familyProject(p, "d1")!;
  assert.deepEqual(fam.sheets.map((s) => s.id).sort(), ["d1", "g1", "i1", "r1"]);
  assert.equal(fam.title, "October data");
  assert.equal(familyProject(p, "r1"), null);
  const out = makeFragment(fam);
  assert.ok(out.ok);
});
