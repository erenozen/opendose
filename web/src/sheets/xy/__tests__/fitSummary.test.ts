// The fit summary (P-17): one row per data set, each equal to its card,
// sortable, the incomplete curve flagged with its reason, and the linked
// table of parameters. The result is the engine's on twelve simulated
// compounds (engine/tests/reference/fit_summary_12.py writes the fixture).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AnalysisResult, FitResult } from "../../../types.ts";
import { formatSig } from "../../../types.ts";
import { withRangeReport } from "../rangeReport.ts";
import { ciText, fitCaveats, reportedValue, seText, valueText } from "../fitCells.ts";
import {
  PARAMETERS_OUTPUT, fitSummary, parametersTable, parseSort, sortChoices, sortRows,
} from "../fitSummary.ts";

const fx = JSON.parse(readFileSync(new URL("./fitSummary.fixture.json", import.meta.url), "utf8"));
const raw = fx.result as AnalysisResult;
const table = fx.table as { xTitle: string; xUnit: string };
const result = withRangeReport(raw, table, {});
const fitted = withRangeReport(raw, table, { extrapolatedReport: "fitted" });

test("twelve rows, one per compound, in table order", () => {
  const s = fitSummary(result, "µM")!;
  assert.equal(s.rows.length, 12);
  assert.deepEqual(s.rows.map((r) => r.name), raw.datasets.map((d) => d.name));
  assert.equal(s.key, "IC50");
  assert.deepEqual(s.columns.map((c) => c.label),
    ["IC50 (µM)", "95% CI of IC50", "HillSlope", "Top", "Bottom", "R²"]);
});

test("each row equals its data set's card", () => {
  const s = fitSummary(result, "µM")!;
  s.rows.forEach((row, i) => {
    const fit = result.datasets[i].fit as FitResult;
    for (const c of s.columns) {
      const text = row.cells[c.id].text;
      if (c.kind === "r2") assert.equal(text, formatSig(fit.goodness.r_squared));
      else if (c.kind === "value") assert.equal(text, valueText(c.param!, fit.params[c.param!], fit));
      else assert.equal(text, ciText(c.param!, fit.params[c.param!], fit));
    }
  });
  // spot values, as the card prints them
  const a = s.rows[0].cells;
  assert.equal(a["v:IC50"].text, formatSig(raw.datasets[0].fit!.params.IC50.value));
  assert.match(a["ci:IC50"].text, /^\S+ to \S+$/);
});

test("the incomplete curve is flagged Extrapolated with its reason", () => {
  const s = fitSummary(result, "µM")!;
  const flagged = s.rows.filter((r) => r.caveats.length);
  assert.deepEqual(flagged.map((r) => r.name), ["Compound L"]);
  const l = flagged[0];
  assert.equal(l.caveats[0].label, "Extrapolated");
  assert.match(l.caveats[0].reason, /^IC50 > 30 µM \(not reached in the range tested\): /);
  assert.match(l.caveats[0].reason, /above the highest concentration tested \(30 µM\)/);
  assert.match(l.caveats[0].reason, /bottom plateau is not defined by the data/);
  // its IC50 is the bound, with no SE or CI (as its card)
  assert.equal(l.cells["v:IC50"].text, "> 30 (not reached in the range tested)");
  assert.equal(l.cells["ci:IC50"].text, "not reported (extrapolated)");
  const fit = result.datasets[11].fit!;
  assert.equal(seText("IC50", fit.params.IC50, fit), "n/a");
  // "the fitted number" mode: the number, flagged, as the card
  const f = fitSummary(fitted, "µM")!.rows[11];
  assert.equal(f.cells["v:IC50"].text,
    `${formatSig(fit.params.IC50.value)} ⚑ extrapolated (above the range tested)`);
});

