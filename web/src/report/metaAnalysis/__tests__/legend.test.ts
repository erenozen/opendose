// The figure legend of the forest plot (P-92): what is drawn, k, the
// pooling methods, no "Mean ± SEM" bar clause and no n per cell.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legendFor } from "../../legendFor.ts";
import type { DataSheet, GraphSheet } from "../../../project/types.ts";

const BCG = JSON.parse(readFileSync(new URL("./bcg-result.json", import.meta.url), "utf8"));
const PROJECT = JSON.parse(readFileSync(new URL("../../../../e2e-fixtures/stage/meta-bcg.json",
  import.meta.url), "utf8"));
const data = PROJECT.sheets[0] as DataSheet;
const graph = PROJECT.sheets[2] as GraphSheet;

test("forest plot legend", () => {
  const text = legendFor({
    data, table: data.table, graph, result: BCG, options: { scale: "log_ratio" },
    prefs: { pStyle: "gp", hideNs: false } as never, software: "OpenDose 0.4.0",
  });
  assert.match(text, /^Squares show the estimate of each of 13 experiments with its 95% CI; /);
  assert.match(text, /random-effects \(filled; τ² by REML, Hartung-Knapp CI\)/);
  assert.match(text, /prediction interval for the effect in a new experiment/);
  assert.match(text, /log axis; the dashed line marks no effect \(1\)\./);
  assert.doesNotMatch(text, /Mean ± SEM|SEM \(bars\)|n = /);
  const none = legendFor({
    data, table: data.table, graph: { ...graph, settings: { ...graph.settings, forest: { pooled: "none" } } },
    result: BCG, options: {}, prefs: { pStyle: "gp", hideNs: false } as never, software: "OpenDose",
  });
  assert.doesNotMatch(none, /Diamonds|prediction/);
  // the results sheet's legend without a graph
  const bare = legendFor({ data, table: data.table, graph: null, result: BCG, options: {},
    prefs: { pStyle: "gp", hideNs: false } as never, software: "OpenDose" });
  assert.doesNotMatch(bare, /Mean ± SEM|n = /);
});
