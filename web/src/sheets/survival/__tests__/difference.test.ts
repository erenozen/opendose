// P-28: the difference rows of the survival-at-a-time table, from the
// engine's survival_at_time "differences". Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { differenceRows } from "../extras.ts";

// survival::lung by sex at 365 days (engine/tests/reference/survival_difference.json)
const at = {
  differences: [
    { time: 365, group: "Female", reference: "Male", difference: 0.19037519554652693,
      se: 0.07385187738017893, ci: [0.045628175690707956, 0.3351222154023459],
      chi2: 6.206573947715347, p: 0.012727672667573941, note: null },
    { time: 180, group: "Female", reference: "Male", difference: 0.1, se: 0.05, ci: [0, 0.2], p: 0.05, note: null },
  ],
};

test("difference rows in percentage points, for the time shown only", () => {
  const rows = differenceRows(at, 365);
  assert.equal(rows.length, 1);
  const [d] = rows;
  assert.equal(d.label, "Female minus Male");
  assert.ok(Math.abs(d.difference! - 0.19037519554652693 * 100) < 1e-9);
  assert.ok(Math.abs(d.se! - 0.07385187738017893 * 100) < 1e-9);
  assert.ok(Math.abs(d.ci![0] - 0.045628175690707956 * 100) < 1e-9 && Math.abs(d.ci![1] - 0.3351222154023459 * 100) < 1e-9);
  assert.equal(d.p, 0.012727672667573941);
  assert.equal(d.note, null);
});

test("missing pieces stay null with the engine's reason; no result, no rows", () => {
  const rows = differenceRows({ differences: [{ time: 1, group: "B", reference: "A", difference: 0, se: 0,
    ci: null, p: null, note: "survival is 100% in a group at this time (no events yet)" }] }, 1);
  assert.deepEqual(rows[0], { label: "B minus A", difference: 0, se: 0, ci: null, p: null,
    note: "survival is 100% in a group at this time (no events yet)" });
  assert.deepEqual(differenceRows(undefined, 365), []);
  assert.deepEqual(differenceRows({ groups: [] }, 365), []);
});
