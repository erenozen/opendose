// Floating notes: small coloured sticky notes attached to any sheet.
// They annotate the work on screen only (never printed or exported),
// fold into chips above the sheet, and travel with the project file.
//
// Plain data + pure functions, like the rest of this folder.
import type { IdFactory } from "./ids.ts";
import {
  NOTE_COLORS, type FloatingNote, type NoteColor, type Project, type Sheet,
} from "./types.ts";

export const NOTE_LIMIT = 50;      // per sheet
export const NOTE_TEXT_LIMIT = 5000;

export function notesOf(s: Sheet | undefined): FloatingNote[] {
  return s?.floatingNotes ?? [];
}

/** Every note in the project with the sheet it sits on, in sheet order. */
export function allNotes(p: Project): { sheet: Sheet; note: FloatingNote }[] {
  const out: { sheet: Sheet; note: FloatingNote }[] = [];
  for (const s of p.sheets) for (const note of notesOf(s)) out.push({ sheet: s, note });
  return out;
}

/** First line of a note, for chips and navigator rows. */
export function noteTitle(n: FloatingNote, max = 40): string {
  const line = n.text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  if (!line) return "Empty note";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function setNotes(p: Project, sheetId: string,
  fn: (notes: FloatingNote[]) => FloatingNote[]): Project {
  let changed = false;
  const sheets = p.sheets.map((s): Sheet => {
    if (s.id !== sheetId) return s;
    const cur = notesOf(s);
    const next = fn(cur);
    if (next === cur) return s;
    changed = true;
    if (next.length) return { ...s, floatingNotes: next };
    const copy = { ...s };
    delete copy.floatingNotes;
    return copy;
  });
  return changed ? { ...p, sheets } : p;
}

/** Add a note to a sheet. New notes open, cascade down-right from the
 *  last one and take the next colour unless one is given. */
export function addNote(p: Project, sheetId: string, ids: IdFactory | string,
  init: Partial<Omit<FloatingNote, "id">> = {}): { project: Project; noteId: string | null } {
  const s = p.sheets.find((x) => x.id === sheetId);
  if (!s || notesOf(s).length >= NOTE_LIMIT) return { project: p, noteId: null };
  const id = typeof ids === "string" ? ids : ids();
  const n = notesOf(s).length;
  const note: FloatingNote = {
    id,
    text: init.text ?? "",
    color: init.color ?? NOTE_COLORS[n % NOTE_COLORS.length],
    x: init.x ?? 24 + (n % 8) * 24,
    y: init.y ?? 56 + (n % 8) * 24,   // below the chip row
    ...(init.collapsed ? { collapsed: true } : {}),
  };
  return { project: setNotes(p, sheetId, (cur) => [...cur, note]), noteId: id };
}

export function updateNote(p: Project, sheetId: string, noteId: string,
  patch: Partial<Omit<FloatingNote, "id">>): Project {
  return setNotes(p, sheetId, (cur) => {
    let changed = false;
    const next = cur.map((n) => {
      if (n.id !== noteId) return n;
      const m = sanitizeNote({ ...n, ...patch }) ?? n;
      if (m.text === n.text && m.color === n.color && m.x === n.x && m.y === n.y
        && !!m.collapsed === !!n.collapsed) return n;
      changed = true;
      return m;
    });
    return changed ? next : cur;
  });
}

export function deleteNote(p: Project, sheetId: string, noteId: string): Project {
  return setNotes(p, sheetId, (cur) => {
    const next = cur.filter((n) => n.id !== noteId);
    return next.length === cur.length ? cur : next;
  });
}

/** Find which sheet holds a note. */
export function noteSheetId(p: Project, noteId: string): string | null {
  return p.sheets.find((s) => notesOf(s).some((n) => n.id === noteId))?.id ?? null;
}

const clampPos = (v: unknown, d: number) =>
  (typeof v === "number" && Number.isFinite(v) ? Math.min(20000, Math.max(0, Math.round(v))) : d);

/** One note from a file; null when unusable. */
export function sanitizeNote(raw: unknown, id?: string): FloatingNote | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nid = id ?? (typeof o.id === "string" && o.id ? o.id : "");
  if (!nid) return null;
  return {
    id: nid,
    text: typeof o.text === "string" ? o.text.slice(0, NOTE_TEXT_LIMIT) : "",
    color: NOTE_COLORS.includes(o.color as NoteColor) ? o.color as NoteColor : "yellow",
    x: clampPos(o.x, 24),
    y: clampPos(o.y, 16),
    ...(o.collapsed === true ? { collapsed: true } : {}),
  };
}

/** A sheet's notes from a file: invalid entries dropped, duplicate ids
 *  replaced, at most NOTE_LIMIT kept. */
export function parseNotes(raw: unknown, ids: IdFactory, taken: Set<string>): FloatingNote[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: FloatingNote[] = [];
  for (const item of raw.slice(0, NOTE_LIMIT)) {
    const rid = item && typeof item === "object" ? (item as { id?: unknown }).id : undefined;
    const fresh = typeof rid !== "string" || !rid || taken.has(rid);
    const n = sanitizeNote(item, fresh ? ids() : rid as string);
    if (!n) continue;
    taken.add(n.id);
    out.push(n);
  }
  return out.length ? out : undefined;
}
