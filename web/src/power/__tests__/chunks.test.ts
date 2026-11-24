// Chunked planning simulations. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeed, runChunks } from "../chunks.ts";

test("runChunks: sizes, consecutive seeds, progress", async () => {
  const calls: [number, number][] = [];
  const progress: number[] = [];
  const r = await runChunks(620, 250, 100, async (n, s) => { calls.push([n, s]); return n; },
    (d) => progress.push(d), () => false);
  assert.deepEqual(calls, [[250, 100], [250, 101], [120, 102]]);
  assert.deepEqual(progress, [250, 500, 620]);
  assert.deepEqual(r, { chunks: [250, 250, 120], done: 620, cancelled: false });
});

test("runChunks: Stop between chunks keeps what is done", async () => {
  let stop = false;
  const r = await runChunks(1000, 100, 1, async (n) => { stop = true; return n; }, () => {}, () => stop);
  assert.deepEqual(r, { chunks: [100], done: 100, cancelled: true });
});

test("runChunks: an engine error stops the run", async () => {
  await assert.rejects(runChunks(300, 100, 1, async (_n, s) => {
    if (s === 2) throw new Error("boom");
    return 1;
  }, () => {}, () => false), /boom/);
});

test("parseSeed", () => {
  assert.deepEqual(parseSeed(""), { seed: null });
  assert.deepEqual(parseSeed(" 42 "), { seed: 42 });
  assert.ok("error" in parseSeed("4.2"));
  assert.ok("error" in parseSeed("-1"));
});
