// P-40: the sphericity chip lists GG ε, HF ε and Mauchly's W with P, and
// the two-way sphericity table rows. Values are those of
// engine/tests/reference/rm_sphericity.json (pingouin 0.7). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { resultChips, sphericityLine, sphericityTerms, type ResultContext } from "../checks.ts";
import { groupChecks } from "../stats.ts";
import { sphericityRowsOf } from "../../sheets/common/sphericity.ts";
import { effectGroups } from "../../report/effects.ts";

const ROWS = [
  [12.1, 14.3, 15.0, 19.8], [10.4, 11.9, 13.7, 14.2], [13.8, 15.1, 18.2, 24.9],
  [9.7, 10.2, 12.5, 13.1], [11.2, 13.8, 14.1, 20.3], [12.9, 13.5, 16.8, 17.0],
  [10.8, 12.7, 13.2, 21.6], [14.2, 15.9, 17.4, 18.1], [11.5, 12.0, 15.3, 22.7],
  [13.1, 14.6, 16.0, 16.4],
];
const table: DataTableModel = normalizeTable({
  type: "column",
  datasets: ["Vehicle", "Low", "Mid", "High"].map((name, j) => ({
    name, rows: ROWS.map((r) => [String(r[j])]) })),
});

const spher = {
  gg_epsilon: 0.38969024861604784, hf_epsilon: 0.41249712705311226, lb_epsilon: 1 / 3,
  contrasts: 3, measurements: 4, n_subjects: 10,
  mauchly: { W: 0.012531706009437718, chi_square: 33.81942098803322, df: 5,
    p: 3.324303537485002e-06 },
};
const oneWay = {
  analysis: "rm_one_way_anova", n_subjects: 10,
  table: { F: 28.08592243411181, gg_epsilon: spher.gg_epsilon,
    p_geisser_greenhouse: 0.0002056433730577898, p_huynh_feldt: 0.0001444167136773771,
    p_assuming_sphericity: 1e-8 },
  sphericity: spher,
  effect_size: { partial_eta_squared: 0.7573203143055232, ci_partial_eta_squared: [0.5, 0.8],
    partial_omega_squared: 0.5257298915906504, ci_partial_omega_squared: null,
    generalized_eta_squared: 0.2, cohens_f: 1.7 },
};
const ctx = (result: Record<string, unknown>, options: Record<string, unknown>): ResultContext => ({
  tableType: "column", analysisId: "column", options, result, table, groups: groupChecks(table),
});

test("sphericity chip lists GG ε, HF ε and Mauchly's W with P", () => {
  const chip = resultChips(ctx(oneWay, { analysis: "rm_anova", rmKind: "parametric" }))
    .find((c) => c.id === "sphericity")!;
  assert.equal(chip.state, "warn");
  assert.equal(chip.label, "Sphericity: ε = 0.39");
  assert.match(chip.detail, /GG ε = 0\.39, HF ε = 0\.412, Mauchly's W = 0\.0125, P < 0\.0001/);
  assert.match(chip.detail, /reported, not used to choose the correction/);
  assert.ok(chip.sources?.some((s) => s.label.startsWith("Mauchly 1940")));
  assert.ok(chip.sources?.some((s) => s.label.startsWith("Lecoutre 1991")));
});

test("without the engine's sphericity block the chip keeps its old text", () => {
  const { sphericity: _s, ...old } = oneWay;
  const chip = resultChips(ctx(old, { analysis: "rm_anova", rmKind: "parametric" }))
    .find((c) => c.id === "sphericity")!;
  assert.ok(!chip.detail.includes("Mauchly"));
  assert.equal(chip.sources, undefined);
});

test("two levels and too few subjects say why there is no W", () => {
  assert.equal(sphericityLine({ gg_epsilon: 1, hf_epsilon: 1, contrasts: 1, mauchly: null }),
    "GG ε = 1, HF ε = 1, 2 levels, so sphericity holds");
  assert.equal(sphericityLine({ gg_epsilon: 0.5, hf_epsilon: null, contrasts: 4, mauchly: null }),
    "GG ε = 0.5, HF ε undefined, Mauchly's test needs more subjects");
});

test("mixed design: the interaction shares the row factor's line", () => {
  const s = { gg_epsilon: 0.38783359214641644, hf_epsilon: 0.41305287550084785, contrasts: 3,
    mauchly: { W: 0.011276772747911324, p: 1.7950278482807577e-05 } };
  const r = { analysis: "rm_two_way_mixed", gg_epsilon: s.gg_epsilon,
    sphericity: { row_factor: s, interaction: { ...s } },
    sources: { row_factor: { p_huynh_feldt: 0.001 }, interaction: { p_huynh_feldt: 0.9 } } };
  const terms = sphericityTerms(r);
  assert.deepEqual(terms.map((t) => t.name), ["Row factor and interaction"]);
  const rows = sphericityRowsOf(r, { row_factor: "Time (repeated)" });
  assert.deepEqual(rows.map((x) => x.name), ["Time (repeated)", "Interaction"]);
  assert.equal(rows[0].hf, s.hf_epsilon);
  assert.equal(rows[0].pHf, 0.001);
  assert.equal(rows[0].mauchlyW, s.mauchly.W);
});

test("both factors repeated: a 2-level term has no Mauchly W", () => {
  const r = { analysis: "rm_two_way_both", sphericity: {
    row_factor: { gg_epsilon: 0.969102958489973, hf_epsilon: 1, contrasts: 2,
      mauchly: { W: 0.9681178957928583, p: 0.8784417991645156 } },
    column_factor: { gg_epsilon: 1, hf_epsilon: 1, contrasts: 1, mauchly: null },
    interaction: { gg_epsilon: 0.727166420214126, hf_epsilon: 0.8311609920649093, contrasts: 2,
      mauchly: { W: 0.624798983834356, p: 0.1523916804605089 } } }, sources: {} };
  const rows = sphericityRowsOf(r);
  assert.deepEqual(rows.map((x) => x.name), ["Row factor", "Column factor", "Interaction"]);
  assert.equal(rows[1].mauchlyW, null);
  assert.equal(rows[1].mauchlyNote, "not needed (2 levels)");
  // the chip reads the smallest epsilon when there is no single one
  const chip = resultChips({ ...ctx(r, { analysis: "rm_two_way", rmTwoDesign: "both" }) })
    .find((c) => c.id === "sphericity")!;
  assert.equal(chip.label, "Sphericity: ε = 0.727");
  assert.match(chip.detail, /Column factor: GG ε = 1, HF ε = 1, 2 levels, so sphericity holds/);
});

test("one-way rows on a one-way result are not table rows", () => {
  assert.deepEqual(sphericityRowsOf(oneWay), []);
});

test("partial ω² of an RM term shows without partial η²'s interval", () => {
  const groups = effectGroups(oneWay, { smd: "d", variance: "omega2" });
  const omega = groups[0].rows.find((r) => r.id === "partial_omega2")!;
  assert.equal(omega.value, 0.5257298915906504);
  assert.equal(omega.ci, null);
  assert.ok(omega.preferred);
  const eta = groups[0].rows.find((r) => r.id === "partial_eta2")!;
  assert.deepEqual(eta.ci, [0.5, 0.8]);
});
