// Project-level undo/redo. History holds whole Project snapshots; because
// every edit is a pure function returning a new object with structural
// sharing, a snapshot costs only the parts that changed.
//
// Rapid edits that carry the same coalesce key (typing in one cell, dragging
// through one option) within COALESCE_MS fold into a single undo step.
// Transient UI state (selection, open menus, scroll) never enters history.
import type { Project } from "./types.ts";

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 1000;

export interface History {
  past: Project[];
  present: Project;
  future: Project[];
  lastKey: string | null;
  lastAt: number;
}

export function initHistory(present: Project): History {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function commit(
  h: History, next: Project, key: string | null = null, now = Date.now(),
): History {
  if (next === h.present) return h;
  if (key !== null && key === h.lastKey && now - h.lastAt < COALESCE_MS) {
    return { ...h, present: next, future: [], lastAt: now };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

/** Replace the present without creating an undo step: for state that is
 *  a pure function of other project state (derived tables), so undoing
 *  the edit that caused it also brings back the matching older value. */
export function amend(h: History, next: Project): History {
  return next === h.present ? h : { ...h, present: next };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  const past = h.past.slice(0, -1);
  return {
    past,
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  const [present, ...future] = h.future;
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present,
    future,
    lastKey: null,
    lastAt: 0,
  };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

export type HistoryAction =
  | { type: "commit"; next: (p: Project) => Project; key?: string | null; now?: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; project: Project };

/** useReducer-compatible reducer over History. */
export function historyReducer(h: History, a: HistoryAction): History {
  switch (a.type) {
    case "commit": return commit(h, a.next(h.present), a.key ?? null, a.now ?? Date.now());
    case "undo": return undo(h);
    case "redo": return redo(h);
    case "reset": return initHistory(a.project);
  }
}
