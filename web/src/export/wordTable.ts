// "Copy for Word": a results sheet as HTML tables (with header rows,
// borders and the numbers exactly as shown) plus the same content as
// tab-separated text. Word, PowerPoint, Google Docs and LibreOffice paste
// the HTML flavour as a formatted table; plain-text targets get the text.
// Pure: the DOM is read by readSections (browser only) into plain data.

export interface WordCell {
  text: string;
  header: boolean;
  colSpan: number;
}

export interface WordSection {
  /** A heading or model line above (or without) a table. */
  heading?: string;
  /** Rows of the table; the first `headRows` are its header. */
  rows: WordCell[][];
  headRows: number;
}

const FONT = "Calibri, Arial, Helvetica, sans-serif";
const BORDER = "1px solid #808080";

export function htmlEscape(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}

/** A cell reads as a number (right-aligned): 12.3, −0.5, <0.0001, 45%,
 *  1.2e-5, 0.003 **, [1.2, 3.4] or 1.2 to 3.4. */
export function isNumericCell(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return false;
  const num = String.raw`[−+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:[eE][−+-]?\d+)?`;
  const one = new RegExp(String.raw`^(?:[<>≤≥]=?\s?)?${num}\s?%?(?:\s?\*{1,4}|\s?ns)?$`);
  const range = new RegExp(String.raw`^\[?\(?${num}\s?(?:,|to|–|-)\s?${num}\)?\]?$`);
  return one.test(t) || range.test(t);
}

function cellHtml(c: WordCell): string {
  const tag = c.header ? "th" : "td";
  const align = !c.header && isNumericCell(c.text) ? "right" : "left";
  const style = [`border:${BORDER}`, "padding:2pt 6pt", `text-align:${align}`,
    "vertical-align:top", c.header ? "font-weight:bold;background:#f2f2f2" : ""]
    .filter(Boolean).join(";");
  const span = c.colSpan > 1 ? ` colspan="${c.colSpan}"` : "";
  return `<${tag}${span} style="${style}">${htmlEscape(c.text)}</${tag}>`;
}

/** The sections as one HTML fragment (a full document, as the clipboard
 *  wants it), each table with a thead when it has header rows. */
export function wordHtml(sections: WordSection[], title?: string): string {
  const out: string[] = [];
  if (title) {
    out.push(`<p style="font-family:${FONT};font-size:12pt;font-weight:bold;margin:0 0 6pt">`
      + `${htmlEscape(title)}</p>`);
  }
  for (const s of sections) {
    if (s.heading) {
      out.push(`<p style="font-family:${FONT};font-size:11pt;font-weight:bold;margin:8pt 0 4pt">`
        + `${htmlEscape(s.heading)}</p>`);
    }
    if (!s.rows.length) continue;
    const head = s.rows.slice(0, s.headRows);
    const body = s.rows.slice(s.headRows);
    const tr = (r: WordCell[]) => `<tr>${r.map(cellHtml).join("")}</tr>`;
    out.push(`<table border="1" cellspacing="0" cellpadding="0" `
      + `style="border-collapse:collapse;border:${BORDER};font-family:${FONT};font-size:10pt;margin:0 0 8pt">`
      + (head.length ? `<thead>${head.map(tr).join("")}</thead>` : "")
      + `<tbody>${body.map(tr).join("")}</tbody></table>`);
  }
  return '<html><head><meta charset="utf-8"></head><body>'
    + `<!--StartFragment-->${out.join("")}<!--EndFragment--></body></html>`;
}

/** The same content as tab-separated text (headings on their own line,
 *  spanned cells padded, a blank line after each table). */
export function wordPlain(sections: WordSection[], title?: string): string {
  const lines: string[] = [];
  if (title) lines.push(title, "");
  for (const s of sections) {
    if (s.heading) lines.push(s.heading);
    for (const r of s.rows) {
      const cells: string[] = [];
      for (const c of r) {
        cells.push(c.text.replace(/[\t\n]+/g, " "));
        for (let i = 1; i < c.colSpan; i++) cells.push("");
      }
      lines.push(cells.join("\t"));
    }
    if (s.rows.length) lines.push("");
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** The first number a results sheet shows (for tests and status lines). */
export function firstNumber(sections: WordSection[]): string | null {
  for (const s of sections) {
    for (const r of s.rows.slice(s.headRows)) {
      for (const c of r) if (!c.header && isNumericCell(c.text)) return c.text;
    }
  }
  return null;
}
