// Replays a case of analysedCases.ts against its recorded engine results
// (analysed.fixtures.json): the run gets the results in the order it asks
// for them, and each payload it sends must equal the recorded one, so a
// fixture that no longer matches the module's payload fails loudly.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIXTURE_FILE, type AnalysedCase, type RecordedCase } from "./analysedCases.ts";

const recorded = JSON.parse(readFileSync(new URL(FIXTURE_FILE, import.meta.url), "utf8")) as
  Record<string, RecordedCase>;

/** The payloads a case sent to the engine, as recorded. */
export const replayPayloads = (key: string): unknown[] => recorded[key]?.payloads ?? [];

export function replay(c: AnalysedCase): unknown {
  const rec = recorded[c.key];
  assert.ok(rec, `no recorded results for ${c.key}: run analysedFixtures.gen.ts`);
  let i = 0;
  return c.run((payload) => {
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), rec.payloads[i], `${c.key}: payload ${i} changed`);
    return rec.results[i++];
  });
}
