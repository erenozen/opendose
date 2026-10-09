// PowerPoint (.pptx) files written by hand: the Office Open XML parts of a
// minimal presentation (one slide master, one "Title Only" layout, a theme,
// a notes master) and one slide per figure, zipped with fflate. Each figure
// is a picture with an SVG part and a PNG fallback, the way PowerPoint 2016
// and later store SVG (the svgBlip extension): the slide shows the vector
// graph and "Convert to Shape" turns it into editable shapes and text; older
// readers show the PNG. The figure legend goes in the slide's notes.
// Pure: the browser side (rendering graphs, saving the file) is in
// usePptxExport.tsx. Reference: ECMA-376 Part 1 (PresentationML,
// DrawingML) and [MS-ODRAWXML] 2.3.10 (svgBlip).
import { zipSync, strToU8 } from "fflate";
import type { GraphSheet, LayoutSheet, Project } from "../project/types.ts";

// ------------------------------------------------------------ geometry

export const EMU_PER_INCH = 914400;
/** CSS pixels are 96 per inch. */
export const EMU_PER_PX = EMU_PER_INCH / 96;
export const EMU_PER_MM = 36000;

export interface Size { cx: number; cy: number }
export interface Rect extends Size { x: number; y: number }

/** 13.333 × 7.5 in, PowerPoint's "Widescreen". */
export const SLIDE_16_9: Size = { cx: 12192000, cy: 6858000 };
/** Notes pages: 7.5 × 10 in portrait. */
export const NOTES_SIZE: Size = { cx: 6858000, cy: 9144000 };
/** Slide sizes PowerPoint accepts (1 in to 56 in). */
const SLIDE_MIN = 914400;
const SLIDE_MAX = 51206400;

const MARGIN = EMU_PER_INCH / 2;

export const pxToEmu = (px: number) => Math.round(px * EMU_PER_PX);
export const mmToEmu = (mm: number) => Math.round(mm * EMU_PER_MM);

/** A slide size within what PowerPoint opens. */
export function clampSlide(s: Size): Size {
  const c = (v: number) => Math.round(Math.min(SLIDE_MAX, Math.max(SLIDE_MIN, v)));
  return { cx: c(s.cx), cy: c(s.cy) };
}

/** The title band at the top of a slide. */
export function titleRect(slide: Size): Rect {
  return { x: MARGIN, y: EMU_PER_INCH / 4, cx: slide.cx - 2 * MARGIN, cy: Math.round(EMU_PER_INCH * 0.75) };
}

/** Where the figure goes: below the title band, with margins (or the whole
 *  slide when there is no title). */
export function contentRect(slide: Size, withTitle: boolean): Rect {
  if (!withTitle) return { x: 0, y: 0, cx: slide.cx, cy: slide.cy };
  const top = Math.round(EMU_PER_INCH * 1.125);
  const bottom = Math.round(EMU_PER_INCH * 0.375);
  return { x: MARGIN, y: top, cx: slide.cx - 2 * MARGIN, cy: slide.cy - top - bottom };
}

/** The largest rectangle of the figure's aspect ratio that fits `box`,
 *  centred in it. With `upscale` false a figure smaller than the box keeps
 *  its natural size. */
export function fitRect(natural: Size, box: Rect, upscale = true): Rect {
  if (!(natural.cx > 0) || !(natural.cy > 0)) return { ...box };
  let k = Math.min(box.cx / natural.cx, box.cy / natural.cy);
  if (!upscale) k = Math.min(k, 1);
  const cx = Math.round(natural.cx * k);
  const cy = Math.round(natural.cy * k);
  return {
    x: box.x + Math.round((box.cx - cx) / 2),
    y: box.y + Math.round((box.cy - cy) / 2),
    cx, cy,
  };
}

// ------------------------------------------------------------ text

