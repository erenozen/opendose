// qPCR reference-gene check: chips, one-click choices, the methods
// sentence and the payload, against the engine's reference_stability for
// the module's example (ACTB raised 1.5 cycles in LPS + inhibitor):
// ACTB shifts 1.44 cycles (ANOVA P = 0.0044), GAPDH 0.42 (P = 0.57),
// geNorm M 0.592 for both. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QPCR_OPTIONS, normalizeQpcrOptions, readQpcr, runQpcr } from "../model.ts";
import { qpcrSample } from "../sample.ts";
import {
  badInUse, referenceActions, referenceCandidates, referenceCheckPayload, referenceChips,
  referenceMethods, usableReferences,
} from "../refs.ts";

const gm = (c: number, l: number, i: number) => [
  { group: "Control", n: 3, mean_cq: c }, { group: "LPS", n: 3, mean_cq: l },
  { group: "LPS + inhibitor", n: 3, mean_cq: i }];
const STAB = {
  reference_genes: ["GAPDH", "ACTB"],
  genes: [
    { gene: "GAPDH", M: 0.5920796680627813, unstable: false, shifts_with_treatment: false, flags: [],
      shift: 0.42111111111110944, shift_between: ["Control", "LPS + inhibitor"], group_means: gm(17.632, 17.897, 18.053),
      group_test: { test: "one-way ANOVA", p: 0.5657336904160756, statistic: 0.62, dfn: 2, dfd: 6 } },
    { gene: "ACTB", M: 0.5920796680627813, unstable: false, shifts_with_treatment: true,
      flags: ["shifts_with_treatment"], shift: 1.4377777777777752, shift_between: ["Control", "LPS + inhibitor"],
      group_means: gm(16.984, 17.209, 18.422),
      group_test: { test: "one-way ANOVA", p: 0.004353721417004115, statistic: 13.1, dfn: 2, dfd: 6 } },
  ],
  pairs: [{ gene_a: "GAPDH", gene_b: "ACTB", n: 9, mean_dcq: 0.322, sd_dcq: 0.592 }],
  thresholds: { m: 1.5, shift_cq: 1, alpha: 0.05 },
};

test("chips: ACTB shifts with treatment, GAPDH stable", () => {
  assert.deepEqual(referenceChips(STAB).map((c) => [c.tone, c.text]), [
    ["pass", "GAPDH stable (M = 0.59)"],
    ["fail", "ACTB shifts with treatment by 1.4 Cq (P = 0.0044): do not normalise to it"],
  ]);
  assert.deepEqual(usableReferences(STAB), ["GAPDH"]);
  assert.deepEqual(badInUse(STAB, ["GAPDH", "ACTB"]), ["ACTB"]);
  assert.deepEqual(badInUse(STAB, ["GAPDH"]), []);
  const unstable = { ...STAB, genes: [{ ...STAB.genes[0], unstable: true, M: 1.62 }] };
  assert.equal(referenceChips(unstable)[0].text, "GAPDH not stable (M = 1.6 > 1.5)");
  const one = { ...STAB, genes: [{ ...STAB.genes[0], M: null }] };
  assert.equal(referenceChips(one)[0].text, "GAPDH does not shift with treatment (P = 0.5657)");
});

test("one-click choices leave out the current one", () => {
  assert.deepEqual(referenceActions(STAB, ["GAPDH", "ACTB"]).map((a) => [a.label, a.genes]),
    [["Use GAPDH only", ["GAPDH"]]]);
  assert.deepEqual(referenceActions(STAB, ["GAPDH"]).map((a) => [a.label, a.genes]),
    [["Use both (geometric mean)", ["GAPDH", "ACTB"]]]);
  assert.deepEqual(referenceActions(null, []), []);
});

test("methods: which references were used and why", () => {
  const m = referenceMethods(STAB, ["GAPDH"]);
  assert.match(m, /^Reference genes were checked before normalisation: geNorm M over all samples \(Vandesompele et al\. 2002; M > 1\.5 = not stable\)/);
  assert.match(m, /GAPDH was stable \(M = 0\.59; 0\.42 cycles between groups, P = 0\.5657\) and was used/);
  assert.match(m, /ACTB shifted with treatment \(M = 0\.59; 1\.4 cycles between groups, P = 0\.0044\) and was not used\.$/);
});

test("candidates and the stand-alone check payload", () => {
  assert.deepEqual(referenceCandidates(["GAPDH"], ["GAPDH", "ACTB", "gone"], ["GAPDH", "ACTB", "IL6"]),
    ["GAPDH", "ACTB"]);
  const o = normalizeQpcrOptions({ referenceGenes: ["GAPDH"], referenceCandidates: ["GAPDH", "ACTB"] });
  assert.deepEqual(o.referenceCandidates, ["GAPDH", "ACTB"]);
  assert.deepEqual(normalizeQpcrOptions({}).referenceCandidates, []);
  const d = readQpcr(qpcrSample(), o);
  const p = referenceCheckPayload(d, o, ["GAPDH", "ACTB"], "Control", { GAPDH: 2, ACTB: 2 }, ["Control", "LPS"]);
  assert.equal(p.analysis, "qpcr_reference_check");
  assert.equal(p.data.records.length, 54);
  assert.ok(p.data.records.every((r: { target: string }) => r.target === "GAPDH" || r.target === "ACTB"));
  assert.deepEqual(p.options.reference_genes, ["GAPDH", "ACTB"]);
  assert.equal(p.options.calibrator, "Control");
});

test("run: a gene set aside stays in the check (a second engine call)", () => {
  const calls: { analysis: string }[] = [];
  const engine = (payload: unknown) => {
    const q = payload as { analysis: string };
    calls.push(q);
    if (q.analysis === "qpcr") {
      return { reference_genes: ["GAPDH"], calibrator: "Control", groups: ["Control", "LPS", "LPS + inhibitor"],
        efficiencies: { GAPDH: { efficiency: 2 }, ACTB: { efficiency: 2 } }, reference_stability: { genes: [] } };
    }
    return STAB;
  };
  const o = normalizeQpcrOptions({ referenceGenes: ["GAPDH"], referenceCandidates: ["GAPDH", "ACTB"] });
  const r = runQpcr(engine, qpcrSample(), o);
  assert.deepEqual(calls.map((c) => c.analysis), ["qpcr", "qpcr_reference_check"]);
  assert.equal(r.reference_stability, STAB);
  // the gene set aside is not analysed as a target
  assert.deepEqual((calls[0] as unknown as { options: { targets: string[] } }).options.targets, ["IL6", "TNF"]);
  // no extra candidates: one call
  calls.length = 0;
  runQpcr(engine, qpcrSample(), DEFAULT_QPCR_OPTIONS);
  assert.deepEqual(calls.map((c) => c.analysis), ["qpcr"]);
});
