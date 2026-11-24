// Saved versions and recent projects (P-72): every fixture project round
// trips through a version byte for byte, notes are checked late and kept
// to one line, the quota check states the sizes, and recent projects
// group sessions and versions by title. The store is a Map.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Kv, SessionRecord } from "../autosave.ts";
import { sequentialIds } from "../ids.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import {
  cleanNote, deleteVersion, listVersions, noteProblem, quotaProblem, readVersion, recentProjects,
  saveVersion, versionBytes, versionKey, type VersionRecord,
} from "../versions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "..", "..", "e2e-fixtures");
const prefs = projectPrefs(DEFAULT_PREFS);

function mapKv(): Kv & { m: Map<string, unknown> } {
  const m = new Map<string, unknown>();
  return {
    m,
    get: async (k) => m.get(k),
    // structuredClone: what IndexedDB stores is a copy, never the object
    put: async (k, v) => { m.set(k, structuredClone(v)); return true; },
    delete: async (k) => { m.delete(k); },
    keys: async () => [...m.keys()],
  };
}

const version = (id: string, over: Partial<VersionRecord> = {}): VersionRecord => ({
  id, savedAt: 1000, title: "Study", note: "before reviewer", sheets: 2, json: "{}", ...over,
});

function fixtureProjects(): { file: string; text: string }[] {
  const files = [
    ...readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).map((f) => join(FIXTURES, f)),
    ...readdirSync(join(FIXTURES, "stage")).filter((f) => f.endsWith(".json"))
      .map((f) => join(FIXTURES, "stage", f)),
  ];
  return files.map((file) => ({ file, text: readFileSync(file, "utf8") }))
    .filter(({ text }) => (JSON.parse(text) as { opendose_project?: unknown })?.opendose_project !== undefined);
}

test("every fixture project round trips through a version, byte for byte", async () => {
  const kv = mapKv();
  const fixtures = fixtureProjects();
  assert.ok(fixtures.length >= 18, `${fixtures.length} project fixtures`);
  for (const [i, { file, text }] of fixtures.entries()) {
    // What Save a version stores: the project file as Save project writes it.
    const project = parseProjectFile(text, { prefs, ids: sequentialIds("x") });
    const json = serializeProject(project);
    const id = `v${i}`;
    assert.equal(await saveVersion(kv, version(id, { json, title: project.title })), true);
    const back = await readVersion(kv, id);
    assert.ok(back, file);
    assert.equal(back.json, json, `${file}: the stored text differs`);
    // Restoring opens that text: the project it gives writes the same bytes.
    const restored = parseProjectFile(back.json, { prefs, ids: sequentialIds("y") });
    assert.equal(serializeProject(restored), json, `${file}: the restored project differs`);
  }
  assert.equal((await listVersions(kv)).length, fixtures.length);
});

test("versions are listed newest first, skip other keys, and delete one at a time", async () => {
  const kv = mapKv();
  await saveVersion(kv, version("a", { savedAt: 1 }));
  await saveVersion(kv, version("b", { savedAt: 3 }));
  await saveVersion(kv, version("c", { savedAt: 2 }));
  await kv.put("session:z", { json: "{}", savedAt: 9, title: "x", sheets: 0 });
  await kv.put(versionKey("broken"), { id: "broken" });
  assert.deepEqual((await listVersions(kv)).map((v) => v.id), ["b", "c", "a"]);
  await deleteVersion(kv, "c");
  assert.deepEqual((await listVersions(kv)).map((v) => v.id), ["b", "a"]);
  assert.equal(await readVersion(kv, "c"), null);
});

test("a note is required, one line and at most 120 characters", () => {
  assert.equal(noteProblem("   "), "Enter a note, such as “before reviewer”");
  assert.equal(noteProblem("after reviewer"), null);
  assert.equal(cleanNote("  before\n  reviewer  "), "before reviewer");
  assert.equal(cleanNote("x".repeat(300)).length, 120);
});

test("the quota check states the sizes, and lets an unknown quota through", () => {
  assert.equal(quotaProblem({ usage: 1000, quota: 1_000_000 }, 5000), null);
  assert.equal(quotaProblem({ usage: 999_000, quota: 1_000_000 }, 5000),
    "the version needs 5 kB and this browser allows 1 kB more (999 kB of 1 MB used)");
  assert.equal(quotaProblem({ usage: null, quota: null }, 5_000_000_000), null);
  assert.equal(versionBytes("µ"), 2);
});

test("recent projects group sessions and versions by title, latest first", () => {
  const s = (id: string, title: string, savedAt: number): SessionRecord =>
    ({ id, title, savedAt, sheets: 3, json: "{}" });
  const out = recentProjects(
    [s("s1", "Assay 3", 50), s("s2", "Pilot", 10)],
    [version("v1", { title: "Pilot", savedAt: 70 }), version("v2", { title: "Pilot", savedAt: 20 }),
      version("v3", { title: "Assay 3", savedAt: 40 })],
  );
  assert.deepEqual(out.map((r) => [r.title, r.lastAt]), [["Pilot", 70], ["Assay 3", 50]]);
  assert.deepEqual(out[0].versions.map((v) => v.id), ["v1", "v2"]);
  assert.deepEqual(out[0].sessions.map((x) => x.id), ["s2"]);
  assert.deepEqual(recentProjects([], []), []);
});