test("sorting: by IC50 both ways, flagged first, table order", () => {
  const s = fitSummary(result, "µM")!;
  const ic = s.rows.map((r) => raw.datasets[r.index].fit!.params.IC50.value);
  const asc = sortRows(s.rows, parseSort("v:IC50|asc")).map((r) => r.index);
  assert.deepEqual(asc, [...asc].sort((a, b) => ic[a] - ic[b]));
  const desc = sortRows(s.rows, parseSort("v:IC50|desc")).map((r) => r.index);
  assert.deepEqual(desc, [...asc].reverse());
  assert.equal(sortRows(s.rows, parseSort("flags"))[0].name, "Compound L");
  assert.deepEqual(sortRows(s.rows, parseSort("order")).map((r) => r.index), [...Array(12).keys()]);
  assert.deepEqual(parseSort("nonsense"), { by: "order" });
  const choices = sortChoices(s).map((c) => c.label);
  assert.equal(choices[0], "Table order");
  assert.ok(choices.includes("IC50 (µM), lowest first"));
  assert.ok(!choices.some((c) => c.startsWith("95% CI")));
});

test("rows without a value sort last in either direction", () => {
  const s = fitSummary({ ...result, datasets: [
    ...result.datasets.slice(0, 2), { name: "Broken", error: "too few points", points: { x: [], bars: [] } },
  ] }, "µM")!;
  assert.equal(s.rows[2].error, "Could not fit: too few points");
  assert.equal(s.rows[2].cells["v:IC50"].text, "—");
  for (const dir of ["asc", "desc"]) {
    assert.equal(sortRows(s.rows, parseSort(`v:IC50|${dir}`)).at(-1)!.name, "Broken");
  }
});

test("no summary for one data set, an error or nothing fitted", () => {
  assert.equal(fitSummary({ ...result, datasets: result.datasets.slice(0, 1) }, "µM"), null);
  assert.equal(fitSummary({ analysis: "dose_response", datasets: [], error: "x" }, "µM"), null);
  assert.equal(fitSummary(null, "µM"), null);
});

test("the linked table: same twelve rows, the values the cards report", () => {
  assert.equal(PARAMETERS_OUTPUT, "parameters");
  const t = parametersTable(result, "µM")!;
  assert.equal(t.type, "column");
  assert.deepEqual(t.rowTitles, raw.datasets.map((d) => d.name));
  assert.deepEqual(t.datasets.map((d) => d.name),
    ["Top", "Bottom", "LogIC50", "HillSlope", "IC50 (µM)", "Span", "R²"]);
  const ic50 = t.datasets[4].rows.map((r) => r[0]);
  raw.datasets.slice(0, 11).forEach((d, i) => assert.equal(ic50[i], String(d.fit!.params.IC50.value)));
  // Compound L's IC50 and LogIC50 are reported as "> 30": empty cells
  assert.equal(ic50[11], "");
  assert.equal(t.datasets[2].rows[11][0], "");
  assert.equal(t.datasets[0].rows[11][0], String(raw.datasets[11].fit!.params.Top.value));
  assert.equal(t.datasets[6].rows[0][0], String(raw.datasets[0].fit!.goodness.r_squared));
  // with the fitted number reported, the IC50 is in the table
  const tf = parametersTable(fitted, "µM")!;
  assert.equal(tf.datasets[4].rows[11][0], String(raw.datasets[11].fit!.params.IC50.value));
});

test("an ambiguous fit and an error give empty cells; caveats name their reasons", () => {
  const amb = JSON.parse(JSON.stringify(result)) as AnalysisResult;
  amb.datasets[0].fit!.status = "ambiguous";
  amb.datasets[1] = { name: amb.datasets[1].name, error: "no convergence", points: { x: [], bars: [] } };
  const t = parametersTable(amb, "µM")!;
  assert.ok(t.datasets.slice(0, -1).every((d) => d.rows[0][0] === "" && d.rows[1][0] === ""));
  assert.equal(t.datasets.at(-1)!.rows[1][0], "");
  const c = fitCaveats(amb.datasets[0].fit!);
  assert.equal(c[0].label, "Ambiguous");
  const fit = { ...result.datasets[0].fit!, params: { ...result.datasets[0].fit!.params,
    Bottom: { ...result.datasets[0].fit!.params.Bottom, at_bound: "lower" as const } } };
  assert.match(fitCaveats(fit).at(-1)!.reason, /^Bottom ended on the limit set for it/);
  assert.equal(reportedValue("Bottom", fit.params.Bottom, fit), fit.params.Bottom.value);
});
