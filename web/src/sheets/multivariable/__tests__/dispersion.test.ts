// P-46: the dispersion chip of a Poisson regression and the quasi option
// in the engine payload. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { dispersionChip, overdispersed } from "../dispersion.ts";
import { defaultPoisson, poissonPayload } from "../model.ts";

// Ames TA98 (engine/tests/reference/quasi_poisson.json): φ = 3.0847, 15 df
const ames = { family: "poisson", dispersion: { phi: 3.0847112876236906, df: 15 } };

test("overdispersed counts get a warn chip that offers quasi-Poisson", () => {
  const c = dispersionChip("mv_poisson", ames, "r1");
  assert.ok(c);
  assert.equal(c.label, "Counts are overdispersed (φ = 3.085)");
  assert.equal(c.state, "warn");
  assert.equal(c.action, "quasi-poisson");
  assert.equal(c.target, "r1");
  assert.match(c.detail, /multiplies every standard error by √φ = 1\.756\./);
  assert.ok(c.sources?.some((s) => s.url === "https://doi.org/10.1093/biomet/61.3.439"));
});

test("quasi-Poisson on: an ok chip that says what changed and offers the way back", () => {
  const c = dispersionChip("mv_poisson", { ...ames, family: "quasipoisson" }, "r1");
  assert.ok(c);
  assert.equal(c.label, "Quasi-Poisson SEs (φ = 3.085)");
  assert.equal(c.state, "ok");
  assert.equal(c.action, "quasi-poisson");
  assert.match(c.detail, /√φ = 1\.756, the P values come from t with 15 df/);
  assert.doesNotMatch(c.detail, /below 1/);
  const under = dispersionChip("mv_poisson", { family: "quasipoisson", dispersion: { phi: 0.25, df: 4 } }, "r1");
  assert.match(under!.detail, /φ is below 1, so these SEs are smaller than the Poisson ones/);
});

test("no chip: not overdispersed, too few df, other analyses, errors, no result", () => {
  assert.equal(dispersionChip("mv_poisson", { dispersion: { phi: 1.4, df: 20 } }, "r1"), null);
  assert.equal(dispersionChip("mv_poisson", { dispersion: { phi: 4, df: 4 } }, "r1"), null);
  assert.equal(dispersionChip("mv_logistic", ames, "r1"), null);
  assert.equal(dispersionChip("mv_poisson", { error: "every count is 0" }, "r1"), null);
  assert.equal(dispersionChip("mv_poisson", null, "r1"), null);
  assert.equal(overdispersed({ dispersion: { phi: 1.5, df: 5 } }), false);
  assert.equal(overdispersed({ dispersion: { phi: 1.51, df: 5 } }), true);
});

test("the quasi option reaches the engine only when on; older options default to Poisson", () => {
  const t = normalizeTable({
    type: "multiple",
    rowTitles: [],
    datasets: [
      { name: "Dose", rows: [["0"], ["10"], ["33"], ["100"], ["333"], ["1000"]] },
      { name: "Revertants", rows: [["15"], ["16"], ["16"], ["27"], ["33"], ["20"]] },
    ],
  });
  const o = defaultPoisson(t);
  assert.equal(o.quasi, false);
  const off = poissonPayload(t, o) as { options: Record<string, unknown> };
  assert.equal("quasi" in off.options, false);
  const on = poissonPayload(t, { ...o, quasi: true }) as { options: Record<string, unknown> };
  assert.equal(on.options.quasi, true);
});
