// "Forget this computer's data": only OpenDose's own storage entries go.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { clearOpendoseKeys, isOpendoseKey } from "../forget.ts";

function fakeStorage(entries: Record<string, string>) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    keys: () => [...m.keys()].sort(),
  };
}

test("every key OpenDose writes is recognised as its own", () => {
  for (const k of [
    "opendose-autosave-current", "opendose-autosave-previous", "opendose-autosave",
    "opendose-templates", "opendose-prefs", "opendose-theme", "opendose-scheme",
    "opendose-import-recipes", "opendose-plate-layouts", "opendose-export",
    "opendose-tour-done", "opendose-start-screen", "opendose-nav", "opendose-nav-sections",
    "opendose-split", "opendose.userEquations.v1",
  ]) assert.ok(isOpendoseKey(k), k);
  for (const k of ["opendosex", "other-app", "my-opendose-notes", "", "OPENDOSE-prefs"]) {
    assert.ok(!isOpendoseKey(k), k);
  }
});

test("clearing removes OpenDose's entries and leaves everything else", () => {
  const s = fakeStorage({
    "opendose-autosave-current": "{}", "opendose-prefs": "{}", "opendose.userEquations.v1": "[]",
    "opendose-plate-layouts": "[]", "other-app-token": "x", "analytics-consent": "no",
  });
  assert.equal(clearOpendoseKeys(s), 4);
  assert.deepEqual(s.keys(), ["analytics-consent", "other-app-token"]);
  assert.equal(clearOpendoseKeys(s), 0);
});
