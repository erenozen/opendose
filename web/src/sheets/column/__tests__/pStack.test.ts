// Analyze a stack of P values: the engine request built from one column,
// and the tables that cannot be read as P values. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import { pStackPayload } from "../pStack.ts";

const o = (patch: Partial<ColumnOptionsState> = {}) =>
  ({ ...DEFAULT_COLUMN_OPTIONS, analysis: "p_stack", ...patch }) as ColumnOptionsState;
const column = (values: string[][], rowTitles?: string[]) => normalizeTable({
  type: "column", rowTitles,
  datasets: [{ name: "Other", rows: values.map(() => ["9"]) }, { name: "P", rows: values }],
});

test("one column of P values, labelled by row titles, FDR by default", () => {
  const t = column([["0.01"], [""], ["0.2"]], ["IL-6", "TNF", ""]);
  const r = pStackPayload(t, o({ datasetA: 1 }));
  assert.ok("payload" in r);
  assert.deepEqual(r.payload, { analysis: "fdr_adjust",
    data: { p_values: [0.01, null, 0.2], labels: ["IL-6", "TNF", "Row 3"] },
    options: { method: "bky", q_percent: 5 } });
});

test("significance methods send α, FDR methods Q", () => {
  const t = column([["0.01"], ["0.03"]]);
  const sig = pStackPayload(t, o({ datasetA: 1, pStackMethod: "holm_sidak", pStackAlpha: "0.01" }));
  assert.ok("payload" in sig && JSON.stringify(sig.payload.options) === JSON.stringify({ method: "holm_sidak", alpha: 0.01 }));
  const fdr = pStackPayload(t, o({ datasetA: 1, pStackMethod: "bh", pStackQ: "10" }));
  assert.ok("payload" in fdr && JSON.stringify(fdr.payload.options) === JSON.stringify({ method: "bh", q_percent: 10 }));
});

test("rows with two values, values outside 0-1 and summary tables are errors, never guesses", () => {
  const crowded = normalizeTable({ type: "column", datasets: [{ name: "P", rows: [["0.1", "0.2"], ["0.3"]] }] });
  const c = pStackPayload(crowded, o());
  assert.ok("error" in c && /rows 1 hold more than one/.test(c.error));
  const out = pStackPayload(column([["0.5"], ["1.5"]]), o({ datasetA: 1 }));
  assert.ok("error" in out && /rows 2/.test(out.error));
  const empty = pStackPayload(column([[""], [""]]), o({ datasetA: 1 }));
  assert.ok("error" in empty);
});
