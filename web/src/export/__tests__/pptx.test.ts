// PowerPoint writer: parts, relationship ids, content types, EMU geometry,
// XML well-formedness and the svgBlip picture. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import {
  buildPptx, clampSlide, contentRect, deckSize, EMU_PER_INCH, fitRect, mmToEmu, paragraphs,
  pptxParts, pptxSheets, pxToEmu, SLIDE_16_9, slideId, slideRelId, slideXml, SVG_BLIP_EXT,
  titleRect, xmlEscape, type PptxDeck,
} from "../pptx.ts";

test("scope: all graphs and layouts, one family, one graph or one layout, in order", () => {
  const g = (id: string, parentId: string) => ({ kind: "graph", id, name: id, parentId });
  const p = { sheets: [
    { kind: "data", id: "d1", name: "d1" }, g("g1", "d1"), { kind: "results", id: "r1", parentId: "d1" },
    { kind: "data", id: "d2", name: "d2" }, g("g2", "d2"), g("g3", "d1"),
    { kind: "layout", id: "L1", name: "L1" },
  ] } as unknown as Parameters<typeof pptxSheets>[0];
  const ids = (s: Parameters<typeof pptxSheets>[1]) => pptxSheets(p, s).map((x) => x.id);
  assert.deepEqual(ids({ kind: "all" }), ["g1", "g2", "g3", "L1"]);
  assert.deepEqual(ids({ kind: "family", dataId: "d1" }), ["g1", "g3"]);
  assert.deepEqual(ids({ kind: "graph", graphId: "g2" }), ["g2"]);
  assert.deepEqual(ids({ kind: "layout", layoutId: "L1" }), ["L1"]);
});

test("a deck of same-size page layouts takes the page size", () => {
  const a4 = { cx: mmToEmu(210), cy: mmToEmu(297) };
  assert.deepEqual(deckSize([a4, a4], true), a4);
  assert.equal(deckSize([a4, { cx: mmToEmu(216), cy: mmToEmu(279) }], true), null);
  assert.equal(deckSize([a4], false), null);
});

/** A small XML well-formedness check: every tag closes in order, every
 *  attribute is quoted, no stray "<" or "&" in text. */
export function wellFormed(xml: string): string | null {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, "");
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  let roots = 0;
  while ((m = re.exec(body))) {
    if (m[6]) return `stray < at ${m.index}`;
    if (m[5] !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5])) return `bad entity near ${m.index}`;
      if (!stack.length && m[5].trim()) return "text outside the root";
      continue;
    }
    const [, close, name, , self] = m;
    if (close) {
      if (stack.pop() !== name) return `mismatched </${name}> at ${m.index}`;
    } else if (!self) {
      if (!stack.length) roots++;
      stack.push(name);
    } else if (!stack.length) roots++;
  }
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  if (roots !== 1) return `${roots} root elements`;
  return null;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><text>Dose &amp; response</text></svg>';

function deck(): PptxDeck {
  return {
    title: "My study <draft>",
    date: "2026-10-09T08:30:15.123Z",
    slides: [
      { title: "Graph of Dose response", notes: "Figure 1. Mean & SD.\nn = 3 per dose.",
        figure: { svg: SVG, png: PNG, size: { cx: pxToEmu(800), cy: pxToEmu(600) } } },
      { title: "Layout 1", notes: "", upscale: false,
        figure: { svg: SVG, png: PNG, size: { cx: mmToEmu(210), cy: mmToEmu(297) } } },
    ],
  };
}

test("EMU conversions: 96 px and 25.4 mm are one inch", () => {
  assert.equal(pxToEmu(96), EMU_PER_INCH);
  assert.equal(mmToEmu(25.4), EMU_PER_INCH);
  assert.equal(SLIDE_16_9.cx / SLIDE_16_9.cy, 16 / 9);
});

test("a figure is fitted into the content box, centred, keeping its aspect", () => {
  const box = contentRect(SLIDE_16_9, true);
  assert.deepEqual(box, { x: 457200, y: 1028700, cx: 11277600, cy: 5486400 });
  const r = fitRect({ cx: 800, cy: 600 }, box);
  // limited by height: 5486400 tall, 4:3 wide
  assert.equal(r.cy, 5486400);
  assert.equal(r.cx, 7315200);
  assert.equal(r.y, box.y);
  assert.equal(r.x, box.x + (box.cx - r.cx) / 2);
  // without upscaling a small figure keeps its size
  const small = fitRect({ cx: 1000, cy: 500 }, box, false);
  assert.equal(small.cx, 1000);
  assert.equal(small.cy, 500);
  // a page without a title fills the slide
  assert.deepEqual(contentRect({ cx: 100, cy: 200 }, false), { x: 0, y: 0, cx: 100, cy: 200 });
  assert.ok(titleRect(SLIDE_16_9).y + titleRect(SLIDE_16_9).cy <= box.y);
});

test("slide sizes are kept within what PowerPoint opens", () => {
  assert.deepEqual(clampSlide({ cx: 10, cy: 99999999 }), { cx: 914400, cy: 51206400 });
});

test("text is escaped and invalid XML characters dropped", () => {
  assert.equal(xmlEscape(`a<b & "c" 'd'\u0001`), "a&lt;b &amp; &quot;c&quot; &apos;d&apos;");
  assert.equal(paragraphs("one\n\ntwo").match(/<a:p>/g)?.length, 3);
});

