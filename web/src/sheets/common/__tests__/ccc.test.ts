// P-43: Lin's CCC as the Bland-Altman, Deming and Passing-Bablok results
// print it, with the caveat that it mixes precision and accuracy.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { cccCaveat, cccText, type CccResult } from "../ccc.ts";
import { formatSig } from "../../../types.ts";

// engine/tests/reference/lin_ccc.json, the ejection fractions
const ej: CccResult = { n: 60, ccc: 0.6614149998254911, ci: [0.5089523924152481, 0.7736414318453412],
  ci_level: 0.95, pearson_r: 0.7324973553920947, bias_correction: 0.9029588911914169 };

test("the value with its CI, as the results formatter prints it", () => {
  assert.equal(cccText(ej), `${formatSig(0.6614149998254911)} (95% CI ${formatSig(0.5089523924152481)} to `
    + `${formatSig(0.7736414318453412)})`);
  assert.equal(cccText({ ...ej, ci_level: 0.9 })?.includes("(90% CI "), true);
});

test("a missing CI or a failure says why", () => {
  assert.equal(cccText({ ...ej, ccc: 1, ci: null, ci_note: "the two methods agree exactly" }),
    "1 (no CI: the two methods agree exactly)");
  assert.equal(cccText({ error: "one method gives the same value for every sample" } as CccResult),
    "not computed: one method gives the same value for every sample");
  assert.equal(cccText(undefined), null);
});

test("the caveat names precision and accuracy with their values", () => {
  const c = cccCaveat(ej)!;
  assert.match(c, /^The CCC mixes precision and accuracy: Pearson's r /);
  assert.ok(c.includes(formatSig(0.7324973553920947)) && c.includes(formatSig(0.9029588911914169)));
  assert.match(c, /\(Lin 1989\)\.$/);
  assert.equal(cccCaveat({ error: "x" } as CccResult), null);
});
