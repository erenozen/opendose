// Typesetting of the results tables (DECISIONS 3, RS-03): numeric and
// range cells align right, and each header aligns with its column. The
// ~45 results panels render plain <td>s, so the alignment is read from
// the cells' own text once they are on screen: a cell is numeric when it
// holds a digit and no word ("−6.983", "< 0.0001 ****", "9.694e-8 to
// 1.115e-7", "F(2, 12) = 4.5"; not "not reported (extrapolated)"). A
// column that is mostly numbers aligns right as a whole, its short words
// ("n/a", "0 to (very wide)") with it; a sentence stays left. Only
// a data attribute is added: the text, and so copy, CSV and the e2e
// reads, never changes (ruling 10).
import { useEffect, type RefObject } from "react";

const WORDLESS = /\b(?:to|n\/a|NaN|inf)\b/gi;

/** Is this cell's text a number, a range or a statistic? null: empty. */
export function numericCell(text: string): boolean | null {
  const t = text.trim();
  if (!t) return null;
  if (/^(?:n\/a|—|–|NaN)$/i.test(t)) return true;
  return /\d/.test(t) && !/\p{L}{3,}/u.test(t.replace(WORDLESS, ""));
}

/** Longer than this, a cell is a sentence and keeps to the left. */
const SENTENCE = 40;

function typeset(root: HTMLElement) {
  for (const table of root.querySelectorAll<HTMLTableElement>("table.results-table")) {
    const votes: { num: number; text: number }[] = [];
    const cells: { cell: HTMLTableCellElement; col: number; num: boolean | null; len: number }[] = [];
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        let col = 0;
        for (const cell of row.cells) {
          const span = Math.max(1, cell.colSpan);
          if (cell.tagName === "TD") {
            const text = (cell.textContent ?? "").trim();
            const n = numericCell(text);
            cells.push({ cell, col: span === 1 ? col : -1, num: n, len: text.length });
            if (n !== null && span === 1) {
              const v = (votes[col] ??= { num: 0, text: 0 });
              v[n ? "num" : "text"]++;
            }
          }
          col += span;
        }
      }
    }
    const numericCol = (c: number) => c >= 0 && !!votes[c] && votes[c].num > votes[c].text;
    for (const { cell, col, num, len } of cells) {
      cell.toggleAttribute("data-num", num === true || (num === false && len <= SENTENCE && numericCol(col)));
    }
    // a header sits over its column's numbers
    if (!table.tHead) continue;
    for (const row of table.tHead.rows) {
      let col = 0;
      for (const cell of row.cells) {
        const span = Math.max(1, cell.colSpan);
        const v = votes[col];
        cell.toggleAttribute("data-num", span === 1 && !!v && v.num > v.text);
        col += span;
      }
    }
  }
}

/** Keeps the tables under `ref` typeset as results arrive and change. */
export function useTypesetTables(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => typeset(root));
    };
    typeset(root);
    // attributes are not observed: typesetting does not trigger itself
    const mo = new MutationObserver(run);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); cancelAnimationFrame(frame); };
  }, [ref]);
}

/** A results card wider than its pane scrolls sideways inside itself;
 *  while it does, it is a named, focusable region so a keyboard can
 *  scroll it too (axe scrollable-region-focusable, at 390px). */
export function useScrollRegions(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const el of root.querySelectorAll<HTMLElement>(".result-card")) {
          const scrolls = el.scrollWidth > el.clientWidth + 1;
          if (scrolls === el.hasAttribute("data-scrolls")) continue;
          el.toggleAttribute("data-scrolls", scrolls);
          // a card that already has a role (a note) keeps it and its name;
          // only what is added here is taken away again
          const named = !el.hasAttribute("role") || el.hasAttribute("data-scroll-named");
          if (scrolls) {
            el.tabIndex = 0;
            if (named) {
              const title = el.querySelector("h3")?.textContent?.trim();
              el.setAttribute("data-scroll-named", "");
              el.setAttribute("role", "region");
              el.setAttribute("aria-label", title ? `${title} (scrolls sideways)` : "Results (scrolls sideways)");
            }
          } else {
            el.removeAttribute("tabindex");
            if (el.hasAttribute("data-scroll-named")) {
              el.removeAttribute("data-scroll-named");
              el.removeAttribute("role");
              el.removeAttribute("aria-label");
            }
          }
        }
      });
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(root);
    const mo = new MutationObserver(check);
    mo.observe(root, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(frame); };
  }, [ref]);
}
