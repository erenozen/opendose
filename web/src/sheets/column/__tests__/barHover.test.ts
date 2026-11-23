// P-57: hovering a bar shows the mean, SD and n behind it.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { barHover, summaryOf } from "../graphSettings.ts";

// WT normalized (the P-57 example): row "1 µM" -> (55, 60, 58) on 21..99.667
const v = [43.220338983050844, 49.57627118644067, 47.03389830508474];

test("a mean ± SEM bar also says the mean, SD and n", () => {
  const st = summaryOf(v, "mean_sem")!;
  // numpy: mean 46.61, np.std(v, ddof=1) = 3.199, SEM 1.847
  assert.equal(barHover("WT", v, st.label), "WT: mean 46.61 ± SEM 1.847<br>mean 46.61, SD 3.199, n = 3");
});

test("a mean ± SD bar adds n only; one value has no SD", () => {
  assert.equal(barHover("WT", v, summaryOf(v, "mean_sd")!.label), "WT: mean 46.61 ± SD 3.199, n = 3");
  assert.equal(barHover("A", [5], summaryOf([5], "mean_sem")!.label),
    "A: mean 5.000 ± SEM 0.000<br>mean 5.000, SD n/a (n = 1), n = 1");
  assert.equal(barHover("B", [], "n/a"), "B: n/a");
});
