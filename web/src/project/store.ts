// A tiny external store around the history reducer. Edits are applied
// synchronously (the caller gets the new project back immediately, e.g. to
// select a sheet it just created) and React subscribes through
// useSyncExternalStore. No React import here.
import {
  amend, canRedo, canUndo, commit, initHistory, redo, undo, type History,
} from "./history.ts";
import type { Project } from "./types.ts";

export class ProjectStore {
  private h: History;
  private listeners = new Set<() => void>();

  constructor(initial: Project) {
    this.h = initHistory(initial);
  }

  getSnapshot = (): History => this.h;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  get project(): Project { return this.h.present; }
  get canUndo(): boolean { return canUndo(this.h); }
  get canRedo(): boolean { return canRedo(this.h); }

  private set(next: History) {
    if (next === this.h) return;
    this.h = next;
    this.listeners.forEach((fn) => fn());
  }

  /** Apply a pure edit. Same `key` within the coalesce window = one undo step. */
  apply = (fn: (p: Project) => Project, key: string | null = null): Project => {
    this.set(commit(this.h, fn(this.h.present), key));
    return this.h.present;
  };

  /** Apply a pure edit outside undo history (see history.amend). */
  amend = (fn: (p: Project) => Project): Project => {
    this.set(amend(this.h, fn(this.h.present)));
    return this.h.present;
  };

  undo = () => this.set(undo(this.h));
  redo = () => this.set(redo(this.h));
  /** Replace the project and forget history (open file, new project). */
  reset = (p: Project) => this.set(initHistory(p));
}