/** Characters XML 1.0 cannot hold at all. */
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function xmlEscape(s: string): string {
  return s.replace(XML_INVALID, "").replace(/[<>&"']/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  asvg: "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
  rels: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
};
const PML_NS = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
/** The svgBlip extension of a:blip ([MS-ODRAWXML] 2.3.10). */
export const SVG_BLIP_EXT = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}";

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const REL_TYPES = {
  officeDocument: `${REL}/officeDocument`,
  core: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  extended: `${REL}/extended-properties`,
  slideMaster: `${REL}/slideMaster`,
  slideLayout: `${REL}/slideLayout`,
  slide: `${REL}/slide`,
  notesMaster: `${REL}/notesMaster`,
  notesSlide: `${REL}/notesSlide`,
  theme: `${REL}/theme`,
  presProps: `${REL}/presProps`,
  viewProps: `${REL}/viewProps`,
  tableStyles: `${REL}/tableStyles`,
  image: `${REL}/image`,
} as const;

const CT = "application/vnd.openxmlformats-officedocument";
export const CONTENT_TYPES = {
  presentation: `${CT}.presentationml.presentation.main+xml`,
  slide: `${CT}.presentationml.slide+xml`,
  slideMaster: `${CT}.presentationml.slideMaster+xml`,
  slideLayout: `${CT}.presentationml.slideLayout+xml`,
  notesMaster: `${CT}.presentationml.notesMaster+xml`,
  notesSlide: `${CT}.presentationml.notesSlide+xml`,
  theme: `${CT}.theme+xml`,
  presProps: `${CT}.presentationml.presProps+xml`,
  viewProps: `${CT}.presentationml.viewProps+xml`,
  tableStyles: `${CT}.presentationml.tableStyles+xml`,
  core: "application/vnd.openxmlformats-package.core-properties+xml",
  extended: `${CT}.extended-properties+xml`,
  rels: "application/vnd.openxmlformats-package.relationships+xml",
} as const;

// ------------------------------------------------------------ relationships

export interface Relationship { id: string; type: string; target: string }

export function relsXml(rels: Relationship[]): string {
  return `${XML_HEAD}<Relationships xmlns="${NS.rels}">`
    + rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${xmlEscape(r.target)}"/>`).join("")
    + "</Relationships>";
}

// ------------------------------------------------------------ the deck

export interface PptxFigure {
  /** SVG markup of the figure. */
  svg: string;
  /** PNG fallback (shown by readers without SVG support). */
  png: Uint8Array;
  /** Natural size of the figure (EMU), for its aspect ratio. */
  size: Size;
}

export interface PptxSlide {
  /** Slide title (a graph's or layout's sheet name), or "" for none. */
  title: string;
  figure: PptxFigure | null;
  /** Speaker notes: the figure legend. Paragraphs split on "\n". */
  notes: string;
  /** Alternative text of the picture. */
  alt?: string;
  /** Scale a figure up to fill the slide (graphs); false keeps a page
   *  layout at its printed size when it fits. */
  upscale?: boolean;
}

export interface PptxDeck {
  title: string;
  slides: PptxSlide[];
  /** Slide size; 16:9 by default. */
  size?: Size;
  /** ISO date-time written to the document properties. */
  date: string;
  /** "OpenDose 0.3.0 (build …)" */
  app?: string;
}

/** The ids the deck's parts use: slide i (0-based) is slideN.xml with
 *  N = i + 1, its picture media imageN.png / imageN.svg; in
 *  presentation.xml.rels the fixed parts take rId1–rId6 and slides follow. */
export function slideRelId(i: number): string { return `rId${7 + i}`; }
export function slideId(i: number): number { return 256 + i; }

const MASTER_ID = 2147483648;
const LAYOUT_ID = 2147483649;

const W3C = (iso: string) => `${iso.slice(0, 19)}Z`;

export function contentTypesXml(slides: number): string {
  const over = (part: string, type: string) => `<Override PartName="${part}" ContentType="${type}"/>`;
  const parts = [
    over("/ppt/presentation.xml", CONTENT_TYPES.presentation),
    over("/ppt/slideMasters/slideMaster1.xml", CONTENT_TYPES.slideMaster),
    over("/ppt/slideLayouts/slideLayout1.xml", CONTENT_TYPES.slideLayout),
    over("/ppt/notesMasters/notesMaster1.xml", CONTENT_TYPES.notesMaster),
    over("/ppt/theme/theme1.xml", CONTENT_TYPES.theme),
    over("/ppt/theme/theme2.xml", CONTENT_TYPES.theme),
    over("/ppt/presProps.xml", CONTENT_TYPES.presProps),
    over("/ppt/viewProps.xml", CONTENT_TYPES.viewProps),
    over("/ppt/tableStyles.xml", CONTENT_TYPES.tableStyles),
    over("/docProps/core.xml", CONTENT_TYPES.core),
    over("/docProps/app.xml", CONTENT_TYPES.extended),
  ];
  for (let i = 1; i <= slides; i++) {
    parts.push(over(`/ppt/slides/slide${i}.xml`, CONTENT_TYPES.slide));
    parts.push(over(`/ppt/notesSlides/notesSlide${i}.xml`, CONTENT_TYPES.notesSlide));
  }
  return `${XML_HEAD}<Types xmlns="${NS.ct}">`
    + `<Default Extension="rels" ContentType="${CONTENT_TYPES.rels}"/>`
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Default Extension="svg" ContentType="image/svg+xml"/>'
    + parts.join("") + "</Types>";
}

export function rootRelsXml(): string {
  return relsXml([
    { id: "rId1", type: REL_TYPES.officeDocument, target: "ppt/presentation.xml" },
    { id: "rId2", type: REL_TYPES.core, target: "docProps/core.xml" },
    { id: "rId3", type: REL_TYPES.extended, target: "docProps/app.xml" },
  ]);
}

export function presentationXml(slides: number, size: Size): string {
  const ids = Array.from({ length: slides }, (_, i) =>
    `<p:sldId id="${slideId(i)}" r:id="${slideRelId(i)}"/>`).join("");
  return `${XML_HEAD}<p:presentation ${PML_NS} saveSubsetFonts="1">`
    + `<p:sldMasterIdLst><p:sldMasterId id="${MASTER_ID}" r:id="rId1"/></p:sldMasterIdLst>`
    + '<p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>'
    + `<p:sldIdLst>${ids}</p:sldIdLst>`
    + `<p:sldSz cx="${size.cx}" cy="${size.cy}"/>`
    + `<p:notesSz cx="${NOTES_SIZE.cx}" cy="${NOTES_SIZE.cy}"/>`
    + `<p:defaultTextStyle>${levelStyle(1800)}</p:defaultTextStyle>`
    + "</p:presentation>";
}

export function presentationRelsXml(slides: number): string {
  return relsXml([
    { id: "rId1", type: REL_TYPES.slideMaster, target: "slideMasters/slideMaster1.xml" },
    { id: "rId2", type: REL_TYPES.notesMaster, target: "notesMasters/notesMaster1.xml" },
    { id: "rId3", type: REL_TYPES.theme, target: "theme/theme1.xml" },
    { id: "rId4", type: REL_TYPES.presProps, target: "presProps.xml" },
    { id: "rId5", type: REL_TYPES.viewProps, target: "viewProps.xml" },
    { id: "rId6", type: REL_TYPES.tableStyles, target: "tableStyles.xml" },
    ...Array.from({ length: slides }, (_, i) => ({
      id: slideRelId(i), type: REL_TYPES.slide, target: `slides/slide${i + 1}.xml`,
    })),
  ]);
}

function levelStyle(sz: number, extra = ""): string {
  return `<a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">${extra}`
    + `<a:defRPr sz="${sz}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>`
    + '<a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>';
}

const GROUP_PROPS = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
  + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
  + '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" '
  + 'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" '
  + 'accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

const xfrm = (r: Rect) => `<a:xfrm><a:off x="${r.x}" y="${r.y}"/><a:ext cx="${r.cx}" cy="${r.cy}"/></a:xfrm>`;

/** Paragraphs of plain text (one a:p per line; an empty line keeps an
 *  empty paragraph). */
export function paragraphs(text: string, rPr = '<a:rPr lang="en-US" dirty="0"/>'): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines.map((l) => (l
    ? `<a:p><a:r>${rPr}<a:t>${xmlEscape(l)}</a:t></a:r></a:p>`
    : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>')).join("");
}

export function slideMasterXml(size: Size): string {
  const title = titleRect(size);
  return `${XML_HEAD}<p:sldMaster ${PML_NS}>`
    + '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>'
    + GROUP_PROPS
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>'
    + `<p:spPr>${xfrm(title)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
    + '<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" '
    + 'rtlCol="0" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>'
    + '<a:p><a:r><a:rPr lang="en-US"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>'
    + "</p:spTree></p:cSld>"
    + CLR_MAP
    + `<p:sldLayoutIdLst><p:sldLayoutId id="${LAYOUT_ID}" r:id="rId1"/></p:sldLayoutIdLst>`
    + "<p:txStyles>"
    + '<p:titleStyle><a:lvl1pPr algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">'
    + '<a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/>'
    + '<a:defRPr sz="2800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill>'
    + '<a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>'
    + `<p:bodyStyle>${levelStyle(1800, "<a:buNone/>")}</p:bodyStyle>`
    + `<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${levelStyle(1800)}</p:otherStyle>`
    + "</p:txStyles></p:sldMaster>";
}

export function slideMasterRelsXml(): string {
  return relsXml([
    { id: "rId1", type: REL_TYPES.slideLayout, target: "../slideLayouts/slideLayout1.xml" },
    { id: "rId2", type: REL_TYPES.theme, target: "../theme/theme1.xml" },
  ]);
}

export function slideLayoutXml(): string {
  return `${XML_HEAD}<p:sldLayout ${PML_NS} type="titleOnly" preserve="1">`
    + '<p:cSld name="Title Only"><p:spTree>' + GROUP_PROPS
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>'
    + '<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>'
    + '<a:p><a:r><a:rPr lang="en-US"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>'
    + "</p:spTree></p:cSld>"
    + "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";
}

export function slideLayoutRelsXml(): string {
  return relsXml([
    { id: "rId1", type: REL_TYPES.slideMaster, target: "../slideMasters/slideMaster1.xml" },
  ]);
}

export function notesMasterXml(): string {
  return `${XML_HEAD}<p:notesMaster ${PML_NS}>`
    + '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>'
    + GROUP_PROPS
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>'
    + '<p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr>'
    + `<p:spPr>${xfrm({ x: 685800, y: 1143000, cx: 5486400, cy: 3086100 })}`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>'
    + '<a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>'
    + '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
    + '<p:nvPr><p:ph type="body" sz="quarter" idx="1"/></p:nvPr></p:nvSpPr>'
    + `<p:spPr>${xfrm({ x: 685800, y: 4400550, cx: 5486400, cy: 3600450 })}`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>'
    + '<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/>'
    + '<a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Notes</a:t></a:r></a:p></p:txBody></p:sp>'
    + "</p:spTree></p:cSld>"
    + CLR_MAP
    + `<p:notesStyle>${levelStyle(1200)}</p:notesStyle>`
    + "</p:notesMaster>";
}

export function notesMasterRelsXml(): string {
  return relsXml([{ id: "rId1", type: REL_TYPES.theme, target: "../theme/theme2.xml" }]);
}

/** One slide: an optional title and the figure as an SVG picture with its
 *  PNG fallback (r:embed = rId2 PNG, svgBlip r:embed = rId3 SVG). */
export function slideXml(s: PptxSlide, size: Size): string {
  const withTitle = !!s.title.trim();
  const parts: string[] = [];
  if (withTitle) {
    parts.push('<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/>'
      + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>'
      + `<p:spPr>${xfrm(titleRect(size))}</p:spPr>`
      + '<p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/>'
      + paragraphs(s.title.replace(/\s*\n\s*/g, " "), '<a:rPr lang="en-US" sz="2400" dirty="0"/>')
      + "</p:txBody></p:sp>");
  }
  if (s.figure) {
    const box = fitRect(s.figure.size, contentRect(size, withTitle), s.upscale !== false);
    const alt = s.alt ?? s.title;
    parts.push('<p:pic><p:nvPicPr>'
      + `<p:cNvPr id="3" name="Figure 1" descr="${xmlEscape(alt)}"/>`
      + '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
      + '<p:blipFill><a:blip r:embed="rId2"><a:extLst>'
      + `<a:ext uri="${SVG_BLIP_EXT}"><asvg:svgBlip xmlns:asvg="${NS.asvg}" r:embed="rId3"/></a:ext>`
      + "</a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>"
      + `<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
      + "</p:pic>");
  }
  return `${XML_HEAD}<p:sld ${PML_NS}><p:cSld><p:spTree>${GROUP_PROPS}${parts.join("")}`
    + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";
}

