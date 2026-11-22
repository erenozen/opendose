// The paste side of first run (DECISIONS 4; state and rules in
// firstRun.ts, banners in FirstRun.tsx): clipboard text becomes a table,
// read again as another type on request, and undone back to the project
// it replaced.
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useProject } from "../app/context";
import { newId } from "../project/ids";
import type { Project, TableType } from "../project/types";
import { projectWithTable } from "./actions";
import {
  firstRunStore, isExampleProject, setPasteNote, usablePaste, type PasteNote,
} from "./firstRun";
import { readPaste } from "./paste";

export function useFirstRun() {
  return useSyncExternalStore(firstRunStore.subscribe, firstRunStore.get);
}

/** The project a paste makes: the example gives way to one table named
 *  "Pasted data"; any other project gets the table as a new family. */
function withPaste(p: Project, text: string, as: TableType | undefined) {
  const read = readPaste(text, as);
  if (!read) return null;
  const replacedExample = isExampleProject(p);
  const r = projectWithTable(p, read.table, "Pasted data", newId, replacedExample);
  return { read, project: r.project, dataId: r.dataId, replacedExample };
}

/** Puts clipboard text into the project as a table (and back out). */
export function usePasteActions() {
  const { store, apply, undo, select, selectedId, readOnly } = useProject();
  const selRef = useRef(selectedId);
  selRef.current = selectedId;

  /** A new paste, or the same text read again as another type. */
  const paste = useCallback((text: string, as?: TableType, prev?: PasteNote) => {
    // A shared project is read-only until copied: nothing to paste into.
    if (readOnly) return false;
    // Reading again: back to the project before the first reading.
    if (prev && store.project === prev.after) undo();
    const before = prev ? prev.before : store.project;
    const made = withPaste(before, text, as);
    if (!made) return false;
    const after = apply(() => made.project);
    select(made.dataId);
    setPasteNote({
      dataId: made.dataId, text, read: made.read, before, after,
      beforeSelected: prev ? prev.beforeSelected : selRef.current,
      replacedExample: made.replacedExample, refocus: !!prev,
    });
    return true;
  }, [store, apply, undo, select, readOnly]);

  /** Back to the project before the paste (the example, when it was). */
  const revert = useCallback((note: PasteNote) => {
    if (store.project === note.after) undo();
    else apply(() => note.before);
    setPasteNote(null);
    if (note.beforeSelected) select(note.beforeSelected);
  }, [store, apply, undo, select]);

  return { paste, revert };
}

/** Ctrl/Cmd+V anywhere outside a field, or a block pasted into a cell of
 *  the example's table: the clipboard becomes a table (DECISIONS 4). A
 *  paste in any other field, in a dialog, or of something that is not a
 *  block of numbers is left alone. */
export function usePasteAnywhere() {
  const { store, readOnly } = useProject();
  const { paste } = usePasteActions();
  const live = useRef({ paste, readOnly });
  live.current = { paste, readOnly };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || live.current.readOnly) return;
      if (document.querySelector("dialog[open]")) return;
      const t = e.target instanceof Element ? e.target : null;
      const field = !!t?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
      const exampleGrid = field && !!t?.closest(".pane-table .data-table")
        && isExampleProject(store.project);
      if (field && !exampleGrid) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!usablePaste(readPaste(text), exampleGrid ? "grid" : "page")) return;
      // Ahead of the grid's own paste (this listener captures at the window).
      e.preventDefault();
      e.stopPropagation();
      live.current.paste(text);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [store]);
}
