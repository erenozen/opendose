// Bootstrap CIs of a curve fit (P-101): the engine options built from the
// typed settings and the words the results use for how the CIs were made.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bootstrapNote, bootstrapOption, bootstrapRows, bootstrapState, bootstrapWarnings, ciMethodWords,
} from "../bootstrap.ts";
import type { FitResult } from "../../../types.ts";

test("no bootstrap option unless the CI method is bootstrap", () => {
  assert.deepEqual(bootstrapOption({ ciMethod: "asymptotic" }), {});
  assert.deepEqual(bootstrapOption({ ciMethod: "profile", bootstrap: { method: "residual", resamples: "500", seed: "3" } }), {});
});

test("defaults for files saved before, typed values as numbers", () => {
  assert.deepEqual(bootstrapState({}), { method: "case", resamples: "2000", seed: "1" });
  assert.deepEqual(bootstrapOption({ ciMethod: "bootstrap" }),
    { bootstrap: { method: "case", resamples: 2000, seed: 1 } });
  assert.deepEqual(bootstrapOption({ ciMethod: "bootstrap", bootstrap: { method: "residual", resamples: "5000", seed: "42" } }),
    { bootstrap: { method: "residual", resamples: 5000, seed: 42 } });
  // blank takes the default; a number out of range goes as typed (the engine says what to enter)
  assert.deepEqual(bootstrapOption({ ciMethod: "bootstrap", bootstrap: { method: "case", resamples: "", seed: "50" } }),
    { bootstrap: { method: "case", resamples: 2000, seed: 50 } });
  assert.equal(bootstrapOption({ ciMethod: "bootstrap", bootstrap: { method: "case", resamples: "20", seed: "1" } })
    .bootstrap?.resamples, 20);
});

const fit = {
  ci_method: "bootstrap",
  param_order: ["Top", "LogIC50", "IC50"],
  params: {},
  bootstrap: {
    method: "case", resamples: 2000, seed: 1, ci_level: 0.95, interval: "percentile", converged: 1988, failed: 12,
    params: {
      LogIC50: { value: -6.983, ci95: [-7.012, -6.947], se: 0.0165, bias: -0.0004, asymptotic_ci95: [-7.013, -6.953] },
      IC50: { value: 1.04e-7, ci95: null, se: null, bias: null, asymptotic_ci95: null, undefined: 3 },
    },
    warnings: ["12 of 2,000 resamples could not be refitted and were left out"],
  },
} as unknown as FitResult;

test("the note says how the CIs were made, the SE column and what stays asymptotic", () => {
  assert.equal(bootstrapNote(fit), "Bootstrap percentile CIs from 2,000 case resamples (seed 1), 1,988 refitted. "
    + "Std. Error is asymptotic; bands and interpolated values use the asymptotic covariance.");
  const all = { ...fit, bootstrap: { ...fit.bootstrap, method: "residual", failed: 0 } } as FitResult;
  assert.match(bootstrapNote(all)!, /2,000 residual resamples \(seed 1\), all refitted\./);
  assert.equal(bootstrapNote({ ci_method: "asymptotic" }), null);
  assert.equal(bootstrapNote({ ci_method: "asymptotic", bootstrap: { error: "Bootstrap CIs are not computed with ROUT: the resamples would not repeat the outlier removal. The CIs shown are asymptotic" } }),
    "Bootstrap CIs are not computed with ROUT: the resamples would not repeat the outlier removal. The CIs shown are asymptotic.");
  assert.deepEqual(bootstrapWarnings(fit), ["12 of 2,000 resamples could not be refitted and were left out."]);
});

test("the details fold lists each value in the table's order", () => {
  assert.deepEqual(bootstrapRows(fit), [
    { name: "LogIC50", se: 0.0165, bias: -0.0004, asymptotic: [-7.013, -6.953] },
    { name: "IC50", se: null, bias: null, asymptotic: null },
  ]);
  assert.deepEqual(bootstrapRows({ ...fit, bootstrap: { error: "no" } } as FitResult), []);
});

test("CI method in words", () => {
  assert.equal(ciMethodWords("bootstrap"), "bootstrap percentile");
  assert.equal(ciMethodWords("profile"), "profile likelihood");
  assert.equal(ciMethodWords(undefined), "asymptotic");
});