test("relationship ids: fixed parts take rId1-rId6, slides follow", () => {
  assert.equal(slideRelId(0), "rId7");
  assert.equal(slideId(0), 256);
  const parts = pptxParts(deck());
  const pres = strFromU8(parts["ppt/presentation.xml"]);
  const rels = strFromU8(parts["ppt/_rels/presentation.xml.rels"]);
  assert.match(pres, /<p:sldId id="256" r:id="rId7"\/><p:sldId id="257" r:id="rId8"\/>/);
  assert.match(rels, /Id="rId7" Type="[^"]+\/slide" Target="slides\/slide1.xml"/);
  assert.match(rels, /Id="rId8" Type="[^"]+\/slide" Target="slides\/slide2.xml"/);
  assert.match(pres, /<p:sldSz cx="12192000" cy="6858000"\/>/);
});

test("every part is present, declared and well-formed", () => {
  const parts = pptxParts(deck());
  const names = Object.keys(parts);
  assert.equal(names[0], "[Content_Types].xml");
  for (const p of [
    "_rels/.rels", "docProps/core.xml", "docProps/app.xml", "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels", "ppt/slideMasters/slideMaster1.xml",
    "ppt/slideLayouts/slideLayout1.xml", "ppt/notesMasters/notesMaster1.xml",
    "ppt/theme/theme1.xml", "ppt/theme/theme2.xml", "ppt/slides/slide1.xml",
    "ppt/slides/slide2.xml", "ppt/notesSlides/notesSlide1.xml", "ppt/media/image1.svg",
    "ppt/media/image1.png", "ppt/slides/_rels/slide1.xml.rels",
  ]) assert.ok(names.includes(p), p);
  const types = strFromU8(parts["[Content_Types].xml"]);
  for (const n of names) {
    if (!n.endsWith(".xml") || n === "[Content_Types].xml") continue;
    assert.ok(types.includes(`PartName="/${n}"`), `content type of ${n}`);
  }
  assert.match(types, /Extension="svg" ContentType="image\/svg\+xml"/);
  assert.match(types, /Extension="png" ContentType="image\/png"/);
  for (const n of names) {
    if (!/\.(xml|rels)$/.test(n)) continue;
    assert.equal(wellFormed(strFromU8(parts[n])), null, n);
  }
  // every relationship target exists in the package
  for (const n of names.filter((x) => x.endsWith(".rels"))) {
    const base = n.replace(/_rels\/[^/]*\.rels$/, "");
    for (const [, target] of strFromU8(parts[n]).matchAll(/Target="([^"]+)"/g)) {
      const parts2 = (base + target).split("/");
      const path: string[] = [];
      for (const s of parts2) { if (s === "..") path.pop(); else if (s) path.push(s); }
      assert.ok(names.includes(path.join("/")), `${n} -> ${target}`);
    }
  }
});

test("a slide holds the title, and the figure as an SVG picture with PNG fallback", () => {
  const parts = pptxParts(deck());
  const s1 = strFromU8(parts["ppt/slides/slide1.xml"]);
  assert.match(s1, /<p:ph type="title"\/>/);
  assert.match(s1, /<a:t>Graph of Dose response<\/a:t>/);
  assert.match(s1, /<a:blip r:embed="rId2">/);
  assert.ok(s1.includes(`<a:ext uri="${SVG_BLIP_EXT}"><asvg:svgBlip`));
  assert.match(s1, /<asvg:svgBlip [^>]*r:embed="rId3"\/>/);
  const rels = strFromU8(parts["ppt/slides/_rels/slide1.xml.rels"]);
  assert.match(rels, /Id="rId2" [^>]*Target="..\/media\/image1.png"/);
  assert.match(rels, /Id="rId3" [^>]*Target="..\/media\/image1.svg"/);
  assert.match(rels, /notesSlide1.xml/);
  // the legend is in the notes, one paragraph per line
  const notes = strFromU8(parts["ppt/notesSlides/notesSlide1.xml"]);
  assert.match(notes, /<a:t>Figure 1. Mean &amp; SD.<\/a:t>/);
  assert.match(notes, /<a:t>n = 3 per dose.<\/a:t>/);
  // the page layout keeps its printed size: A4 is taller than the box, so
  // it is scaled down to the box height
  const s2 = strFromU8(parts["ppt/slides/slide2.xml"]);
  const ext = /<p:pic>.*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(s2)!;
  assert.equal(Number(ext[2]), 5486400);
  assert.ok(Math.abs(Number(ext[1]) / Number(ext[2]) - 210 / 297) < 1e-3);
});

test("a slide without a figure or title is still a valid slide", () => {
  const xml = slideXml({ title: "", notes: "", figure: null }, SLIDE_16_9);
  assert.equal(wellFormed(xml), null);
  assert.doesNotMatch(xml, /<p:pic>/);
});

test("the zip round-trips and stores the PNG", () => {
  const bytes = buildPptx(deck());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const files = unzipSync(bytes);
  assert.equal(Object.keys(files).length, Object.keys(pptxParts(deck())).length);
  assert.deepEqual([...files["ppt/media/image1.png"]], [...PNG]);
  assert.equal(strFromU8(files["ppt/media/image2.svg"]), SVG);
  const core = strFromU8(files["docProps/core.xml"]);
  assert.match(core, /<dc:title>My study &lt;draft&gt;<\/dc:title>/);
  assert.match(core, /2026-10-09T08:30:15Z/);
});
