// P-62: sex as a biological variable. The detection rule (tight: a header
// named sex or gender, or labels that are all F / M / female / male with
// both sexes), its false positives, the Checks row chip, the paste guide's
// question and the journal checklist item.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, evaluateChecklists, type FamilyFacts } from "../../report/checklists.ts";
import { makeDataSheet, makeProject, makeResultsSheet } from "../../project/ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import { emptyDesign } from "../../project/studyDesign.ts";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { parsePasted } from "../paste.ts";
import {
  allSexLabels, findSexFactor, isSexHeader, sexChip, sexFacts, sexOf, sexPasteNote, sexTwoWayOptions,
} from "../sex.ts";

const grouped = (rows: string[], sets = ["Vehicle", "Drug"]): DataTableModel => normalizeTable({
  type: "grouped", rowTitles: rows,
  datasets: sets.map((name, k) => ({ name, rows: rows.map((_, r) => [String(10 + r + k), String(11 + r + k)]) })),
}, "grouped");
const column = (sets: string[], rowTitles?: string[]): DataTableModel => normalizeTable({
  type: "column", rowTitles,
  datasets: sets.map((name) => ({ name, rows: [["1"], ["2"], ["3"], ["4"]] })),
}, "column");
const mv = (cols: [string, string[]][]): DataTableModel => normalizeTable({
  type: "multivariable", rowTitles: cols[0][1].map((_, i) => `S${i + 1}`),
  datasets: cols.map(([name, vals]) => ({ name, rows: vals.map((v) => [v]),
    varType: vals.every((v) => Number.isFinite(Number(v))) ? "continuous" : "categorical" })),
}, "multivariable");

test("the words: F, M, female, male (any case, plurals), nothing else", () => {
  for (const w of ["F", "f", " Female ", "FEMALES"]) assert.equal(sexOf(w), "female", w);
  for (const w of ["M", "male", "Males"]) assert.equal(sexOf(w), "male", w);
  for (const w of ["M1", "Ma", "Mouse", "W", "woman", "♂", "", "1 M", "mM"]) assert.equal(sexOf(w), null, w);
  assert.equal(allSexLabels(["F", "M", "F", "M"]), true);
  assert.equal(allSexLabels(["Female", "male", ""]), true);
  assert.equal(allSexLabels(["M", "M", "M"]), false, "one sex only: not asked");
  assert.equal(allSexLabels(["M"]), false);
  assert.equal(allSexLabels(["F", "M", "Control"]), false);
  assert.equal(isSexHeader("Sex"), true);
  assert.equal(isSexHeader(" gender "), true);
  assert.equal(isSexHeader("Sex (F/M)"), true);
  assert.equal(isSexHeader("Sexual maturity"), false);
  assert.equal(isSexHeader("Sex ratio"), false);
});

test("rows F and M of a grouped table are found", () => {
  const f = findSexFactor(grouped(["F", "M"]))!;
  assert.equal(f.where, "rows");
  assert.deepEqual(f.labels, ["F", "M"]);
  assert.equal(f.phrase, "rows F and M");
  assert.equal(findSexFactor(grouped(["F", "M", "F", "M"]))!.phrase, "rows F and M");
  assert.equal(findSexFactor(grouped(["Vehicle", "Drug"], ["Female", "Male"]))!.phrase,
    "data sets Female and Male");
  assert.equal(findSexFactor(column(["F", "M"]))!.where, "datasets");
  // a column table whose rows are animals labelled by sex
  assert.equal(findSexFactor(column(["Vehicle", "Drug"], ["F", "M", "F", "M"]))!.where, "rows");
  // a blank trailing row title is not a label
  const t = grouped(["F", "M", ""]);
  assert.equal(findSexFactor(t)!.phrase, "rows F and M");
});

test("unrelated M labels never fire", () => {
  assert.equal(findSexFactor(grouped(["M", "Control"])), null, "M next to another label");
  assert.equal(findSexFactor(grouped(["1 M", "10 M"])), null, "molar concentrations");
  assert.equal(findSexFactor(grouped(["M1", "M2", "F1"])), null, "IDs that start with M or F");
  assert.equal(findSexFactor(grouped(["M", "M"])), null, "M alone");
  assert.equal(findSexFactor(column(["M", "N", "O"])), null, "letters");
  assert.equal(findSexFactor(column(["WT F", "WT M"])), null, "combined labels");
  assert.equal(findSexFactor(grouped(["Vehicle", "Drug"], ["WT", "KO"])), null);
  // XY, contingency and survival tables are not checked
  const xy = normalizeTable({ type: "xy", x: ["1", "2"], rowTitles: ["F", "M"],
    datasets: [{ name: "A", rows: [["1"], ["2"]] }] }, "xy");
  assert.equal(findSexFactor(xy), null);
  // a multiple-variables column of M and F with a third value, or numbers
  assert.equal(findSexFactor(mv([["Grade", ["M", "F", "X"]], ["Y", ["1", "2", "3"]]])), null);
});

test("a multiple-variables column: by its header, or by values that are all sexes", () => {
  const byName = findSexFactor(mv([["Weight", ["20", "22", "25"]], ["Sex", ["1", "2", "1"]]]))!;
  assert.equal(byName.where, "column");
  assert.equal(byName.index, 1);
  assert.equal(byName.phrase, "the column “Sex”");
  const byValues = findSexFactor(mv([["Animal sex", ["female", "male", "male"]], ["Y", ["1", "2", "3"]]]))!;
  assert.equal(byValues.index, 0);
});

