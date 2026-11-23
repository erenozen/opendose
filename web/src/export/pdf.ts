// Vector PDF from SVG (jsPDF + svg2pdf.js, loaded only when a PDF is
// asked for). Paths stay paths and text stays selectable text. Labels in
// the app's fonts are set in embedded subsets of Inter and of an
// Arial-compatible sans (export/pdfFonts.ts), so every character comes
// out as typed; labels in other families use the PDF's built-in
// Helvetica/Times/Courier, which cover Western European characters only,
// so there a few symbols are spelled with their closest equivalents (the
// minus sign as a hyphen, Greek letters by name) rather than coming out
// as wrong glyphs.
import { CP1252_EXTRA, faceKey, loadPdfFonts, pdfFace, type PdfFontHost } from "./pdfFonts.ts";
const SUBSTITUTES: Record<string, string> = {
  "−": "-", "‐": "-", "‑": "-", " ": " ", " ": " ",
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~", "∞": "inf", "√": "sqrt", "→": "->",
  "μ": "µ", "Ω": "Ohm", "Δ": "Delta ", "α": "alpha", "β": "beta", "γ": "gamma",
  "δ": "delta", "ε": "epsilon", "κ": "kappa", "λ": "lambda", "π": "pi",
  "ρ": "rho", "σ": "sigma", "τ": "tau", "φ": "phi", "χ": "chi", "ω": "omega",
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6",
  "₇": "7", "₈": "8", "₉": "9", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7",
  "⁸": "8", "⁹": "9", "⁰": "0", "⁻": "-",
};

export function toWinAnsi(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)
      || ch === "\n") out += ch;
    else out += SUBSTITUTES[ch] ?? "?";
  }
  return out;
}

export interface PdfPage {
  svg: string;     // SVG markup
  width: number;   // CSS px
  height: number;
}

/** Choose each label's PDF font (pdfFonts.ts) from its computed style
 *  (the SVG must be in the document); adds the embedded faces used. */
function setFaces(svg: Element, used: Set<string>) {
  svg.querySelectorAll<SVGElement>("text, tspan").forEach((t) => {
    const own = [...t.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
    const text = own.map((n) => n.nodeValue ?? "").join("");
    const cs = getComputedStyle(t);
    const face = pdfFace(cs.fontFamily, cs.fontWeight, cs.fontStyle, text);
    if (face.family) {
      t.style.setProperty("font-family", face.family);
      if (text.trim()) used.add(faceKey(face));
    }
    t.style.setProperty("font-weight", String(face.weight));
    t.style.setProperty("font-style", face.italic ? "italic" : "normal");
    if (!face.family) for (const n of own) n.nodeValue = toWinAnsi(n.nodeValue ?? "");
  });
}

/** One PDF with a page per SVG, each page the SVG's own size. */
export async function svgPagesToPdf(pages: PdfPage[]): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const pt = (px: number) => px * 0.75;
  const first = pages[0];
  const doc = new jsPDF({
    unit: "pt",
    format: [pt(first.width), pt(first.height)],
    orientation: first.width > first.height ? "landscape" : "portrait",
    compress: true,
  });
  doc.setProperties({ creator: "OpenDose" });
  // svg2pdf measures text through the DOM, so the SVG is attached
  // (invisibly) while it converts.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;";
  document.body.appendChild(host);
  try {
    // first every page's faces, so only the fonts used are embedded
    const used = new Set<string>();
    const svgs = pages.map((pg) => {
      const el = new DOMParser().parseFromString(pg.svg, "image/svg+xml").documentElement;
      host.replaceChildren(el);
      setFaces(el, used);
      return el;
    });
    // jsPDF's typings leave out internal.getFont, which it has
    await loadPdfFonts(doc as unknown as PdfFontHost, used);
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      if (i > 0) {
        doc.addPage([pt(pg.width), pt(pg.height)], pg.width > pg.height ? "landscape" : "portrait");
      }
      host.replaceChildren(svgs[i]);
      await svg2pdf(svgs[i], doc, { x: 0, y: 0, width: pt(pg.width), height: pt(pg.height) });
    }
  } finally {
    host.remove();
  }
  return doc.output("blob");
}
