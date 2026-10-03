// Browser helpers for exporting text: a file download and the clipboard.

export function downloadText(filename: string, text: string, mime: string): void {
  // A BOM lets spreadsheet programs read UTF-8 CSV (µ, ±, Greek) correctly.
  const blob = new Blob([mime.startsWith("text/csv") ? "﻿" : "", text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Copy text; falls back to a hidden textarea where the async clipboard
 *  API is unavailable (insecure origins, older browsers). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** The rendered results as rows of text: each heading on its own row,
 *  each table's rows cell by cell, a blank row after every table. What
 *  is exported is exactly what is shown, at the project's digit setting. */
export function resultsMatrix(root: HTMLElement | null): string[][] {
  if (!root) return [];
  const out: string[][] = [];
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  for (const el of root.querySelectorAll<HTMLElement>(
    "h3, h4, table, .results-error, p.model-line")) {
    if (el.tagName !== "TABLE" && el.closest("table")) continue;
    if (el.tagName === "TABLE") {
      for (const row of (el as HTMLTableElement).rows) {
        const cells: string[] = [];
        for (const cell of row.cells) {
          cells.push(clean(cell.innerText));
          for (let i = 1; i < cell.colSpan; i++) cells.push("");
        }
        if (cells.some((c) => c)) out.push(cells);
      }
      out.push([]);
    } else {
      const text = clean(el.innerText);
      if (text) out.push([text]);
    }
  }
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}
