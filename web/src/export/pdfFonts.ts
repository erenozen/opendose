// Which font each label of a PDF export is set in. PDFs embed two
// families (src/export/fonts/, made by scripts/make-export-fonts.py), so
// µ, Δ, ≤, the minus sign and super- and subscripts come out as typed and
// stay selectable text:
//   "Inter Variable"  Inter 4.1, the app's plot font (default theme)
//   "Arial"           OpenDose Sans Classic, a cut of Liberation Sans,
//                     metric-compatible with Arial and Helvetica (the
//                     classic theme)
// Both are registered under the names the SVG asks for, so the browser
// measures the text svg2pdf anchors with the same advance widths the PDF
// draws (Inter Variable is the page's web font; Arial resolves to Arial
// or, where it is missing, to Liberation Sans). Other families (system,
// serif, mono) and italics stay in the PDF's standard fonts, spelled in
// WinAnsi; a label one of those cannot spell, or a classic label with a
// character Liberation Sans lacks (⁺, ⁻), is set upright in Inter
// instead of losing characters. Pure, except loadPdfFonts.

import coverage from "./fonts/coverage.json" with { type: "json" };

export const INTER = "Inter Variable";
export const CLASSIC = "Arial";

export type PdfFace =
  | { family: typeof INTER | typeof CLASSIC; weight: 400 | 700; italic: false }
  | { family: null; weight: 400 | 700; italic: boolean };

function parseRanges(s: string): [number, number][] {
  return s.split(",").map((r) => {
    const [a, b] = r.split("-").map((h) => parseInt(h, 16));
    return [a, b ?? a];
  });
}
const COVER = { inter: parseRanges(coverage.inter), classic: parseRanges(coverage.classic) };

const has = (ranges: [number, number][], cp: number) => ranges.some(([a, b]) => cp >= a && cp <= b);

/** Every character of `text` has a glyph in the font (spaces and line
 *  breaks always pass). */
export function covers(font: "inter" | "classic", text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) continue;
    if (!has(COVER[font], cp)) return false;
  }
  return true;
}

/** Characters the PDF standard fonts can show (WinAnsi / cp1252). */
export const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function winAnsiSafe(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (!((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)
      || ch === "\n")) return false;
  }
  return true;
}

const unquote = (f: string) => f.trim().replace(/^["']|["']$/g, "").toLowerCase();

/** The face a label is drawn in, from its computed CSS font. `family:
 *  null` keeps the SVG's own family for svg2pdf's standard fonts. */
export function pdfFace(fontFamily: string, fontWeight: string | number, fontStyle: string,
  text: string): PdfFace {
  const first = unquote(fontFamily.split(",")[0] ?? "");
  const w = Number(fontWeight);
  const weight: 400 | 700 = (Number.isFinite(w) ? w >= 600 : fontWeight === "bold") ? 700 : 400;
  const italic = fontStyle === "italic" || fontStyle === "oblique";
  const inter = { family: INTER, weight, italic: false } as const;
  const own = first === "inter variable" || first === "inter" ? "inter"
    : first === "arial" || first === "helvetica" ? "classic" : null;
  if (!italic && own === "inter" && covers("inter", text)) return inter;
  if (!italic && own === "classic") {
    if (covers("classic", text)) return { family: CLASSIC, weight, italic: false };
    return inter;
  }
  if (winAnsiSafe(text) || !covers("inter", text)) return { family: null, weight, italic };
  return inter;
}

/** The jsPDF calls loadPdfFonts makes. */
export interface PdfFontHost {
  addFileToVFS: (name: string, data: string) => unknown;
  addFont: (file: string, family: string, style: string) => unknown;
  internal: { getFont: (family: string, style: string) => { fontName: string } };
}

/** "family|weight" of a face pdfFace chose, for loadPdfFonts. */
export const faceKey = (f: PdfFace) => `${f.family}|${f.weight}`;

/** Register the embedded faces a document uses (faceKey values) with
 *  jsPDF; a registered face is embedded even when unused (about 4.7 KB
 *  each). The PDF names each by its own font (/BaseFont /Inter-Regular,
 *  /OpenDoseSansClassic-Bold), not by the CSS family it stands in for. */
export async function loadPdfFonts(doc: PdfFontHost, used: ReadonlySet<string>): Promise<void> {
  // served from this site (Vite emits them as assets; the offline cache
  // keeps them), fetched only when a PDF is made
  const files = ([
    [new URL("./fonts/Inter-Regular.ttf", import.meta.url).href, "Inter-Regular.ttf", INTER, "normal"],
    [new URL("./fonts/Inter-Bold.ttf", import.meta.url).href, "Inter-Bold.ttf", INTER, "bold"],
    [new URL("./fonts/OpenDoseSansClassic-Regular.ttf", import.meta.url).href,
      "OpenDoseSansClassic-Regular.ttf", CLASSIC, "normal"],
    [new URL("./fonts/OpenDoseSansClassic-Bold.ttf", import.meta.url).href,
      "OpenDoseSansClassic-Bold.ttf", CLASSIC, "bold"],
  ] as [string, string, string, string][])
    .filter(([, , family, style]) => used.has(`${family}|${style === "bold" ? 700 : 400}`));
  const bytes = await Promise.all(files.map(async ([url]) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`The PDF font ${url} did not load (${r.status}).`);
    return new Uint8Array(await r.arrayBuffer());
  }));
  files.forEach(([, file, family, style], i) => {
    let bin = "";
    const b = bytes[i];
    for (let k = 0; k < b.length; k += 0x8000) bin += String.fromCharCode(...b.subarray(k, k + 0x8000));
    registerPdfFont(doc, file, btoa(bin), family, style);
  });
}

/** Add one font file under a CSS family and style, named after the file. */
export function registerPdfFont(doc: PdfFontHost, file: string, base64: string, family: string,
  style: string): void {
  doc.addFileToVFS(file, base64);
  doc.addFont(file, family, style);
  doc.internal.getFont(family, style).fontName = file.replace(/\.ttf$/, "");
}
