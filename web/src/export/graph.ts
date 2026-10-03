// One graph -> one file, in any export format.
import type { SchemeId } from "../lib/palette";
import { encodeTiff } from "../lib/tiff";
import type { ExportPrefs } from "../project/types";
import {
  dataUrlToBytes, exportFigure, figureFontSizes, figureToRaster, figureToSvg,
  pngPixels, scaleFor, type ExportLook,
} from "./figure";
import { svgPagesToPdf } from "./pdf";
import { withPngDpi } from "./png";
import { MIME, smallestFontPt, supportsTransparency } from "./settings";

type PlotDiv = Parameters<typeof exportFigure>[0];

export interface GraphGeometry {
  /** Size the figure is laid out at (CSS px). */
  layoutW: number;
  layoutH: number;
  /** Exported size over laid-out size (1 unless text scales with the graph). */
  k: number;
}

/** How a graph is laid out for an export of W × H px. Scaling mode lays
 *  it out at its on-screen width (same aspect as the export) and then
 *  scales the result, so text changes size with the graph. */
export function geometry(gd: HTMLElement, s: ExportPrefs): GraphGeometry {
  if (!s.scaleText) return { layoutW: s.width, layoutH: s.height, k: 1 };
  const full = (gd as PlotDiv)._fullLayout as { width?: number } | undefined;
  const screenW = full?.width || gd.clientWidth || s.width;
  return { layoutW: screenW, layoutH: screenW * s.height / s.width, k: s.width / screenW };
}

/** Smallest text in the exported figure, in pt. */
export function graphSmallestPt(gd: HTMLElement, s: ExportPrefs): number | null {
  return smallestFontPt(figureFontSizes(gd as PlotDiv), geometry(gd, s).k);
}

export function lookFor(s: ExportPrefs, scheme?: SchemeId): ExportLook {
  return { transparent: s.transparent && supportsTransparency(s.format), paper: s.paper, scheme };
}

/** SVG markup of the graph at the export size. */
export async function graphSvg(gd: HTMLElement, s: ExportPrefs, scheme?: SchemeId):
  Promise<string> {
  const g = geometry(gd, s);
  const fig = exportFigure(gd as PlotDiv, lookFor({ ...s, format: "svg" }, scheme));
  const svg = await figureToSvg(fig, g.layoutW, g.layoutH);
  return g.k === 1 ? svg : resizeSvg(svg, s.width, s.height, g.layoutW, g.layoutH);
}

/** Give an SVG a new outer size, scaling its content via viewBox. */
export function resizeSvg(svg: string, w: number, h: number, vw: number, vh: number): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  root.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
  root.setAttribute("width", String(w));
  root.setAttribute("height", String(h));
  return new XMLSerializer().serializeToString(root);
}

export async function graphPngBlob(gd: HTMLElement, s: ExportPrefs, scheme?: SchemeId):
  Promise<Blob> {
  const g = geometry(gd, s);
  const fig = exportFigure(gd as PlotDiv, lookFor({ ...s, format: "png" }, scheme));
  const url = await figureToRaster(fig, "png", g.layoutW, g.layoutH, g.k * scaleFor(s.dpi));
  return new Blob([withPngDpi(await dataUrlToBytes(url), s.dpi)], { type: "image/png" });
}

/** The graph as a file in `s.format`. */
export async function graphBlob(gd: HTMLElement, s: ExportPrefs, scheme?: SchemeId):
  Promise<Blob> {
  const g = geometry(gd, s);
  switch (s.format) {
    case "svg":
      return new Blob([await graphSvg(gd, s, scheme)], { type: MIME.svg });
    case "pdf":
      return svgPagesToPdf([{ svg: await graphSvg(gd, s, scheme), width: s.width, height: s.height }]);
    case "png":
      return graphPngBlob(gd, s, scheme);
    case "tiff": {
      // No browser encodes TIFF: render a PNG at the requested resolution,
      // read the pixels back and write the TIFF container ourselves.
      const fig = exportFigure(gd as PlotDiv, lookFor(s, scheme));
      const url = await figureToRaster(fig, "png", g.layoutW, g.layoutH, g.k * scaleFor(s.dpi));
      return encodeTiff(await pngPixels(url), s.dpi);
    }
    case "jpeg":
    case "webp": {
      const fig = exportFigure(gd as PlotDiv, lookFor(s, scheme));
      const url = await figureToRaster(fig, s.format, g.layoutW, g.layoutH, g.k * scaleFor(s.dpi));
      return new Blob([await dataUrlToBytes(url)], { type: MIME[s.format] });
    }
  }
}
