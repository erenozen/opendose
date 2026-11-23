// P-55: Normalize names its output's Y title from its settings, only for
// sheets made since (older ones keep "Normalized response (%)"), and the
// figure legend states the same phrase.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDerivedSheet } from "../../../project/derived.ts";
import { makeDataSheet, makeProject, makeResultsSheet } from "../../../project/ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../../project/prefs.ts";
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { legendParagraph } from "../../../report/legend.ts";
import { legacyNormalizeTitle, normalizedPhrase, normalizeTitle, outputTitle } from "../normalizeTitle.ts";
import type { TitleOptions } from "../normalizeTitle.ts";

/** run.ts DEFAULT_NORMALIZE (run.ts itself imports without extensions). */
const DEFAULT_NORMALIZE: TitleOptions & Record<string, unknown> = {
  zeroMode: "smallest", zeroValue: "0", hundredMode: "largest", hundredValue: "100",
  asPercent: true, subcolumns: "mean",
};

/** A grouped table: rows 10 nM, 1 µM, vehicle; two data sets of triplicates. */
const grouped = (rows = ["10 nM", "1 µM", "vehicle"]): DataTableModel => normalizeTable({
  type: "grouped", rowTitles: rows, datasets: [
    { name: "WT", rows: [["20", "22", "21"], ["55", "60", "58"], ["98", "101", "100"]] },
    { name: "KO", rows: [["30", "33", "31"], ["70", "66", "68"], ["99", "97", "103"]] },
  ] }, "grouped");

const O = (o: Partial<TitleOptions> & Record<string, unknown> = {}): TitleOptions =>
  ({ ...DEFAULT_NORMALIZE, namedTitle: true, ...o });

test("the acceptance case: 0% smallest mean, 100% the vehicle mean", () => {
  assert.equal(normalizeTitle(O({ zeroMode: "smallest", hundredMode: "last", subcolumns: "mean" }), grouped()),
    "% of vehicle (mean)");
});

test("titles name the reference, its kind and whether it is a mean", () => {
  const t = grouped();
  assert.equal(normalizeTitle(O(), t), "% of largest mean");
  assert.equal(normalizeTitle(O({ subcolumns: "separate" }), t), "% of largest value");
  assert.equal(normalizeTitle(O({ hundredMode: "last", subcolumns: "separate" }), t), "% of vehicle");
  assert.equal(normalizeTitle(O({ hundredMode: "sum" }), t), "% of total (mean)");
  assert.equal(normalizeTitle(O({ hundredMode: "last", asPercent: false }), t), "Fraction of vehicle (mean)");
  // a typed 100% names nothing: the general title
  assert.equal(normalizeTitle(O({ hundredMode: "value", hundredValue: "250" }), t), "Normalized response (%)");
  assert.equal(normalizeTitle(O({ hundredMode: "value", asPercent: false }), t), "Normalized response");
  // one value per cell: no "(mean)"
  const single = normalizeTable({ type: "column", rowTitles: ["a", "b", "vehicle"],
    datasets: [{ name: "A", rows: [["1"], ["2"], ["3"]] }] }, "column");
  assert.equal(normalizeTitle(O({ hundredMode: "last" }), single), "% of vehicle");
  assert.equal(normalizeTitle(O(), single), "% of largest value");
});

test("the last row is named only when it is every data set's last row", () => {
  // no row titles: the X value of an XY table, else "last row"
  const xy = normalizeTable({ type: "xy", x: ["0", "1", "10"], datasets: [
    { name: "A", rows: [["1"], ["5"], ["9"]] }] }, "xy");
  assert.equal(normalizeTitle(O({ hundredMode: "last" }), xy), "% of value at X = 10");
  assert.equal(normalizeTitle(O({ hundredMode: "last" }), grouped(["", "", ""])), "% of last row (mean)");
  // KO has no value in the vehicle row: its 100% comes from another row
  const t = grouped();
  t.datasets[1].rows[2] = ["", "", ""];
  assert.equal(normalizeTitle(O({ hundredMode: "last" }), t), "% of last row (mean)");
  // a blank trailing row is skipped in every data set
  const trailing = normalizeTable({ type: "grouped", rowTitles: ["a", "Vehicle", "spare"], datasets: [
    { name: "WT", rows: [["1"], ["2"], [""]] }] }, "grouped");
  assert.equal(normalizeTitle(O({ hundredMode: "last" }), trailing), "% of Vehicle");
});

test("only new outputs are named: a sheet saved without namedTitle keeps the old title", () => {
  const t = grouped();
  const old = { ...DEFAULT_NORMALIZE, hundredMode: "last" as const };
  assert.equal(outputTitle(old, t), "Normalized response (%)");
  assert.equal(outputTitle({ ...old, asPercent: false }, t), "Normalized response");
  assert.equal(outputTitle({ ...old, namedTitle: true }, t), "% of vehicle (mean)");
  assert.equal(legacyNormalizeTitle({ asPercent: true }), "Normalized response (%)");
});

test("the legend states the phrase of a named output, and of nothing else", () => {
  const prefs = projectPrefs(DEFAULT_PREFS);
  const src = makeDataSheet("d1", "Dose", grouped());
  const res = (o: unknown) => makeResultsSheet("r1", "d1", "normalize", o, "Normalize of Dose");
  const out = makeDerivedSheet("d2", "Normalized Dose",
    { ...grouped(), yTitle: "% of vehicle (mean)" }, { sourceId: "d1", resultsId: "r1" });
  const p = (o: unknown) => makeProject(prefs, [src, res(o), out], "P");
  assert.equal(normalizedPhrase(p(O({ hundredMode: "last" })), out), "% of vehicle (mean)");
  assert.equal(normalizedPhrase(p({ ...DEFAULT_NORMALIZE }), out), null);
  assert.equal(normalizedPhrase(p(O()), src), null);
  const legacy = { ...out, table: { ...out.table, yTitle: "Normalized response (%)" } };
  assert.equal(normalizedPhrase(p(O()), legacy), null);
  const base = { graphType: "grouped_interleaved", result: null, style: "graphpad" as const, software: "OpenDose" };
  assert.match(legendParagraph({ ...base, valuesAre: "% of vehicle (mean)" }), /Values are % of vehicle \(mean\)\./);
  assert.doesNotMatch(legendParagraph(base), /Values are/);
});
