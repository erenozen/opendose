// "What this means" of the assay modules (report/meaningMore.ts, P-69),
// on each module's example run through the engine natively: the recorded
// results of sheets/assays/__tests__/analysed.fixtures.json (standard
// curve, plate, flow, densitometry, luciferase, wound, MIC, kinetics) and
// of assay-meaning.fixtures.json (growth, synergy, AUC, volcano,
// clustering; assayMeaning.gen.ts). Each sentence is pinned (statistical
// wording is scientific output, ruling 10); its numbers are the module's
// own fields as the results sheet writes them; P above 0.05 is never "no
// difference"; each reader cites its sources from guide/sources.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { meaningOf } from "../meaning.ts";
import { SRC } from "../../guide/sources.ts";
import { analysedCases } from "../../sheets/assays/__tests__/analysedCases.ts";
import { replay } from "../../sheets/assays/__tests__/analysedReplay.ts";
import { meaningCases, MEANING_FIXTURE_FILE } from "./assayMeaningCases.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const FORBIDDEN = /\bprove[sd]?\b|\b(is|was|were|are|shows?|showed|found) no (difference|effect|association)\b|\btrend\b|—/i;
const clone = (v: unknown) => JSON.parse(JSON.stringify(v));
const rec = JSON.parse(readFileSync(new URL(MEANING_FIXTURE_FILE, import.meta.url), "utf8")) as
  Record<string, { payloads: unknown[]; results: unknown[] }>;

interface Run { result: any; analysisId: string; options: any; table: any }
function run(key: string): Run {
  const a = analysedCases().find((c) => c.key === key);
  if (a) return { result: replay(a), analysisId: a.analysisId, options: a.options, table: a.table };
  const c = meaningCases().find((x) => x.key === key)!;
  let i = 0;
  const result = c.run((payload) => {
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), rec[key].payloads[i], `${key}: payload ${i} changed`);
    return rec[key].results[i++];
  });
  return { result, analysisId: c.analysisId, options: c.options, table: c.table };
}
function mean(c: Run, result: unknown = c.result) {
  const m = meaningOf({ analysisId: c.analysisId, result, options: c.options, table: c.table, style: "graphpad" });
  assert.ok(m, `${c.analysisId}: a meaning`);
  assert.doesNotMatch(`${m.sentence} ${m.misreading ?? ""} ${m.test ?? ""}`, FORBIDDEN);
  assert.ok(m.misreading && m.test, "says how it is misread and what was run");
  return m;
}
const cites = (m: { sources: { url: string }[] }, ...s: { url: string }[]) =>
  s.forEach((x) => assert.ok(m.sources.some((y) => y.url === x.url), `cites ${x.url}`));

test("standard curve: accepted by its back-calculated standards (ICH M10), and the reportable range", () => {
  const c = run("stdcurve_example");
  const m = mean(c);
  assert.equal(m.sentence, "The standard curve meets the ICH M10 acceptance criteria: 16 of 16 standards back-calculate "
    + "within the limits (7 of 8 levels), so concentrations from 15.63 to 1000 pg/mL (LLOQ to ULOQ) can be reported. "
    + "2 of 12 unknowns fall outside that range and are not quantified.");
  assert.match(m.misreading!, /^a high R² as an accurate curve/);
  cites(m, SRC.ichM10, SRC.gpInterpolate);
  // a rejected curve says so and why, and asks not to report
  const r = clone(c.result);
  Object.assign(r.plates[0].res.acceptance, { accepted: false, n_pass: 9, reasons: ["fewer than 75% of the standards pass"] });
  assert.match(mean(c, r).sentence, /^The standard curve does not meet the ICH M10 acceptance criteria: 9 of 16 standards .*\(fewer than 75% of the standards pass\), so its concentrations should not be reported\.$/);
});

test("plate: Z′ of the controls, and what it does not check", () => {
  const c = run("plate_example");
  const m = mean(c);
  assert.equal(m.sentence, "Z′ = 0.8491 (excellent): the positive and negative controls are separated by much more than "
    + "their scatter, so the plate can tell an active well from an inactive one (Z′ ≥ 0.5 is an excellent assay).");
  assert.match(m.misreading!, /computed from the control wells only/);
  cites(m, SRC.zhang1999);
  const r = clone(c.result);
  Object.assign(r.plates[0].qc, { z_prime: 0.31, category: "marginal" });
  assert.match(mean(c, r).sentence, /^Z′ = 0\.31 \(marginal\): the controls overlap enough/);
  Object.assign(r.plates[0].qc, { z_prime: -0.4, category: "unusable" });
  assert.match(mean(c, r).sentence, /cannot separate active from inactive wells/);
});

