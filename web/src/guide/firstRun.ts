// First run (DECISIONS 4): a first visit lands in the workspace on the
// example project, with its shipped results on screen. A paste anywhere
// outside a field, or a block pasted into the example's table, replaces
// the example with the visitor's numbers; the paste banner then shows the
// guessed table type with its reason, a "Read as" choice and Undo.
//
// This module holds that state outside React (the paste listener and the
// data pane both read it) and the rules that need no React. Pure apart
// from the small store; unit-tested.
import type { Project, TableType } from "../project/types.ts";
import type { PasteFullValues, ReadPaste } from "./paste.ts";

/** The button that confirms a pasted table, by table type: it says what
 *  the default analysis does with it, not "Create table". */
export const PRIMARY_VERB: Record<TableType, string> = {
  xy: "Fit the curve",
  column: "Compare the groups",
  grouped: "Run two-way ANOVA",
  contingency: "Test the table",
  survival: "Draw survival curves",
  partsofwhole: "Show the fractions",
  multivariable: "Describe the variables",
  nested: "Run the nested test",
};

/** "an XY table", "a Column table". */
export function tableNoun(label: string): string {
  return `${/^(XY|[AEIOU])/.test(label) ? "an" : "a"} ${label} table`;
}

const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s.trim()));

/** Whether a paste reads as a table worth replacing the example with.
 *  Outside a field ("page"): two cells or more, one of them a number (a
 *  copied word or link is not data). Inside the example's grid: a block
 *  of at least two rows and two columns; a single value or a single
 *  column is an ordinary cell edit and goes to the grid. */
export function usablePaste(read: ReadPaste | null, where: "page" | "grid"): read is ReadPaste {
  if (!read) return false;
  const { rows, width } = read.block;
  if (!rows.some((r) => r.some(isNum))) return false;
  if (where === "grid") return rows.length >= 2 && width >= 2;
  return rows.length * width >= 2;
}

// ------------------------------------------------------------ state

/** The last paste turned into a table, until it is confirmed or undone. */
export interface PasteNote {
  /** The data sheet the paste made. */
  dataId: string;
  /** The clipboard text, read again when "Read as" changes: with a
   *  spreadsheet's full values in place of the rounded ones it showed. */
  text: string;
  read: ReadPaste;
  /** What the spreadsheet's full values did (paste.ts withFullValues). */
  fullValues?: PasteFullValues | null;
  /** The project before the paste (Undo goes back to it) and the one the
   *  paste made (when nothing changed since, Undo is a plain undo step). */
  before: Project;
  after: Project;
  /** The selection before the paste. */
  beforeSelected: string | null;
  /** The paste replaced the example (otherwise it added a table). */
  replacedExample: boolean;
  /** Focus the banner's "Read as" select when it mounts (after a re-read). */
  refocus?: boolean;
}

export interface FirstRunState {
  /** Data sheet ids of the example project the app opened on. */
  exampleIds: ReadonlySet<string>;
  paste: PasteNote | null;
}

let state: FirstRunState = { exampleIds: new Set(), paste: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export const firstRunStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  get: (): FirstRunState => state,
};

/** `p` is the example the app opened on: its tables carry the "Example
 *  data" banner and a paste replaces it. */
export function markExample(p: Project): void {
  state = { exampleIds: new Set(p.sheets.filter((s) => s.kind === "data").map((s) => s.id)), paste: null };
  emit();
}

export function setPasteNote(note: PasteNote | null): void {
  if (state.paste === note) return;
  state = { ...state, paste: note };
  emit();
}

/** Every data table of `p` is one of the example's (edited or not): the
 *  project is still the example, and a paste replaces it. */
export function isExampleProject(p: Project, ids: ReadonlySet<string> = state.exampleIds): boolean {
  const data = p.sheets.filter((s) => s.kind === "data");
  return data.length > 0 && data.every((s) => ids.has(s.id));
}
