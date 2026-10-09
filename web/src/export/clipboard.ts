// Clipboard for Office: rich HTML tables ("Copy for Word") and graphs as
// PNG plus SVG ("Copy graph for Word or PowerPoint"). Browser only; the
// HTML itself is built by ./wordTable.ts.
import type { CopyOutcome } from "./download";
import type { WordCell, WordSection } from "./wordTable";

type ItemCtor = typeof ClipboardItem & { supports?: (type: string) => boolean };
const itemCtor = () => (globalThis as { ClipboardItem?: ItemCtor }).ClipboardItem;

/** The rendered results under `root` as sections: each heading (h3, h4,
 *  the model line) and each table, cell by cell as shown. */
export function readSections(root: HTMLElement | null): WordSection[] {
  if (!root) return [];
  const out: WordSection[] = [];
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  for (const el of root.querySelectorAll<HTMLElement>("h3, h4, table, .results-error, p.model-line")) {
    if (el.tagName !== "TABLE" && el.closest("table")) continue;
    if (el.tagName !== "TABLE") {
      const text = clean(el.innerText);
      if (text) out.push({ heading: text, rows: [], headRows: 0 });
      continue;
    }
    const table = el as HTMLTableElement;
    const rows: WordCell[][] = [];
    let headRows = 0;
    let inBody = false;
    for (const row of table.rows) {
      const cells: WordCell[] = [...row.cells].map((c) => ({
        text: clean(c.innerText), header: c.tagName === "TH", colSpan: Math.max(1, c.colSpan),
      }));
      if (!cells.some((c) => c.text)) continue;
      const head = row.parentElement?.tagName === "THEAD"
        || (!inBody && !table.tHead && cells.every((c) => c.header));
      if (head && !inBody) headRows++;
      else inBody = true;
      rows.push(cells);
    }
    if (rows.length) out.push({ rows, headRows });
  }
  return out;
}

/** Put HTML and plain text on the clipboard. Uses the async Clipboard API
 *  where it can write HTML, else a copy event on a hidden selection. */
export async function copyHtml(html: string, plain: string): Promise<boolean> {
  const Item = itemCtor();
  if (Item && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new Item({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      })]);
      return true;
    } catch { /* fall through to the copy event */ }
  }
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/html", html);
    e.clipboardData?.setData("text/plain", plain);
    e.preventDefault();
  };
  const holder = document.createElement("div");
  holder.textContent = plain;
  holder.style.position = "fixed";
  holder.style.opacity = "0";
  document.body.appendChild(holder);
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(holder);
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.addEventListener("copy", onCopy);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  document.removeEventListener("copy", onCopy);
  sel?.removeAllRanges();
  holder.remove();
  return ok;
}

/** Whether this browser can put an SVG on the clipboard. */
export function canCopySvg(): boolean {
  const Item = itemCtor();
  try { return !!Item?.supports?.("image/svg+xml"); } catch { return false; }
}

/**
 * A graph on the clipboard as a picture: PNG (which every Office version
 * pastes) and, where the browser supports it, the SVG too, which recent
 * Office versions paste as a vector picture. Both blobs are passed as
 * promises created inside the click, as Safari and Chrome require.
 */
export async function copyGraphImage(png: () => Promise<Blob>, svg?: () => Promise<string>):
  Promise<CopyOutcome> {
  const Item = itemCtor();
  if (!Item || !navigator.clipboard?.write) return "unsupported";
  const pngP = png();
  if (svg && canCopySvg()) {
    try {
      await navigator.clipboard.write([new Item({
        "image/png": pngP,
        "image/svg+xml": svg().then((s) => new Blob([s], { type: "image/svg+xml" })),
      })]);
      return "copied";
    } catch { /* retry with the PNG alone */ }
  }
  try {
    await navigator.clipboard.write([new Item({ "image/png": pngP })]);
    return "copied";
  } catch {
    return "failed";
  }
}
