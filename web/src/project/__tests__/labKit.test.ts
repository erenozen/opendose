// The lab kit file (P-75): a round trip gives back identical lists, the
// version rule refuses what it cannot read, and an import never
// overwrites or doubles what a browser already holds.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLabKitText, KIT_MARKER, KIT_VERSION, mergeEntries, nextName, parseKit, sectionCount, serializeKit,
  type LabKit,
} from "../labKit.ts";
import { DEFAULT_PREFS } from "../prefs.ts";
import { normalizeTable } from "../table.ts";
import type { SheetTemplate } from "../templates.ts";
import { newEquation } from "../../lib/userEquation.ts";

const template: SheetTemplate = {
  id: "user:abc", name: "SRB plate", description: "IC50 of a 96-well plate", savedAt: 1790000000000,
  withData: false, tableName: "SRB",
  table: normalizeTable({ type: "xy", x: ["1", "10"], datasets: [{ name: "A", rows: [[""], [""]] }] }),
  results: [{ key: "r1", name: "Nonlin fit of {table}", analysis: "nonlin", options: { model: "log_inhibitor_vs_response_4pl" } }],
  graphs: [{ name: "Graph of {table}", graphType: "xy", resultsKey: "r1", settings: { titles: { x: "", y: "" }, scheme: "default" } }],
  info: [{ name: "Assay", notes: "seed 5000 cells", constants: [{ name: "Cells", value: "5000" }] }],
};

const kit: Omit<LabKit, "version"> = {
  exportedAt: "2026-11-24T10:00:00.000Z",
  software: "OpenDose 0.6.0",
  templates: [template],
  recipes: [{ id: "rc1", name: "Plate reader", savedAt: "2026-11-01T00:00:00Z", basis: "Plain import",
    spec: { recipe: "plain", delimiter: "," } }],
  plateLayouts: [{ name: "Our 96", format: 96, wells: { A1: { role: "blank" } }, description: "Saved layout (96 wells)" }],
  equations: [{ ...newEquation(), id: "eq-1", name: "Decay", text: "Y = A*exp(-k*X)" }],
  preferences: { ...DEFAULT_PREFS, digits: 6, theme: "dark", report: { pStyle: "apa", hideNs: true, smd: "g", variance: "omega2", pFloor: "1e-4" } },
  exportSettings: { format: "tiff", width: 600, height: 450, dpi: 600, unit: "mm", transparent: false, paper: true, scaleText: false },
};

test("a kit round trips to identical lists", () => {
  const text = serializeKit(kit);
  assert.ok(isLabKitText(text));
  const back = parseKit(text);
  assert.equal(back.version, KIT_VERSION);
  assert.deepEqual({ ...back, version: undefined }, { ...kit, version: undefined });
  // and again: export → import → export is stable
  assert.equal(serializeKit(back), text);
});

test("the version rule: a newer kit is refused with what to do; a project file is named", () => {
  const newer = JSON.stringify({ [KIT_MARKER]: KIT_VERSION + 1, templates: [] });
  assert.throws(() => parseKit(newer), /newer version of OpenDose \(kit format 2\); update OpenDose/);
  assert.throws(() => parseKit(JSON.stringify({ opendose_project: 2, version: 2, sheets: [] })),
    /this is a project file; open it with Open instead/);
  assert.throws(() => parseKit("{"), /not a valid JSON file/);
  assert.throws(() => parseKit("{}"), /not an OpenDose lab kit file/);
  assert.equal(isLabKitText(JSON.stringify({ opendose_project: 2 })), false);
});

test("unknown sections are ignored and missing ones are empty (no version change)", () => {
  const k = parseKit(JSON.stringify({ [KIT_MARKER]: 1, houseStyles: [{ name: "Lab" }], templates: [template] }));
  assert.equal(k.templates.length, 1);
  assert.deepEqual([k.recipes, k.plateLayouts, k.equations, k.preferences, k.exportSettings], [[], [], [], null, null]);
  assert.deepEqual(["templates", "recipes", "preferences"].map((s) => sectionCount(k, s as never)), [1, 0, 0]);
});

test("damaged entries are skipped, the rest imported", () => {
  const k = parseKit(JSON.stringify({
    [KIT_MARKER]: 1,
    templates: [{ name: "no table" }, template],
    plateLayouts: [{ name: "", format: 96, wells: {} }, { name: "Odd", format: 48, wells: {} }, kit.plateLayouts[0]],
    equations: [{ name: "blank", text: "" }, kit.equations[0]],
  }));
  assert.deepEqual([k.templates.length, k.plateLayouts.length, k.equations.length], [1, 1, 1]);
});

interface Entry { name: string; v: number }
const byName = {
  key: (x: Entry) => x.name,
  rekey: (x: Entry, taken: (k: string) => boolean) => ({ ...x, name: nextName(x.name, taken) }),
};

test("an import adds after what is here, never doubles, never overwrites", () => {
  const have: Entry[] = [{ name: "A", v: 1 }, { name: "B", v: 2 }];
  const m = mergeEntries(have, [{ name: "A", v: 1 }, { name: "B", v: 9 }, { name: "C", v: 3 }], byName);
  assert.deepEqual(m.list, [{ name: "A", v: 1 }, { name: "B", v: 2 }, { name: "B (2)", v: 9 }, { name: "C", v: 3 }]);
  assert.deepEqual([m.added, m.already, m.renamed], [2, 1, ["B"]]);
  // into an empty browser (after Forget this computer's data): the same list
  const fresh = mergeEntries([], have, byName);
  assert.deepEqual(fresh.list, have);
});