test("flow: n is the donors, not the cells", () => {
  const m = mean(run("flow_example"));
  assert.equal(m.sentence, "CD69+ · Freq. of Parent is one value per donor and condition: 3 donors in 4 conditions, "
    + "so n is 3 donors, however many cells were acquired.");
  cites(m, SRC.lord2020, SRC.lazic2010);
});

test("densitometry: the ratio paired t test's ratio with its CI, blots as the unit", () => {
  const c = run("dens_example");
  const m = mean(c);
  assert.equal(m.sentence, "The normalised target signal in Drug was 2.427 times that in Control (95% CI 1.99 to 2.96; "
    + "4 blots); a ratio this far from 1 would be unusual (P = 0.0008) if the treatment did not change it.");
  assert.match(m.test!, /^Ratio paired t test, blot as the pairing unit/);
  cites(m, SRC.degasperi2014, SRC.gpRatioPaired, SRC.greenland2016);
  // P above 0.05: never "no change"; the CI includes 1
  const r = clone(c.result);
  Object.assign(r.statistics, { geometric_mean_ratio: 1.2, ci_ratio: [0.8, 1.8], p_two_tailed: 0.31 });
  const ns = mean(c, r);
  assert.match(ns.sentence, /was 1\.2 times that in Control \(95% CI 0\.8 to 1\.8; 4 blots\); the data do not show a change \(P = 0\.3100\), and the CI includes 1\.$/);
  cites(ns, SRC.amrhein2019);
  // no test (too few blots): no meaning, never an empty sentence
  assert.equal(meaningOf({ analysisId: c.analysisId, result: { ...clone(c.result), statistics: null }, style: "graphpad" }), null);
});

test("luciferase: the first comparison with the control, experiments as the unit", () => {
  const m = mean(run("luc_example"));
  assert.equal(m.sentence, "The firefly / Renilla ratio in Promoter was 4.401 times that in Empty vector (95% CI 3.951 to 4.902; "
    + "3 experiments; first comparison with the control shown, P adjusted for the comparisons); a ratio this far from 1 "
    + "would be unusual (P < 0.0001) if the treatment did not change it.");
  assert.match(m.misreading!, /assumes the treatment leaves Renilla unchanged/);
  cites(m, SRC.gpRatioPaired, SRC.lazic2010);
});

test("growth: the doubling time with its CI, early in growth", () => {
  const m = mean(run("growth_example"));
  assert.equal(m.sentence, "A1 doubles every 0.6196 h (95% CI 0.6035 to 0.6367) while it is still at low density "
    + "(ln 2 / K of the logistic growth fit).");
  cites(m, SRC.sprouffske2016, SRC.zwietering1990);
  const c = run("growth_example");
  assert.equal(meaningOf({ analysisId: c.analysisId, result: { ...c.result, doubling: [null] }, style: "graphpad" }), null);
});

test("wound healing: the closure rate against the control, wells as the unit", () => {
  const c = run("wound_example");
  const m = mean(c);
  assert.equal(m.sentence, "The wound closed 1.107% of the initial wound area per h slower in siRNA than in Control "
    + "(difference −1.107, 95% CI −1.533 to −0.6814; first comparison with the control shown, P adjusted for the comparisons); "
    + "a difference this large would be unusual (P = 0.0001) if the conditions closed at the same rate.");
  assert.match(m.misreading!, /migrating and by dividing/);
  cites(m, SRC.jonkman2014, SRC.grada2017, SRC.lazic2010);
  const r = clone(c.result);
  Object.assign(r.statistics.comparisons[0], { difference: 0.2, ci: [-0.3, 0.7], p_adjusted: 0.42 });
  assert.match(mean(c, r).sentence, /closed 0\.2% of the initial wound area per h faster in siRNA .*the data do not show a difference in closure rate \(P = 0\.4200\)\.$/);
});

test("MIC: MIC50 and MIC90 across strains, the isolate count CLSI M39 asks for; one strain alone", () => {
  const c = run("mic_example");
  const m = mean(c);
  assert.equal(m.sentence, "Across 6 strains, MIC50 is 4 µg/mL and MIC90 64 µg/mL (range 2 to 64): half of the strains "
    + "are inhibited at 4 µg/mL or less, and 90% at 64 µg/mL or less; CLSI M39 asks for at least 10 isolates before "
    + "reporting MIC90.");
  assert.match(m.misreading!, /lies between it and the next lower concentration/);
  cites(m, SRC.clsiM07, SRC.clsiM39);
  const one = { ...clone(c.result), strains: [c.result.strains[0]], cumulative: null };
  assert.equal(mean(c, one).sentence, "The MIC of Isolate 1 is 2 µg/mL (replicate series: 2, 2, 4, within one dilution of each other).");
});