export function slideRelsXml(n: number, hasFigure: boolean): string {
  const rels: Relationship[] = [
    { id: "rId1", type: REL_TYPES.slideLayout, target: "../slideLayouts/slideLayout1.xml" },
  ];
  if (hasFigure) {
    rels.push({ id: "rId2", type: REL_TYPES.image, target: `../media/image${n}.png` });
    rels.push({ id: "rId3", type: REL_TYPES.image, target: `../media/image${n}.svg` });
  }
  rels.push({ id: "rId4", type: REL_TYPES.notesSlide, target: `../notesSlides/notesSlide${n}.xml` });
  return relsXml(rels);
}

export function notesSlideXml(notes: string): string {
  return `${XML_HEAD}<p:notes ${PML_NS}><p:cSld><p:spTree>${GROUP_PROPS}`
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>'
    + '<p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
    + '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/>'
    + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
    + '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>'
    + `<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(notes)}</p:txBody></p:sp>`
    + "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>";
}

export function notesSlideRelsXml(n: number): string {
  return relsXml([
    { id: "rId1", type: REL_TYPES.notesMaster, target: "../notesMasters/notesMaster1.xml" },
    { id: "rId2", type: REL_TYPES.slide, target: `../slides/slide${n}.xml` },
  ]);
}

/** A plain Office theme (colours, fonts, line and fill styles). */
export function themeXml(name = "OpenDose"): string {
  const sys = (tag: string, val: string, last: string) =>
    `<a:${tag}><a:sysClr val="${val}" lastClr="${last}"/></a:${tag}>`;
  const rgb = (tag: string, v: string) => `<a:${tag}><a:srgbClr val="${v}"/></a:${tag}>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w: number) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${fill}`
    + '<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>';
  const font = (latin: string) => `<a:latin typeface="${latin}"/><a:ea typeface=""/><a:cs typeface=""/>`;
  return `${XML_HEAD}<a:theme xmlns:a="${NS.a}" name="${xmlEscape(name)}"><a:themeElements>`
    + `<a:clrScheme name="${xmlEscape(name)}">`
    + sys("dk1", "windowText", "000000") + sys("lt1", "window", "FFFFFF")
    + rgb("dk2", "1F2937") + rgb("lt2", "E7E6E6")
    + rgb("accent1", "2563EB") + rgb("accent2", "D97706") + rgb("accent3", "059669")
    + rgb("accent4", "DC2626") + rgb("accent5", "7C3AED") + rgb("accent6", "0891B2")
    + rgb("hlink", "0563C1") + rgb("folHlink", "954F72")
    + "</a:clrScheme>"
    + `<a:fontScheme name="${xmlEscape(name)}">`
    + `<a:majorFont>${font("Calibri")}</a:majorFont><a:minorFont>${font("Calibri")}</a:minorFont>`
    + "</a:fontScheme>"
    + `<a:fmtScheme name="${xmlEscape(name)}">`
    + `<a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>`
    + `<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>`
    + "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>"
    + "<a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>"
    + `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst>`
    + "</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>";
}

