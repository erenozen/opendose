// P-85: the aligned rank transform two-way ANOVA: options, payload, the
// results' rows and words, the readers (key facts, meaning, statistics
// table, sentences) and the wizard's non-Gaussian two-factor branch.
// Engine result: report/__tests__/stats-fixtures.json ("two_way_art", a
// native engine result). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTable } from "../../../project/table.ts";
import { formatSig } from "../../../types.ts";
import { DEFAULT_TWO_WAY, normalizeTwoWay } from "../options.ts";
import {
  artContrastsTitle, artMethodsSentence, artPayload, artRefusal, artRows, artStat,
} from "../art.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import { meaningOf } from "../../../report/meaning.ts";
import { describeResult } from "../../../report/describe.ts";
import { resultSentences } from "../../../report/sentences.ts";
import { DEFAULT_DESIGN, recommend } from "../../../guide/recommend.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FX = JSON.parse(readFileSync(new URL("../../../report/__tests__/stats-fixtures.json", import.meta.url),
  "utf8"));
const R = { ...FX.two_way_art.result, factor_names: ["Day", "Treatment"] };
const factors: [string, string] = ["Day", "Treatment"];

const table = normalizeTable({
  type: "grouped", rowTitles: ["Day 7", "Day 14"],
  datasets: [{ name: "Vehicle", rows: [["1", "2", "3"], ["4", "5", "6"]] },
    { name: "Drug", rows: [["2", "3", "4"], ["9", "8", "7"]] }],
});

test("options: the method and the ART-C choices survive a save, defaults stay as they were", () => {
  assert.deepEqual(normalizeTwoWay({}), DEFAULT_TWO_WAY);
  const o = normalizeTwoWay({ method: "art", artContrasts: "cells", artAdjust: "holm" });
  assert.equal(o.method, "art");
  assert.equal(o.artContrasts, "cells");
  assert.equal(o.artAdjust, "holm");
  assert.equal(normalizeTwoWay({ method: "bogus", artContrasts: "x" }).method, undefined);
});

test("payload: two_way_art with the factor names, row names and ART-C", () => {
  const o = { ...DEFAULT_TWO_WAY, method: "art" as const, artContrasts: "col" as const };
  const p = artPayload(table, o, ["Day", "Treatment"]);
  assert.equal(p.analysis, "two_way_art");
  assert.deepEqual(p.options, { row_factor: "Day", col_factor: "Treatment", row_names: ["Day 7", "Day 14"],
    contrasts: "col", contrasts_method: "tukey" });
  assert.deepEqual((p.data as any).datasets[1].ys[1], [9, 8, 7]);
  assert.equal((artPayload(table, { ...o, artContrasts: undefined }, factors).options as any).contrasts,
    undefined);
});

test("refused with what to do for summary data and repeated measures", () => {
  const art = { ...DEFAULT_TWO_WAY, method: "art" as const };
  assert.equal(artRefusal(table, art), null);
  assert.match(String(artRefusal({ ...table, subcolumnFormat: "mean_sd_n" }, art)),
    /^The aligned rank transform needs replicate values/);
  assert.match(String(artRefusal(table, { ...art, design: "rm_rows" })),
    /for independent values: set Repeated measures to None/);
});

test("results: rows, F statements and the methods paragraph read the engine's numbers", () => {
  const rows = artRows(R, factors);
  assert.deepEqual(rows.map((r) => r.label), ["Interaction (Day × Treatment)", "Day", "Treatment"]);
  assert.equal(rows[0].F, R.sources.interaction.F);
  assert.equal(artStat(rows[1]), `F(2, 12) = ${formatSig(R.sources.Day.F)}, P < 0.0001`);
  const m = artMethodsSentence(R, factors);
  assert.match(m, /^Data were analyzed by a nonparametric two-way ANOVA using the aligned rank transform \(Wobbrock et al\. 2011\) with Day and Treatment as factors \(18 values\)/);
  assert.match(m, /Pairwise contrasts of Treatment used the ART-C procedure \(Elkin et al\. 2021\), with Tukey's adjustment for 1 comparison; differences are of mean aligned ranks\.$/);
  assert.equal(artContrastsTitle(R.art_contrasts, factors), "ART-C contrasts of Treatment (Tukey)");
});

test("readers: key facts, meaning, describe and the results sentence", () => {
  const kf = keyFacts(R) as any;
  assert.equal(kf.kind, "figures");
  assert.equal(kf.items[0].title, "Interaction (Day × Treatment), aligned rank transform");
  assert.match(kf.items[0].figure.facts[0], /^F\(2, 12\) = .* on aligned ranks$/);
  const mean = meaningOf({ result: R, options: {}, table: null });
  assert.ok(mean);
  assert.match(mean!.sentence, /aligned ranks/);
  assert.ok(mean!.sources.some((s) => /Wobbrock/.test(s.label)));
  assert.match(String(mean!.misreading), /not by how much in the data's units/);
  const info = describeResult(R);
  assert.equal(info.test, "aligned rank transform two-way ANOVA (nonparametric)");
  const s = resultSentences(R).join(" ");
  assert.match(s, /^A two-way ANOVA on aligned ranks \(aligned rank transform\) gave: /);
  assert.match(s, new RegExp(`Day, F\\(2, 12\\) = ${formatSig(R.sources.Day.F).replace(".", "\\.")}`));
});

test("wizard: two factors, independent values, not Gaussian -> the aligned rank transform", () => {
  const r = recommend({ ...DEFAULT_DESIGN, factors: "two", distribution: "not_normal", sampleSize: "medium" });
  assert.equal(r.rule, "two_way_art");
  assert.deepEqual(r.target?.options, { design: "none", method: "art", artContrasts: "cells" });
  assert.ok(r.sources.some((s) => /Wobbrock/.test(s.label)));
  assert.ok(r.alternatives.some((a) => a.test === "Two-way ANOVA" && a.target));
  assert.ok(r.notes.some((n) => /log\(values\)/.test(n)));
  assert.match(r.methods, /aligned rank transform \(Wobbrock et al\. 2011\)/);
  // repeated measures, or 3 or fewer per cell: the parametric route stays
  assert.notEqual(recommend({ ...DEFAULT_DESIGN, factors: "two", distribution: "not_normal",
    repeated: "one", sampleSize: "medium" }).rule, "two_way_art");
  assert.equal(recommend({ ...DEFAULT_DESIGN, factors: "two", distribution: "not_normal",
    sampleSize: "tiny" }).rule, "two_way");
});
