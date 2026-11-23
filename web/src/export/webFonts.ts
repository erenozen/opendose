// Web fonts inside exported rasters (P-03). Plotly and the layout
// composer write SVG that names the page's font ("Inter Variable", the
// self-hosted @fontsource-variable/inter); a PNG, TIFF, JPEG or WebP is
// that SVG drawn onto a canvas as an image.

/** The page's own @font-face rules (its web fonts: Inter Variable) that
 *  the SVG's text uses, with their font files inlined as data URLs. An SVG
 *  drawn as an image cannot fetch anything, the page's fonts included, so
 *  without this a PNG, TIFF, JPEG or WebP export sets the plot font's
 *  text in a fallback font wherever Inter is not installed. Only the
 *  faces whose unicode-range meets the SVG's characters are inlined (the
 *  Latin file is about 48 KB). Returns the SVG unchanged when it names no
 *  web font. */
export async function inlineWebFonts(svg: string): Promise<string> {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const used = new Set<string>();
  let italic = false;
  for (const el of Array.from(doc.querySelectorAll<SVGElement>("*"))) {
    const fam = el.style?.fontFamily || el.getAttribute("font-family") || "";
    for (const f of fam.split(",")) if (f.trim()) used.add(unquote(f));
    if ((el.style?.fontStyle || el.getAttribute("font-style")) === "italic") italic = true;
  }
  const chars = new Set<number>();
  for (const t of Array.from(doc.querySelectorAll("text"))) {
    for (const ch of t.textContent ?? "") chars.add(ch.codePointAt(0)!);
  }
  const faces = webFontFaces().filter((f) => used.has(unquote(f.family))
    && (italic || f.style !== "italic") && rangesMeet(f.range, chars));
  if (!faces.length) return svg;
  const rules = await Promise.all(faces.map(async (f) => {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error(`The font ${f.url} did not load (${r.status}).`);
    const b = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let k = 0; k < b.length; k += 0x8000) bin += String.fromCharCode(...b.subarray(k, k + 0x8000));
    return `@font-face{font-family:"${unquote(f.family)}";font-style:${f.style};font-weight:${f.weight};`
      + `src:url(data:font/woff2;base64,${btoa(bin)}) format("${f.format}");`
      + (f.range ? `unicode-range:${f.range};` : "") + "}";
  }));
  return svg.replace(/<svg\b[^>]*>/, (open) => `${open}<style>${rules.join("")}</style>`);
}

const unquote = (f: string) => f.trim().replace(/^["']|["']$/g, "").toLowerCase();

interface WebFace { family: string; style: string; weight: string; range: string; url: string; format: string }

/** The document's @font-face rules that load a woff2 file. */
function webFontFaces(): WebFace[] {
  const out: WebFace[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const s = rule.style;
      const src = /url\(\s*["']?([^"')]+)["']?\s*\)\s*format\(\s*["']?([^"')]+)/.exec(s.getPropertyValue("src"));
      if (!src) continue;
      out.push({
        family: s.getPropertyValue("font-family"),
        style: s.getPropertyValue("font-style") || "normal",
        weight: s.getPropertyValue("font-weight") || "400",
        range: s.getPropertyValue("unicode-range"),
        url: new URL(src[1], sheet.href ?? document.baseURI).href,
        format: src[2],
      });
    }
  }
  return out;
}

/** Whether a CSS unicode-range ("U+0-FF, U+131") holds any of the code points. */
export function rangesMeet(range: string, chars: Set<number>): boolean {
  if (!range.trim()) return chars.size > 0;
  return range.split(",").some((r) => {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(r.trim());
    if (!m) return false;
    const lo = parseInt(m[1].replace(/\?/g, "0"), 16);
    const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, "f"), 16);
    for (const c of chars) if (c >= lo && c <= hi) return true;
    return false;
  });
}
