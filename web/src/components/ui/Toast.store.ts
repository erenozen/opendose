// Toast queue: the events the app reports (saved, imported, could not
// open), kept outside React so any module can raise one, including the
// project provider that sits above every other provider. Toast.tsx
// renders it; Announcer.tsx speaks each message once.
//
// Rules (docs/design/DECISIONS.md section 6): at most 3 visible, newest
// last; success and info leave on their own after a time set by their
// length; errors stay until dismissed; a progress toast resolves in
// place when the same id is shown again. Timers pause while the pointer
// is over the stack, while focus is inside it, and while the tab is
// hidden.

export type ToastTone = "success" | "info" | "error" | "progress";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  /** One next step: Undo, Choose another file. */
  action?: ToastAction;
  /** Showing the same id again replaces that toast in place. */
  id?: string;
}

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Leaving: kept for the exit transition, then removed. */
  closing: boolean;
  /** Bumped on every in-place update, so the view can re-measure. */
  version: number;
}

export type PauseReason = "hover" | "focus" | "hidden";

export const MAX_VISIBLE = 3;
/** Exit transition length (--dur-exit); the toast is removed after it. */
export const EXIT_MS = 150;
const MIN_MS = 4000;
const WPM = 200;

/** How long a success or info toast stays: long enough to read at
 *  200 words a minute plus a second, never under 4 s. */
export function toastDuration(message: string): number {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_MS, Math.round((words / WPM) * 60000 + 1000));
}

/** Call sites that pass no tone: failures read as errors, the rest as
 *  information. */
export function inferTone(message: string): ToastTone {
  return /^(could not|failed|cannot|can't)\b/i.test(message.trim()) ? "error" : "info";
}

function autoDismisses(tone: ToastTone): boolean {
  return tone === "success" || tone === "info";
}

interface Clock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

interface Timer {
  remaining: number;
  startedAt: number;
  handle: unknown;
}

export type Listener = (toasts: readonly Toast[]) => void;

export class ToastStore {
  private toasts: Toast[] = [];
  private timers = new Map<string, Timer>();
  private exits = new Map<string, unknown>();
  private listeners = new Set<Listener>();
  private pauses = new Set<PauseReason>();
  private seq = 0;
  private clock: Clock;
  /** Told about every message shown or replaced (the announcer). */
  onMessage: ((t: Toast) => void) | null = null;

  constructor(clock?: Partial<Clock>) {
    this.clock = {
      now: clock?.now ?? (() => Date.now()),
      setTimeout: clock?.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
      clearTimeout: clock?.clearTimeout
        ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>)),
    };
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = (): readonly Toast[] => this.toasts;

  get paused(): boolean { return this.pauses.size > 0; }

  /** Shows a toast, or replaces the one with the same id in place. */
  show(message: string, opts: ToastOptions = {}): string {
    const tone = opts.tone ?? inferTone(message);
    const id = opts.id ?? `t${++this.seq}`;
    const existing = this.toasts.find((t) => t.id === id);
    let toast: Toast;
    if (existing) {
      this.cancelExit(id);
      toast = { ...existing, message, tone, action: opts.action, closing: false,
        version: existing.version + 1 };
      this.toasts = this.toasts.map((t) => (t.id === id ? toast : t));
    } else {
      toast = { id, message, tone, action: opts.action, closing: false, version: 0 };
      this.toasts = [...this.toasts, toast];
      this.evictOverflow();
    }
    this.stopTimer(id);
    if (autoDismisses(tone)) this.startTimer(id, toastDuration(message));
    this.emit();
    this.onMessage?.(toast);
    return id;
  }

  /** Starts the exit of a toast; it is removed when the exit has played. */
  dismiss(id: string): void {
    const t = this.toasts.find((x) => x.id === id);
    if (!t || t.closing) return;
    this.stopTimer(id);
    this.toasts = this.toasts.map((x) => (x.id === id ? { ...x, closing: true } : x));
    this.exits.set(id, this.clock.setTimeout(() => this.remove(id), EXIT_MS));
    this.emit();
  }

  /** Toasts on screen, oldest first (the leaving ones included). */
  visible(): readonly Toast[] { return this.toasts; }

  setPaused(reason: PauseReason, on: boolean): void {
    const was = this.paused;
    if (on) this.pauses.add(reason); else this.pauses.delete(reason);
    if (was === this.paused) return;
    for (const [id, timer] of this.timers) {
      if (this.paused) {
        this.clock.clearTimeout(timer.handle);
        timer.remaining = Math.max(0, timer.remaining - (this.clock.now() - timer.startedAt));
        timer.handle = null;
      } else {
        timer.startedAt = this.clock.now();
        timer.handle = this.clock.setTimeout(() => this.dismiss(id), timer.remaining);
      }
    }
  }

  private evictOverflow() {
    let live = this.toasts.filter((t) => !t.closing);
    while (live.length > MAX_VISIBLE) {
      // The oldest toast that would leave on its own goes first; an error
      // or a running operation only when nothing else can make room.
      const victim = live.find((t) => autoDismisses(t.tone)) ?? live[0];
      this.dismiss(victim.id);
      live = this.toasts.filter((t) => !t.closing);
    }
  }

  private startTimer(id: string, ms: number) {
    const timer: Timer = { remaining: ms, startedAt: this.clock.now(), handle: null };
    if (!this.paused) timer.handle = this.clock.setTimeout(() => this.dismiss(id), ms);
    this.timers.set(id, timer);
  }

  private stopTimer(id: string) {
    const t = this.timers.get(id);
    if (t?.handle != null) this.clock.clearTimeout(t.handle);
    this.timers.delete(id);
  }

  private cancelExit(id: string) {
    const h = this.exits.get(id);
    if (h != null) this.clock.clearTimeout(h);
    this.exits.delete(id);
  }

  private remove(id: string) {
    this.exits.delete(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn(this.toasts);
  }
}

/** The app's one toast queue. */
export const toasts = new ToastStore();

/** Raises a toast from anywhere (React or not). Returns its id. */
export function notify(message: string, opts?: ToastOptions): string {
  return toasts.show(message, opts);
}

export function dismissToast(id: string): void {
  toasts.dismiss(id);
}

/** Open modal dialogs, newest last (ui/Dialog registers each one). A
 *  modal makes everything outside it inert, so the toast stack is drawn
 *  inside the topmost one: a toast raised from a dialog (Undo after a
 *  delete) stays above its backdrop and can be pressed. */
const hosts: HTMLElement[] = [];
const hostListeners = new Set<() => void>();
export const toastHost = {
  push(el: HTMLElement): () => void {
    hosts.push(el);
    hostListeners.forEach((fn) => fn());
    return () => {
      const i = hosts.lastIndexOf(el);
      if (i >= 0) hosts.splice(i, 1);
      hostListeners.forEach((fn) => fn());
    };
  },
  current: (): HTMLElement | null => hosts.at(-1) ?? null,
  subscribe(fn: () => void): () => void {
    hostListeners.add(fn);
    return () => { hostListeners.delete(fn); };
  },
};
