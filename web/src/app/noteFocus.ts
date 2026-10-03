// The workbench opens a floating note and puts the cursor in it when asked
// (from the navigator's note rows, "+ Note", the sheet menu).
export const NOTE_FOCUS_EVENT = "opendose-note-focus";

export function focusNote(noteId: string): void {
  window.dispatchEvent(new CustomEvent(NOTE_FOCUS_EVENT, { detail: noteId }));
}
