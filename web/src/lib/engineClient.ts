// The page's side of the engine worker: boots it, keeps the job queue,
// and implements cancellation. One job runs at a time.
//
// - submit() queues a job (by priority, then arrival) and resolves with
//   the engine's JSON text.
// - Cancelling a queued job removes it from the queue.
// - Cancelling the running job terminates the worker, because Python
//   cannot be interrupted mid-call. The next worker takes over: a warm
//   spare if one is ready (instant), otherwise a fresh one (a restart
//   costs a few seconds even from the browser cache). A spare is started
//   once a job has run long enough that a cancel is plausible, and after
//   every restart, so a second cancel is instant too.
//
// No React and no DOM here, apart from the Worker constructor, which is
// injected so the queue logic can be unit-tested with a fake worker.
import type {
  BootConfig, BootProgress, RuntimeVersions, WorkerRequest, WorkerResponse,
} from "./engineProtocol.ts";

export interface WorkerLike {
  postMessage(m: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type Priority = "user" | "visible" | "background";
const RANK: Record<Priority, number> = { user: 0, visible: 1, background: 2 };

export class EngineCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "EngineCancelled";
  }
}

export function isCancelled(e: unknown): boolean {
  return e instanceof EngineCancelled
    || (e instanceof DOMException && e.name === "AbortError");
}

export interface ReadyInfo {
  versions: RuntimeVersions | null;
  models: string | null;
  bootMs: number;
  marks: Record<string, number>;
}

/** What the loading screen and the busy indicators show. */
export interface EngineState {
  /** "booting": first start; "ready"; "restarting": after a cancel with
   *  no warm spare; "failed": boot error (retry with boot()). */
  phase: "idle" | "booting" | "ready" | "restarting" | "failed";
  progress: BootProgress | null;
  error: string | null;
  /** Jobs queued or running. */
  busy: number;
}

export interface EngineStats {
  boots: { ms: number; spare: boolean; marks: Record<string, number> }[];
  restarts: number;
  /** Restarts answered by a warm spare (no wait). */
  spareSwaps: number;
  /** Background jobs set aside for a visible one. */
  preemptions: number;
  jobs: number;
}

interface Slot {
  worker: WorkerLike;
  spare: boolean;
  ready: Promise<ReadyInfo>;
  isReady: boolean;
  dead: boolean;
}

interface Job {
  id: number;
  request: { type: "analyze"; payload: string } | { type: "readXlsx"; bytes: Uint8Array }
    | { type: "prepare"; what: "xlsx" };
  priority: Priority;
  seq: number;
  resolve: (json: string) => void;
  reject: (e: unknown) => void;
  startedAt: number | null;
  slot: Slot | null;
  detach: () => void;
}

export interface SubmitOptions {
  priority?: Priority;
  signal?: AbortSignal;
}

/** A job running longer than this makes a cancel plausible: warm a spare. */
const SPARE_AFTER_MS = 1500;
/** A background job younger than this is left to finish. */
const PREEMPT_AFTER_MS = 500;

