// The exclusions sentence in the methods paragraph and the figure legend
// (exclusion-log acceptance test). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exclusionSentence, setReasons } from "../../project/exclusions.ts";
import { normalizeTable, toggleExcluded, type CellRef } from "../../project/table.ts";
import type { DataSheet } from "../../project/types.ts";
import { legendParagraph } from "../legend.ts";
import { legendFor } from "../legendFor.ts";
import { statsMethodsParagraph } from "../methods.ts";
import { DEFAULT_REPORT } from "../prefs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8")) as
  Record<string, { result: unknown }>;

const T3: CellRef = { kind: "y", dataset: 1, row: 2, sub: 0 };
function mice() {
  const t = normalizeTable({
    type: "column",
    datasets: [
      { name: "Control", rows: ["12", "14", "11", "13", "15", "12", "14", "13"].map((v) => [v]) },
      { name: "Treated", rows: ["20", "22", "41", "21", "23", "19", "22", "24"].map((v) => [v]) },
    ],
  });
  return setReasons(toggleExcluded(t, T3), [T3], "tumour ulceration");
}

test("methods: 'Exclusions:' with n enrolled and analysed, beside a typed note", () => {
  const t = mice();
  const s = exclusionSentence(t);
  const p = statsMethodsParagraph(FX.ttest_unpaired.result, DEFAULT_REPORT, undefined, { exclusions: s });
  assert.match(p, /Exclusions: Treated, n = 8 enrolled, 7 analysed \(1 excluded: tumour ulceration\); no exclusions in Control\./);
  const both = statsMethodsParagraph(FX.ttest_unpaired.result, DEFAULT_REPORT,
    { exclusions: "Mice reaching a humane endpoint were excluded." }, { exclusions: s });
  assert.match(both, /Exclusions: Mice reaching a humane endpoint were excluded; Treated, n = 8 enrolled/);
  assert.doesNotMatch(statsMethodsParagraph(FX.ttest_unpaired.result, DEFAULT_REPORT, undefined),
    /Exclusions/);
});

test("legend: the exclusions follow the n statement", () => {
  const t = mice();
  const data: DataSheet = { id: "d", kind: "data", name: "Tumour volume", table: t };
  const text = legendFor({ data, table: t, graph: null, result: FX.ttest_unpaired.result,
    options: null, prefs: DEFAULT_REPORT, software: "OpenDose 0.3.0" });
  assert.match(text, /n = 8 enrolled, 7 analysed \(1 excluded: tumour ulceration\)/);
  const bare = legendParagraph({ graphType: null, result: null, style: "graphpad", software: "X",
    groups: [{ name: "A", n: 7 }], exclusions: "n = 8 enrolled, 7 analysed (1 excluded: x)" });
  assert.match(bare, /^n = 7\. n = 8 enrolled, 7 analysed \(1 excluded: x\)\. Analysed and drawn with X\.$/);
});
