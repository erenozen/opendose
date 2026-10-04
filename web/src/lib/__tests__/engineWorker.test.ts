// The engine worker's page side: the job queue, cancellation (queued jobs
// leave the queue; a running job retires its worker and a warm spare
// takes over), priorities and preemption, and the replay that lets
// synchronous analysis code run on the asynchronous engine.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCancelled, EngineHost, isCancelled, type WorkerLike } from "../engineClient.ts";
import type { WorkerRequest, WorkerResponse } from "../engineProtocol.ts";
import { AnswerCache, EnginePending, replay, type Outcome } from "../engineReplay.ts";

/** A worker whose jobs finish when the test says so. */
class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  jobs: { id: number; payload: string }[] = [];
  constructor() { FakeWorker.all.push(this); }
  postMessage(m: WorkerRequest) {
    if (m.type === "boot") return;
    if (m.type === "analyze") this.jobs.push({ id: m.id, payload: m.payload });
  }
  terminate() { this.terminated = true; }
  send(m: WorkerResponse) { this.onmessage?.({ data: m } as MessageEvent<WorkerResponse>); }
  ready() { this.send({ type: "ready", versions: null, models: null, bootMs: 1, marks: {} }); }
  answer(text = "{}") {
    const j = this.jobs.shift();
    assert.ok(j, "no job to answer");
    this.send({ type: "result", id: j.id, ok: true, json: text, ms: 1 });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const config = { indexURL: "x/", engineURL: "e", packages: [] };

function host() {
  FakeWorker.all = [];
  let t = 0;
  const h = new EngineHost(() => new FakeWorker(), config, () => t);
  return { h, advance: (ms: number) => { t += ms; } };
}

test("one job at a time, in priority order", async () => {
  const { h } = host();
  void h.boot();
  const w = FakeWorker.all[0];
  w.ready();
  const done: string[] = [];
  const a = h.submit({ type: "analyze", payload: "a" }, { priority: "background" }).then(() => done.push("a"));
  const b = h.submit({ type: "analyze", payload: "b" }, { priority: "background" }).then(() => done.push("b"));
  const c = h.submit({ type: "analyze", payload: "c" }, { priority: "user" }).then(() => done.push("c"));
  await tick();
  assert.equal(w.jobs.length, 1, "only one job is sent to the worker");
  assert.equal(w.jobs[0].payload, "a");
  w.answer(); await tick();
  assert.equal(w.jobs[0].payload, "c", "the user's job jumps the background queue");
  w.answer(); await tick();
  w.answer(); await Promise.all([a, b, c]);
  assert.deepEqual(done, ["a", "c", "b"]);
});

test("cancelling a queued job removes it; the worker is untouched", async () => {
  const { h } = host();
  void h.boot();
  const w = FakeWorker.all[0];
  w.ready();
  const first = h.submit({ type: "analyze", payload: "1" });
  const ctl = new AbortController();
  const second = h.submit({ type: "analyze", payload: "2" }, { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(second, (e) => isCancelled(e));
  w.answer("1");
  assert.equal(await first, "1");
  assert.equal(w.terminated, false);
  assert.equal(w.jobs.length, 0, "the cancelled job never reached the worker");
});

test("cancelling the running job retires the worker; a warm spare takes over", async () => {
  const { h, advance } = host();
  void h.boot();
  const primary = FakeWorker.all[0];
  primary.ready();
  const ctl = new AbortController();
  const slow = h.submit({ type: "analyze", payload: "slow" }, { signal: ctl.signal });
  const next = h.submit({ type: "analyze", payload: "next" });
  await tick();
  // a long job warms a spare
  advance(2000);
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(FakeWorker.all.length, 2, "a spare worker was started");
  const spare = FakeWorker.all[1];
  spare.ready();
  ctl.abort();
  await assert.rejects(slow, (e) => e instanceof EngineCancelled);
  assert.equal(primary.terminated, true, "Python cannot be interrupted: the worker is retired");
  await tick();
  assert.equal(spare.jobs[0]?.payload, "next", "the queue continues on the spare at once");
  spare.answer("ok");
  assert.equal(await next, "ok");
  assert.equal(h.stats.restarts, 1);
  assert.equal(h.stats.spareSwaps, 1);
});

test("without a ready spare, the worker drains the cancelled job; the spare takes over when up", async () => {
  const { h } = host();
  void h.boot();
  const primary = FakeWorker.all[0];
  primary.ready();
  const ctl = new AbortController();
  const job = h.submit({ type: "analyze", payload: "x" }, { signal: ctl.signal });
  const after = h.submit({ type: "analyze", payload: "y" });
  await tick();
  ctl.abort();
  await assert.rejects(job, (e) => isCancelled(e));
  assert.equal(h.draining, true, "the caller is answered at once; the worker drains");
  assert.equal(FakeWorker.all.length, 2, "a spare starts at the cancel");
  assert.equal(primary.jobs.length, 1, "nothing new is sent to the draining worker");
  const spare = FakeWorker.all[1];
  spare.ready();
  await tick();
  assert.equal(primary.terminated, true, "retired once the spare is up");
  assert.equal(h.draining, false);
  assert.equal(spare.jobs[0].payload, "y");
  spare.answer("y!");
  assert.equal(await after, "y!");
  assert.equal(h.stats.restarts, 1);
});

test("a cancelled job that ends before the spare is up costs no restart", async () => {
  const { h } = host();
  void h.boot();
  const primary = FakeWorker.all[0];
  primary.ready();
  const ctl = new AbortController();
  const job = h.submit({ type: "analyze", payload: "short" }, { signal: ctl.signal });
  const after = h.submit({ type: "analyze", payload: "next" });
  await tick();
  ctl.abort();
  await assert.rejects(job, (e) => isCancelled(e));
  primary.answer("ignored");
  await tick();
  assert.equal(h.draining, false);
  assert.equal(primary.terminated, false);
  assert.equal(primary.jobs[0].payload, "next", "the queue carries on on the same worker");
  primary.answer("n");
  assert.equal(await after, "n");
  assert.equal(h.stats.restarts, 0);
  // the spare started at the cancel stays as the spare
  FakeWorker.all[1].ready();
  await tick();
  assert.equal(primary.terminated, false);
});

test("a visible job preempts a long background job when a spare is ready", async () => {
  const { h, advance } = host();
  void h.boot();
  FakeWorker.all[0].ready();
  const bg = h.submit({ type: "analyze", payload: "bg" }, { priority: "background" });
  await tick();
  advance(2000);
  await new Promise((r) => setTimeout(r, 1600));
  const spare = FakeWorker.all[1];
  spare.ready();
  const vis = h.submit({ type: "analyze", payload: "vis" }, { priority: "visible" });
  await tick();
  assert.equal(FakeWorker.all[0].terminated, true);
  assert.equal(spare.jobs[0].payload, "vis", "the visible job runs first");
  spare.answer("v");
  assert.equal(await vis, "v");
  await tick();
  assert.equal(spare.jobs[0].payload, "bg", "the background job is run again afterwards");
  spare.answer("b");
  assert.equal(await bg, "b");
  assert.equal(h.stats.preemptions, 1);
});

test("a boot failure fails waiting jobs; boot() can be retried", async () => {
  const { h } = host();
  const ready = h.boot();
  const job = h.submit({ type: "analyze", payload: "p" });
  FakeWorker.all[0].send({ type: "bootError", message: "offline" });
  await assert.rejects(ready, /offline/);
  await assert.rejects(job, /could not start/);
  assert.equal(h.state.phase, "failed");
  void h.boot();
  assert.equal(FakeWorker.all.length, 2);
});

// ---------------------------------------------------------------- replay

function engineOf(answers: Record<string, unknown>) {
  const asked: string[] = [];
  const ask = async (payload: string): Promise<Outcome> => {
    asked.push(payload);
    const p = JSON.parse(payload) as { analysis: string };
    return { ok: true, text: JSON.stringify(answers[p.analysis] ?? null) };
  };
  return { ask, asked };
}

test("replay runs synchronous analysis code against the async engine", async () => {
  const { ask, asked } = engineOf({ normalize: { y: [0, 50, 100] }, fit: { ec50: 1.5 } });
  let runs = 0;
  const fn = (engine: { analyze: (p: unknown) => unknown }) => {
    runs++;
    const n = engine.analyze({ analysis: "normalize", data: [1, 2, 3] }) as { y: number[] };
    const f = engine.analyze({ analysis: "fit", data: n.y }) as { ec50: number };
    return f.ec50 * 2;
  };
  const cache = new AnswerCache();
  assert.equal(await replay(fn, ask, cache), 3);
  assert.equal(asked.length, 2, "each request is made once");
  assert.equal(runs, 3, "k requests: k + 1 runs");
  // the same input again: answered from the shared cache, no requests
  assert.equal(await replay(fn, ask, cache), 3);
  assert.equal(asked.length, 2);
});

test("replay copes with code that catches the pending signal, and with mutation", async () => {
  const { ask, asked } = engineOf({ a: { list: [1] }, b: { v: 2 } });
  const fn = (engine: { analyze: (p: unknown) => unknown }) => {
    let a: { list: number[] };
    try {
      a = engine.analyze({ analysis: "a" }) as { list: number[] };
    } catch {
      a = { list: [] };              // swallows EnginePending: still replayed
    }
    a.list.push(9);                  // mutating an answer must not leak into the next run
    const b = engine.analyze({ analysis: "b" }) as { v: number };
    return a.list.length + b.v;
  };
  assert.equal(await replay(fn, ask, new AnswerCache()), 4);
  assert.equal(asked.length, 2);
});

test("replay: errors propagate, failures are not cached, cancel stops it", async () => {
  const failing = async (): Promise<Outcome> => ({ ok: false, text: "worker crashed" });
  const cache = new AnswerCache();
  await assert.rejects(replay((e) => e.analyze({ q: 1 }), failing, cache), /worker crashed/);
  assert.equal(cache.size, 0);
  await assert.rejects(replay(() => { throw new Error("bad options"); }, failing, cache), /bad options/);
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(replay((e) => e.analyze({ q: 2 }), failing, cache, { signal: ctl.signal }),
    (e) => e instanceof EngineCancelled);
  assert.ok(new EnginePending() instanceof Error);
});

test("the answer cache is bounded by size, least recently used first", () => {
  const cache = new AnswerCache(4000);
  const big = "x".repeat(400);
  for (let i = 0; i < 10; i++) cache.set(`k${i}`, { ok: true, text: big });
  assert.ok(cache.size < 10);
  assert.ok(cache.get("k9"));
  assert.equal(cache.get("k0"), undefined);
});
