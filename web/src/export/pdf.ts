// Vector PDF from SVG (jsPDF + svg2pdf.js, loaded only when a PDF is
// asked for). Paths stay paths and text stays selectable text, set in
// the PDF's built-in Helvetica/Times: those fonts cover Western European
// characters only, so a few symbols that graphs use are spelled with
// their closest equivalents (the minus sign as a hyphen, Greek letters by
// name) rather than coming out as wrong glyphs.

/** Characters the PDF standard fonts can show (WinAnsi / cp1252). */
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
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
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      if (i > 0) {
        doc.addPage([pt(pg.width), pt(pg.height)], pg.width > pg.height ? "landscape" : "portrait");
      }
      const el = new DOMParser().parseFromString(pg.svg, "image/svg+xml").documentElement;
      el.querySelectorAll("text, tspan").forEach((t) => {
        for (const n of t.childNodes) {
          if (n.nodeType === Node.TEXT_NODE) n.nodeValue = toWinAnsi(n.nodeValue ?? "");
        }
      });
      host.replaceChildren(el);
      await svg2pdf(el, doc, { x: 0, y: 0, width: pt(pg.width), height: pt(pg.height) });
    }
  } finally {
    host.remove();
  }
  return doc.output("blob");
}