test("kinetics: the initial rates and how they were read", () => {
  const m = mean(run("kinetic_example"));
  assert.equal(m.sentence, "The initial rates (mean of each sample's wells) run from 0.01192 at substrate 25 to 0.07327 at "
    + "substrate 1600, each from the steepest slope over 5 consecutive reads, with the “No enzyme” rate subtracted; the linked "
    + "substrate-rate table is ready for a Michaelis-Menten fit, which estimates Km and Vmax.");
  cites(m, SRC.bisswanger2014);
});

test("synergy: each model's score with SynergyFinder's reading; disagreement is said", () => {
  const c = run("synergy_example");
  const m = mean(c);
  assert.equal(m.sentence, "Averaged over the combination matrix of Ispinesib and Ibrutinib, the synergy scores are HSA 20.2 "
    + "(likely synergistic, P = 0.0531), Bliss 10.86 (likely synergistic, P = 0.1141), Loewe 21.33 (likely synergistic, "
    + "P = 0.0434) and ZIP 11.5 (likely synergistic, P = 0.0275). A score is the mean excess of the observed over the "
    + "expected % inhibition, in percentage points.");
  cites(m, SRC.ianevski2017, SRC.yadav2015, SRC.bliss1939);
  const r = clone(c.result);
  r.scores.bliss = 3.2;
  assert.match(mean(c, r).sentence, /Bliss 3\.2 \(likely additive.*; the models disagree, so the call depends on which definition of no interaction applies\./);
});

test("area under the curve: each area with its CI and the comparison", () => {
  const c = run("auc_example");
  const m = mean(c);
  assert.equal(m.sentence, "The area under the curve is Chow 20480 (95% CI 18710 to 22260) and High-fat diet 33110 "
    + "(95% CI 29580 to 36650), each the mean of one area per experiment; the areas differ (Chow − High-fat diet = −12630, "
    + "unpaired t test, P < 0.0001).");
  cites(m, SRC.gpAuc, SRC.bailer1988);
  const r = clone(c.result);
  r.comparison.p = 0.2;
  assert.match(mean(c, r).sentence, /; the data do not show that the areas differ \(Chow − High-fat diet = −12630, unpaired t test, P = 0\.2000\)\.$/);
});

test("volcano: the hits at both thresholds, and what FDR control means", () => {
  const c = run("volcano_example");
  const m = mean(c);
  assert.equal(m.sentence, "Of 240 rows, 19 are up and 12 down: adjusted P below 0.05 (Benjamini-Hochberg FDR) and "
    + "|log2 fold change| at least 1.");
  assert.match(m.misreading!, /a row that is not a hit is not shown to be unchanged/);
  cites(m, SRC.benjaminiHochberg1995);
  const raw = mean({ ...c, options: { ...c.options, fdr: "none" } }, { ...c.result, method: "none" });
  assert.match(raw.sentence, /: P below 0\.05 and \|log2 fold change\| at least 1\.$/);
  assert.match(raw.misreading!, /^a hit list from unadjusted P values/);
});

test("clustering: how the rows were ordered; clusters are not proof of groups", () => {
  const c = run("cluster_example");
  const m = mean(c);
  assert.equal(m.sentence, "The 24 rows were ordered by average (UPGMA) linkage on Euclidean distances of row z-scores, "
    + "and the row tree cut into 3 clusters.");
  assert.match(m.misreading!, /even in random data/);
  cites(m, SRC.rousseeuw1987, SRC.tibshirani2001);
  const km = { ...clone(c.result), kmeans: { k: 3, silhouette: { mean: 0.41 } } };
  assert.match(mean(c, km).sentence, /; k-means with k = 3 has a mean silhouette width of 0\.41 \(1 is well separated, near 0 overlapping\)\.$/);
});

test("every assay module has a meaning on its example; a failed run has none", () => {
  for (const key of ["stdcurve_example", "plate_example", "flow_example", "dens_example", "luc_example", "growth_example",
    "wound_example", "mic_example", "kinetic_example", "synergy_example", "auc_example", "volcano_example", "cluster_example"]) {
    const c = run(key);
    assert.ok(mean(c).sentence.length > 40, key);
    assert.equal(meaningOf({ analysisId: c.analysisId, result: { error: "no data" }, style: "graphpad" }), null, key);
  }
});