export class EngineHost {
  private slot: Slot | null = null;
  private spare: Slot | null = null;
  private queue: Job[] = [];
  private running: Job | null = null;
  private nextId = 1;
  private seq = 0;
  private spareTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: EngineState) => void>();
  private ready: ReadyInfo | null = null;
  state: EngineState = { phase: "idle", progress: null, error: null, busy: 0 };
  readonly stats: EngineStats = { boots: [], restarts: 0, spareSwaps: 0, preemptions: 0, jobs: 0 };

  private readonly spawn: () => WorkerLike;
  private readonly config: BootConfig;
  private readonly now: () => number;

  constructor(spawn: () => WorkerLike, config: BootConfig,
    now: () => number = () => performance.now()) {
    this.spawn = spawn;
    this.config = config;
    this.now = now;
  }

  /** Start the worker (idempotent). Resolves when the engine is ready. */
  boot(): Promise<ReadyInfo> {
    if (!this.slot || this.slot.dead) {
      this.slot = this.start(false);
      this.set({ phase: this.ready ? "restarting" : "booting", error: null });
    }
    return this.slot.ready;
  }

  /** Versions and models of the first successful boot. */
  get info(): ReadyInfo | null { return this.ready; }

  subscribe(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  submit(request: Job["request"], opts: SubmitOptions = {}): Promise<string> {
    const { signal } = opts;
    if (signal?.aborted) return Promise.reject(new EngineCancelled());
    return new Promise<string>((resolve, reject) => {
      const job: Job = {
        id: this.nextId++, request, priority: opts.priority ?? "visible", seq: this.seq++,
        resolve, reject, startedAt: null, slot: null, detach: () => {},
      };
      if (signal) {
        const onAbort = () => this.cancel(job);
        signal.addEventListener("abort", onAbort, { once: true });
        job.detach = () => signal.removeEventListener("abort", onAbort);
      }
      this.queue.push(job);
      this.stats.jobs++;
      this.preemptFor(job);
      this.changed();
      void this.boot().catch(() => { /* jobs fail in pump */ });
      this.pump();
    });
  }

  /** A visible job arriving while a long background job runs: when a warm
   *  spare can take over at once, the background job is set aside (put
   *  back in the queue, its worker retired) so the visible one starts now. */
  private preemptFor(job: Job) {
    const bg = this.running;
    if (job.priority === "background" || !bg || bg.priority !== "background") return;
    if (!this.spare?.isReady || bg.startedAt === null) return;
    if (this.now() - bg.startedAt < PREEMPT_AFTER_MS) return;
    this.running = null;
    bg.startedAt = null;
    bg.slot = null;
    this.queue.push(bg);
    this.stats.preemptions++;
    this.restart();
  }

  /** Cancel every queued and running job (e.g. a new project replaces
   *  the old one's pending analyses). */
  cancelAll() {
    for (const j of [...this.queue]) this.cancel(j);
    if (this.running) this.cancel(this.running);
  }

  private cancel(job: Job) {
    const i = this.queue.indexOf(job);
    if (i >= 0) {
      this.queue.splice(i, 1);
      this.finish(job, null, new EngineCancelled());
      this.changed();
      return;
    }
    if (this.running !== job) return;
    // Python cannot be interrupted: retire this worker, promote the spare.
    this.running = null;
    this.finish(job, null, new EngineCancelled());
    this.restart();
    this.pump();
  }

  private restart() {
    this.stats.restarts++;
    const old = this.slot;
    if (old) { old.dead = true; old.worker.terminate(); }
    if (this.spare && !this.spare.dead) {
      this.slot = this.spare;
      this.spare = null;
      if (this.slot.isReady) this.stats.spareSwaps++;
      this.set({ phase: this.slot.isReady ? "ready" : "restarting" });
    } else {
      this.slot = this.start(false);
      this.set({ phase: "restarting" });
    }
    // Keep a spare for the next cancel, once the new worker is up.
    const current = this.slot;
    current.ready.then(() => { if (this.slot === current) this.warmSpare(); }, () => {});
  }

  private warmSpare() {
    if (this.spare && !this.spare.dead) return;
    if (!this.slot?.isReady) return;
    this.spare = this.start(true);
  }

  private start(spare: boolean): Slot {
    const worker = this.spawn();
    const t0 = this.now();
    let settle!: { resolve: (r: ReadyInfo) => void; reject: (e: Error) => void };
    const ready = new Promise<ReadyInfo>((resolve, reject) => { settle = { resolve, reject }; });
    const slot: Slot = { worker, spare, ready, isReady: false, dead: false };
    ready.catch(() => {});
    worker.onmessage = (e) => {
      const m = e.data;
      if (slot.dead) return;
      switch (m.type) {
        case "progress":
          if (slot === this.slot && !slot.isReady) this.set({ progress: m.progress });
          break;
        case "ready": {
          slot.isReady = true;
          const info: ReadyInfo = {
            versions: m.versions, models: m.models, bootMs: m.bootMs, marks: m.marks,
          };
          this.stats.boots.push({ ms: Math.round(this.now() - t0), spare, marks: m.marks });
          this.ready ??= info;
          settle.resolve(info);
          if (slot === this.slot) this.set({ phase: "ready", progress: null, error: null });
          this.pump();
          break;
        }
        case "bootError":
          this.fail(slot, m.message, settle.reject);
          break;
        case "result":
          this.onResult(slot, m);
          break;
      }
    };
    worker.onerror = (e) => {
      if (slot.dead) return;
      e.preventDefault?.();
      this.fail(slot, e.message || "the engine worker stopped", settle.reject);
    };
    worker.postMessage({ type: "boot", config: this.config });
    return slot;
  }

  /** A worker that failed to boot or crashed. */
  private fail(slot: Slot, message: string, reject: (e: Error) => void) {
    slot.dead = true;
    slot.worker.terminate();
    reject(new Error(message));
    if (slot === this.spare) { this.spare = null; return; }
    if (slot !== this.slot) return;
    const crashed = slot.isReady;
    if (this.running?.slot === slot) {
      const job = this.running;
      this.running = null;
      this.finish(job, null, new Error(`the analysis engine stopped (${message})`));
    }
    if (crashed) {
      // A crash mid-session (out of memory, a fatal Python error):
      // start over and let the queue continue.
      this.restart();
      this.pump();
      return;
    }
    // Boot failed (network): fail what waits; boot() can be retried.
    this.set({ phase: "failed", error: message, progress: null });
    for (const job of this.queue.splice(0)) {
      this.finish(job, null, new Error(`the analysis engine could not start: ${message}`));
    }
    this.changed();
  }

  private onResult(slot: Slot, m: Extract<WorkerResponse, { type: "result" }>) {
    const job = this.running;
    if (!job || job.id !== m.id || job.slot !== slot) return;
    this.running = null;
    if (m.ok) this.finish(job, m.json, null);
    else this.finish(job, null, new Error(m.message));
    if (!m.ok && /fatally failed|fatal error/i.test(m.message)) {
      this.restart();
    }
    this.pump();
  }

  private finish(job: Job, json: string | null, err: unknown) {
    job.detach();
    if (this.spareTimer && this.running === null) {
      clearTimeout(this.spareTimer);
      this.spareTimer = null;
    }
    if (err) job.reject(err); else job.resolve(json as string);
    this.changed();
  }

  private pump() {
    if (this.running) return;
    const slot = this.slot;
    if (!slot || slot.dead || !slot.isReady || !this.queue.length) return;
    let best = 0;
    for (let i = 1; i < this.queue.length; i++) {
      const a = this.queue[i];
      const b = this.queue[best];
      if (RANK[a.priority] < RANK[b.priority]
        || (RANK[a.priority] === RANK[b.priority] && a.seq < b.seq)) best = i;
    }
    const [job] = this.queue.splice(best, 1);
    this.running = job;
    job.slot = slot;
    job.startedAt = this.now();
    const r = job.request;
    if (r.type === "analyze") slot.worker.postMessage({ type: "analyze", id: job.id, payload: r.payload });
    else if (r.type === "readXlsx") slot.worker.postMessage({ type: "readXlsx", id: job.id, bytes: r.bytes });
    else slot.worker.postMessage({ type: "prepare", id: job.id, what: r.what });
    if (this.spareTimer) clearTimeout(this.spareTimer);
    this.spareTimer = setTimeout(() => {
      this.spareTimer = null;
      if (this.running === job) this.warmSpare();
    }, SPARE_AFTER_MS);
    this.changed();
  }

  private changed() {
    this.set({ busy: this.queue.length + (this.running ? 1 : 0) });
  }

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}
