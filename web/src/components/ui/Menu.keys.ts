/* Keyboard logic of the Menu primitive, kept pure for unit tests. */

/** The item index a navigation key moves to (wrapping), or null for other keys.
 *  `current` is -1 when no item has focus yet. */
export function moveIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown": return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp": return current < 0 ? count - 1 : (current - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

/** Type-ahead buffers reset after this pause between key presses. */
export const TYPEAHEAD_RESET_MS = 500;

/**
 * The item a type-ahead buffer lands on, or -1. A new search starts after
 * the focused item; a longer buffer may keep the focused item while it
 * still matches; one letter pressed repeatedly cycles through the items
 * that start with it.
 */
export function typeahead(labels: string[], current: number, buffer: string): number {
  const q = buffer.toLocaleLowerCase();
  if (!q || !labels.length) return -1;
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  const needle = repeated ? q[0] : q;
  const start = q.length === 1 || repeated ? current + 1 : Math.max(current, 0);
  for (let k = 0; k < labels.length; k++) {
    const i = (start + k) % labels.length;
    if (labels[i].trim().toLocaleLowerCase().startsWith(needle)) return i;
  }
  return -1;
}

/** A printable key that should feed type-ahead (not a shortcut or Space). */
export const isTypeaheadKey = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
  e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;
