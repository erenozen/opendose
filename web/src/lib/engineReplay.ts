// Synchronous analysis code on top of an asynchronous engine.
//
// Every analysis in src/sheets is written as a plain synchronous function
// of an EngineBridge: `run(engine, table, options)` calls
// `engine.analyze(payload)` and uses the answer at once, sometimes several
// times in a row (normalize, then fit). The engine now lives in a worker,
// so answers arrive asynchronously. replay() bridges the two without
// touching the analysis code: it runs the function with a bridge that
// answers from a cache; the first request the cache cannot answer stops
// the run (EnginePending is thrown), is sent to the worker, and once its
// answer is in the cache the function runs again from the top. A function
// making k requests runs k + 1 times; the code between requests is cheap
// JavaScript, the requests themselves are made once each.
//
// The function must be synchronous and deterministic for a given set of
// answers (analysis code is: seeds are chosen before it runs). If it
// catches EnginePending and carries on, nothing breaks: the request is
// still recorded and the run repeated; whatever it returned is discarded.
import { EngineCancelled } from "./engineClient.ts";

export interface EngineBridge {
  /** Answers synchronously inside runEngine(). */
  analyze: (payload: unknown) => unknown;
}

/** Thrown by the replay bridge when an answer is not in yet. */
export class EnginePending extends Error {
  constructor() {
    super("engine answer pending");
    this.name = "EnginePending";
  }
}

export function isEnginePending(e: unknown): boolean {
  return e instanceof EnginePending;
}

/** The engine's answer to one request: result JSON, or why it failed. */
export interface Outcome { ok: boolean; text: string }

/**
 * Recent engine answers by request (payload JSON), shared by every run:
 * running an analysis again on an input it saw recently (undo, redo,
 * switching back to a sheet, two panels asking the same question) costs
 * nothing. Bounded by the size of the text it holds; least recently used
 * answers go first. Failures are not kept (they may be transient).
 */
export class AnswerCache {
  private map = new Map<string, Outcome>();
  private bytes = 0;
  private readonly max: number;

  constructor(maxBytes = 48e6) {
    this.max = maxBytes;
  }

  get(key: string): Outcome | undefined {
    const v = this.map.get(key);
    if (v) { this.map.delete(key); this.map.set(key, v); }
    return v;
  }

  set(key: string, v: Outcome) {
    if (!v.ok) return;
    const size = 2 * (key.length + v.text.length);
    if (size > this.max / 4) return;
    const old = this.map.get(key);
    if (old) { this.map.delete(key); this.bytes -= 2 * (key.length + old.text.length); }
    this.map.set(key, v);
    this.bytes += size;
    for (const [k, o] of this.map) {
      if (this.bytes <= this.max) break;
      this.map.delete(k);
      this.bytes -= 2 * (k.length + o.text.length);
    }
  }

  get size(): number { return this.map.size; }

  clear() { this.map.clear(); this.bytes = 0; }
}

export interface ReplayOptions {
  signal?: AbortSignal;
  /** Safety net against a function whose requests change on every run. */
  maxPasses?: number;
}

const keyOf = (payload: unknown): string => JSON.stringify(payload) ?? "null";

/** Run `fn` to completion against `ask` (one engine request -> its
 *  answer), answering repeated requests from `cache`. */
export async function replay<T>(fn: (engine: EngineBridge) => T,
  ask: (payloadJson: string) => Promise<Outcome>, cache: AnswerCache,
  opts: ReplayOptions = {}): Promise<T> {
  const { signal, maxPasses = 5000 } = opts;
  const local = new Map<string, Outcome>();
  for (let pass = 0; ; pass++) {
    if (signal?.aborted) throw new EngineCancelled();
    const st: { miss: string | null } = { miss: null };
    const bridge: EngineBridge = {
      analyze(payload: unknown) {
        const key = keyOf(payload);
        let hit = local.get(key);
        if (!hit) {
          hit = cache.get(key);
          if (hit) local.set(key, hit);
        }
        if (hit) {
          if (hit.ok) return JSON.parse(hit.text);
          throw new Error(hit.text);
        }
        st.miss ??= key;
        throw new EnginePending();
      },
    };
    let value: T | undefined;
    let error: unknown = null;
    let threw = false;
    try {
      value = fn(bridge);
    } catch (e) {
      threw = true;
      error = e;
    }
    const miss = st.miss;
    if (miss === null) {
      if (threw) throw error;
      if (value && typeof (value as { then?: unknown }).then === "function") {
        throw new Error("runEngine needs a synchronous function");
      }
      return value as T;
    }
    if (pass >= maxPasses) {
      throw new Error("the analysis did not settle (its engine requests change on every run)");
    }
    const outcome = await ask(miss);
    local.set(miss, outcome);
    cache.set(miss, outcome);
  }
}