export function coreXml(title: string, date: string): string {
  return `${XML_HEAD}<cp:coreProperties `
    + 'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    + 'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${xmlEscape(title)}</dc:title><dc:creator>OpenDose</dc:creator>`
    + "<cp:lastModifiedBy>OpenDose</cp:lastModifiedBy>"
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${W3C(date)}</dcterms:created>`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${W3C(date)}</dcterms:modified>`
    + "</cp:coreProperties>";
}

export function appXml(slides: number, app = "OpenDose"): string {
  return `${XML_HEAD}<Properties `
    + 'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
    + 'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + `<Application>${xmlEscape(app)}</Application><Slides>${slides}</Slides>`
    + `<Notes>${slides}</Notes></Properties>`;
}

/** Every part of the deck, by path in the package. [Content_Types].xml
 *  comes first, as Office writes it. */
export function pptxParts(deck: PptxDeck): Record<string, Uint8Array> {
  const size = clampSlide(deck.size ?? SLIDE_16_9);
  const n = deck.slides.length;
  const text: [string, string][] = [
    ["[Content_Types].xml", contentTypesXml(n)],
    ["_rels/.rels", rootRelsXml()],
    ["docProps/core.xml", coreXml(deck.title, deck.date)],
    ["docProps/app.xml", appXml(n, deck.app)],
    ["ppt/presentation.xml", presentationXml(n, size)],
    ["ppt/_rels/presentation.xml.rels", presentationRelsXml(n)],
    ["ppt/presProps.xml", `${XML_HEAD}<p:presentationPr ${PML_NS}/>`],
    ["ppt/viewProps.xml", `${XML_HEAD}<p:viewPr ${PML_NS}><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`],
    ["ppt/tableStyles.xml", `${XML_HEAD}<a:tblStyleLst xmlns:a="${NS.a}" `
      + 'def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'],
    ["ppt/slideMasters/slideMaster1.xml", slideMasterXml(size)],
    ["ppt/slideMasters/_rels/slideMaster1.xml.rels", slideMasterRelsXml()],
    ["ppt/slideLayouts/slideLayout1.xml", slideLayoutXml()],
    ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", slideLayoutRelsXml()],
    ["ppt/notesMasters/notesMaster1.xml", notesMasterXml()],
    ["ppt/notesMasters/_rels/notesMaster1.xml.rels", notesMasterRelsXml()],
    ["ppt/theme/theme1.xml", themeXml()],
    ["ppt/theme/theme2.xml", themeXml()],
  ];
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of text) out[k] = strToU8(v);
  deck.slides.forEach((s, i) => {
    const k = i + 1;
    out[`ppt/slides/slide${k}.xml`] = strToU8(slideXml(s, size));
    out[`ppt/slides/_rels/slide${k}.xml.rels`] = strToU8(slideRelsXml(k, !!s.figure));
    out[`ppt/notesSlides/notesSlide${k}.xml`] = strToU8(notesSlideXml(s.notes));
    out[`ppt/notesSlides/_rels/notesSlide${k}.xml.rels`] = strToU8(notesSlideRelsXml(k));
    if (s.figure) {
      out[`ppt/media/image${k}.png`] = s.figure.png;
      out[`ppt/media/image${k}.svg`] = strToU8(s.figure.svg);
    }
  });
  return out;
}

/** The .pptx file: XML and SVG deflated, PNG stored. */
export function buildPptx(deck: PptxDeck): Uint8Array {
  const parts = pptxParts(deck);
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [k, v] of Object.entries(parts)) entries[k] = [v, { level: k.endsWith(".png") ? 0 : 6 }];
  return zipSync(entries);
}

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// ------------------------------------------------------------ what to export

/** Which sheets go into the deck. */
export type PptxScope =
  | { kind: "all" }
  | { kind: "family"; dataId: string }
  | { kind: "graph"; graphId: string }
  | { kind: "layout"; layoutId: string };

/** The graph and layout sheets of a scope, in navigator order: one slide
 *  each. "All" takes every graph and every page layout. */
export function pptxSheets(p: Project, scope: PptxScope): (GraphSheet | LayoutSheet)[] {
  return p.sheets.filter((s): s is GraphSheet | LayoutSheet => {
    if (s.kind !== "graph" && s.kind !== "layout") return false;
    switch (scope.kind) {
      case "all": return true;
      case "family": return s.kind === "graph" && s.parentId === scope.dataId;
      case "graph": return s.id === scope.graphId;
      case "layout": return s.id === scope.layoutId;
    }
    return false;
  });
}

/** A deck of page layouts only, all one page size, takes that size and
 *  each page fills its slide (null: 16:9 slides with a title and the
 *  figure fitted below it). */
export function deckSize(pages: Size[], onlyLayouts: boolean): Size | null {
  if (!onlyLayouts || !pages.length) return null;
  const [first] = pages;
  return pages.every((s) => Math.abs(s.cx - first.cx) < 1000 && Math.abs(s.cy - first.cy) < 1000)
    ? clampSlide(first) : null;
}
