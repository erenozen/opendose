// Projects saved before the curve-fit graph options (P-23, P-24) and the
// column graphs' "Follow the test" centre (P-25, P-26): they open with
// every new option off, so their figures draw as they did, and a save
// round trip adds nothing. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sequentialIds } from "../../../project/ids.ts";
import { parseProjectFile, serializeProject } from "../../../project/persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../../project/prefs.ts";
import type { GraphSheet } from "../../../project/types.ts";
import { DEFAULT_XY_GRAPH, normalizeXYGraph } from "../fitGraph.ts";
import { normalizeColumnGraph } from "../../column/graphSettings.ts";
import { resolveSummary } from "../../column/rankSummary.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "..", "..", "..", "e2e-fixtures");
const prefs = projectPrefs(DEFAULT_PREFS);

// both committed before these options existed (git log: d1fe1cb and earlier)
for (const file of ["potency-experiments.json", "stage/long-names.json"]) {
  test(`${file}: new graph options are off`, () => {
    const text = readFileSync(join(fixtures, file), "utf8");
    const p = parseProjectFile(text, { prefs, ids: sequentialIds("t") });
    const graphs = p.sheets.filter((s): s is GraphSheet => s.kind === "graph");
    assert.ok(graphs.length > 0);
    for (const g of graphs) {
      assert.equal(g.settings.xy, undefined);
      assert.deepEqual(normalizeXYGraph(g.settings.xy), DEFAULT_XY_GRAPH);
      const s = normalizeColumnGraph(g.settings.column);
      assert.notEqual(s.summary, "auto");
      // a rank test does not change a graph saved before
      assert.equal(resolveSummary(s.summary, { analysis: "ttest", ttestKind: "mann_whitney" }),
        s.summary);
    }
    const again = parseProjectFile(serializeProject(p), { prefs, ids: sequentialIds("u") });
    assert.deepEqual(again.sheets.filter((s) => s.kind === "graph").map((s) => (s as GraphSheet).settings),
      graphs.map((g) => g.settings));
  });
}
