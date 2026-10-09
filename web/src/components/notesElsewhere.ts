// Which engine messages of the Notes strip another block of the results
// pane already prints in full (a comparisons table's note, a panel's own
// warnings list, the Residuals section): those are said once, there. Pure;
// unit-tested (__tests__/notesElsewhere.test.ts).

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Indices of `notes` whose text (or the text after a "Group: " context
 *  prefix) appears in `elsewhere`. Short notes (under 25 characters) are
 *  kept: too likely to match by chance. */
export function saidElsewhere(notes: string[], elsewhere: string): Set<number> {
  const hay = norm(elsewhere);
  const out = new Set<number>();
  notes.forEach((t, i) => {
    const full = norm(t);
    const colon = full.indexOf(": ");
    const bare = colon > 0 && colon < 60 ? full.slice(colon + 2) : null;
    if ((full.length >= 25 && hay.includes(full)) || (bare && bare.length >= 25 && hay.includes(bare))) {
      out.add(i);
    }
  });
  return out;
}