test("the Checks row suggests two-way ANOVA with sex and the interaction, as a question", () => {
  const t = grouped(["F", "M"]);
  const f = findSexFactor(t)!;
  const multi = sexChip(f, t, "grouped_multiple_t", {});
  assert.equal(multi.state, "info");
  assert.equal(multi.action, "sex-two-way");
  assert.match(multi.label, /^Are rows F and M sex\?/);
  assert.match(multi.detail, /^Are rows F and M the sex of the animals or subjects\? If so/);
  assert.match(multi.detail, /two-way ANOVA with sex and the interaction/);
  assert.match(multi.detail, /If they are not sex, ignore this note\./);
  assert.deepEqual(multi.sources?.map((s) => s.label.split(",")[0]),
    ["Heidari et al. 2016", "Clayton & Collins 2014"]);
  // already a factor of the two-way ANOVA
  assert.equal(sexChip(f, t, "grouped_two_way", { model: "full" }).state, "ok");
  const additive = sexChip(f, t, "grouped_two_way", { model: "additive" });
  assert.equal(additive.state, "warn");
  assert.match(additive.label, /interaction is left out/);
  // a column table: no one-click two-way, it says how to enter the data
  const c = column(["F", "M"]);
  const cc = sexChip(findSexFactor(c)!, c, "column", {});
  assert.equal(cc.action, undefined);
  assert.match(cc.detail, /Enter the values in a Grouped table/);
  // the two-way the chip opens: sex is the row factor, treatments within each sex
  assert.deepEqual(sexTwoWayOptions(f), { design: "none", model: "full", comparisons: "sidak",
    direction: "columns_within_rows", rowFactor: "Sex", interactionFocus: true });
  assert.equal(sexTwoWayOptions(findSexFactor(grouped(["a", "b"], ["F", "M"]))!).colFactor, "Sex");
  // multiple variables: in the model or not
  const m = mv([["Weight", ["20", "22", "25", "21"]], ["Sex", ["F", "M", "F", "M"]], ["Dose", ["0", "1", "0", "1"]]]);
  const mf = findSexFactor(m)!;
  assert.match(sexChip(mf, m, "mv_multiple_regression", { predictors: ["Dose"] }).label, /^If “Sex” is sex, include it as a factor$/);
  assert.equal(sexChip(mf, m, "mv_multiple_regression", { predictors: ["Dose", "Sex"],
    interactions: [["Dose", "Sex"]] }).state, "ok");
});

test("the paste guide asks about a sex column", () => {
  const b = parsePasted("Sex\tWeight\tDose\nF\t20\t0\nM\t25\t1\nF\t21\t1\n")!;
  assert.equal(sexPasteNote(b), "Is the column “Sex” the sex of the animals or subjects? If so, keep sex as a "
    + "factor: analyse with sex and its interaction, and report the results for each sex (SAGER, NIH SABV).");
  assert.match(sexPasteNote(parsePasted("Group\tA\tB\nF\t1\t2\nM\t3\t4\n")!) ?? "", /^Is the column “Group”/);
  assert.match(sexPasteNote(parsePasted("Female\tMale\n1\t2\n3\t4\n")!) ?? "", /^Are the columns Female and Male the sex/);
  assert.equal(sexPasteNote(parsePasted("Conc\tA\tB\nM\t1\t2\nmM\t3\t4\n")!), null);
  assert.equal(sexPasteNote(parsePasted("1\t2\n3\t4\n")!), null);
  assert.equal(sexPasteNote(null), null);
});

const prefs = projectPrefs(DEFAULT_PREFS);
const facts = (over: Partial<FamilyFacts>): FamilyFacts => ({
  dataId: "d1", dataName: "Body weight", results: [], graphs: [], meta: {}, excludedCount: 0,
  minN: null, powerJustification: null, software: "OpenDose", normalityChecked: false, ...over,
});

test("the checklist gains a sex item: met when sex is a factor of an analysis", () => {
  const t = grouped(["F", "M"]);
  const p = (analysis: string) => makeProject(prefs, [makeDataSheet("d1", "Body weight", t),
    makeResultsSheet("r1", "d1", analysis, {}, `${analysis} of Body weight`)], "P");
  const multi = sexFacts(p("grouped_multiple_t"), "d1");
  assert.equal(multi.factor?.phrase, "rows F and M");
  assert.equal(multi.analysedIn, null);
  const unmet = RULES.sex(facts({ sex: multi }));
  assert.equal(unmet.status, "unmet");
  assert.match(unmet.reason, /^Rows F and M look like sex\. If they are, analyse with sex as a factor/);
  const two = sexFacts(p("grouped_two_way"), "d1");
  assert.deepEqual(two.analysedIn, { sheetId: "r1", name: "grouped_two_way of Body weight" });
  assert.equal(RULES.sex(facts({ sex: two })).status, "met");
  // no sex in the table: the study design record decides
  const none = { factor: null, analysedIn: null };
  assert.equal(RULES.sex(facts({ sex: none })).status, "na");
  const d = (sex: "female" | "male" | "both") => ({ sheetId: "i1", design: { ...emptyDesign(), sex } });
  assert.equal(RULES.sex(facts({ sex: none, design: d("both") })).status, "unmet");
  assert.equal(RULES.sex(facts({ sex: none, design: d("male") })).status, "met");
  assert.match(RULES.sex(facts({ sex: none, design: d("male") })).reason, /say why in the methods/);
  const arrive = evaluateChecklists(facts({ sex: multi })).find((l) => l.id === "arrive")!;
  const item = arrive.items.find((i) => i.id === "sabv")!;
  assert.equal(item.status, "unmet");
  assert.match(item.source, /SAGER/);
  // an unrelated table: no sex facts at all
  const plain = makeProject(prefs, [makeDataSheet("d1", "Doses", grouped(["Vehicle", "Drug"]))], "P");
  assert.deepEqual(sexFacts(plain, "d1"), { factor: null, analysedIn: null });
});
