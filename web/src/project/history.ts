// Project-level undo/redo. History holds whole Project snapshots; because
// every edit is a pure function returning a new object with structural
// sharing, a snapshot costs only the parts that changed (history stores
// references, never copies).
//
// Depth: up to HISTORY_LIMIT steps, and as many as fit in HISTORY_BYTES
// of estimated memory (the parts of each snapshot that no newer snapshot
// shares); the oldest steps go first.
//
// Rapid edits that carry the same coalesce key (typing in one cell, dragging
// through one option) within COALESCE_MS fold into a single undo step.
// Transient UI state (selection, open menus, scroll) never enters history.
import type { Project } from "./types.ts";

export const HISTORY_LIMIT = 1000;
export const HISTORY_BYTES = 50e6;
export const COALESCE_MS = 1000;

export interface History {
  past: Project[];
  /** Estimated bytes each past snapshot holds on its own (parallel to past). */
  pastBytes: number[];
  present: Project;
  future: Project[];
  lastKey: string | null;
  lastAt: number;
}

export function initHistory(present: Project): History {
  return { past: [], pastBytes: [], present, future: [], lastKey: null, lastAt: 0 };
}

const sheetBytes = new WeakMap<object, number>();

/** Rough memory of one sheet (its JSON text, UTF-16), computed once per
 *  sheet object: sheets are immutable, an edit makes a new one. */
function bytesOf(sheet: object): number {
  let n = sheetBytes.get(sheet);
  if (n === undefined) {
    try { n = 2 * (JSON.stringify(sheet)?.length ?? 0); } catch { n = 0; }
    sheetBytes.set(sheet, n);
  }
  return n;
}

/** What keeping `old` costs once `next` exists: its sheets that `next`
 *  does not share (plus a little for the snapshot itself). */
export function uniqueBytes(old: Project, next: Project): number {
  const shared = new Set<object>(next.sheets);
  let n = 256;
  for (const s of old.sheets) if (!shared.has(s)) n += bytesOf(s);
  return n;
}

/** Drop the oldest steps beyond the count and memory limits. */
function trim(past: Project[], bytes: number[]): void {
  let total = 0;
  for (const b of bytes) total += b;
  let drop = Math.max(0, past.length - HISTORY_LIMIT);
  for (let i = 0; i < drop; i++) total -= bytes[i];
  while (drop < past.length - 1 && total > HISTORY_BYTES) total -= bytes[drop++];
  if (drop) { past.splice(0, drop); bytes.splice(0, drop); }
}

export function commit(
  h: History, next: Project, key: string | null = null, now = Date.now(),
): History {
  if (next === h.present) return h;
  if (key !== null && key === h.lastKey && now - h.lastAt < COALESCE_MS) {
    return { ...h, present: next, future: [], lastAt: now };
  }
  const past = [...h.past, h.present];
  const pastBytes = [...h.pastBytes, uniqueBytes(h.present, next)];
  trim(past, pastBytes);
  return { past, pastBytes, present: next, future: [], lastKey: key, lastAt: now };
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
    pastBytes: h.pastBytes.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  const [present, ...future] = h.future;
  const past = [...h.past, h.present];
  const pastBytes = [...h.pastBytes, uniqueBytes(h.present, present)];
  trim(past, pastBytes);
  return {
    past,
    pastBytes,
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
