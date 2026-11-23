// Flow event counts (P-50): the engine payload and the count format.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { count, DEFAULT_EVENT_FIELDS, eventsPayload } from "../eventsModel.ts";

test("payload: each part is sent when one of its fields holds a number", () => {
  assert.deepEqual(eventsPayload(DEFAULT_EVENT_FIELDS),
    { analysis: "flow_events", data: { target_cv: 10, frequency: 0.1 }, options: { ci_level: 0.95 } });
  const both = eventsPayload({ cv: "5", frequency: "1,5", positive: "120", total: "50000", ciLevel: 0.99 });
  assert.deepEqual(both.data, { target_cv: 5, frequency: 1.5, positive: 120, total: 50000 });
  assert.equal(both.options.ci_level, 0.99);
  // one field of a part: sent, so the engine says what the other needs
  assert.deepEqual(eventsPayload({ ...DEFAULT_EVENT_FIELDS, cv: "", frequency: "", positive: "7" }).data, { positive: 7 });
  // blanks and text that is no number are left out
  assert.deepEqual(eventsPayload({ cv: " ", frequency: "abc", positive: "", total: "", ciLevel: 0.95 }).data, {});
});

test("counts are whole numbers with grouping", () => {
  assert.equal(count(100000), "100,000");
  assert.equal(count(100), "100");
  assert.equal(count(null), "");
});
