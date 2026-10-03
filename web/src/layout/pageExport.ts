// Export a whole layout page: graphs from the live placeholders, pictures
// as stored, and the composer's own text, legend and letters.
import { encodeTiff } from "../lib/tiff";
import { CHROME_DARK, CHROME_LIGHT, isDarkMode } from "../lib/palette";
import type { LegendEntry, ResolvedLayout } from "../project/layout";
import { pageDims, panelLetters, PX_PER_MM, readingOrder } from "../project/layout";
import type { ExportFormat, GraphSheet, Project } from "../project/types";
import { composePage, mmPx, type PagePanel } from "../export/compose";
import {
  canvasToBlob, exportFigure, figureFontSizes, figureToSvg, svgToCanvas, toPaperColours,
  waitForPlot,
} from "../export/figure";
import { svgPagesToPdf } from "../export/pdf";
import { withPngDpi } from "../export/png";
import { CSS_DPI, MIME, rasterSize, smallestFontPt, tooLarge } from "../export/settings";

export interface PageExportOptions {
  format: ExportFormat;
  dpi: number;
  /** Dark theme: export in light print colours. */
  paper: boolean;
}

export function pagePixels(layout: ResolvedLayout, dpi: number) {
  const { w, h } = pageDims(layout.page);
  return rasterSize(w * PX_PER_MM, h * PX_PER_MM, dpi);
}

export function pageTooLarge(layout: ResolvedLayout, o: PageExportOptions): boolean {
  if (o.format === "svg" || o.format === "pdf") return false;
  const px = pagePixels(layout, o.dpi);
  return tooLarge(px.w, px.h);
}

type PlotDiv = Parameters<typeof exportFigure>[0];

const plotOf = (pageEl: HTMLElement, itemId: string) =>
  pageEl.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"] .layout-graph`);

/** Smallest text on the page, in pt (the page is exported at its size). */
export function pageSmallestPt(pageEl: HTMLElement, layout: ResolvedLayout): number | null {
  const px: number[] = [];
  for (const it of layout.items) {
    if (it.kind === "graph" && it.graphId) {
      const gd = plotOf(pageEl, it.id)?.querySelector(".plot") as PlotDiv | null;
      if (gd?._fullLayout) px.push(...figureFontSizes(gd));
    }
    if (it.kind === "text" && it.text.trim()) px.push(it.fontSize * CSS_DPI / 72);
    if (it.kind === "legend") px.push(it.fontSize * CSS_DPI / 72);
  }
  if (layout.letters.show && layout.items.some((i) => i.kind === "picture"
    || (i.kind === "graph" && i.graphId))) px.push(layout.letters.fontSize * CSS_DPI / 72);
  return smallestFontPt(px);
}

export async function exportPage(pageEl: HTMLElement, layout: ResolvedLayout, project: Project,
  legend: LegendEntry[], o: PageExportOptions): Promise<Blob> {
  const dark = isDarkMode();
  const paper = !dark || o.paper;
  const chrome = paper ? CHROME_LIGHT : CHROME_DARK;
  const flat = o.format === "jpeg" || o.format === "tiff";
  const bgSetting = layout.page.background;
  const background = bgSetting === "transparent"
    ? (flat ? "#ffffff" : null)
    : (!paper && bgSetting.toLowerCase() === "#ffffff" ? chrome.surface : bgSetting);

  const panels: PagePanel[] = [];
  for (const it of readingOrder(layout.items)) {
    if (it.kind === "picture") panels.push({ item: it, svg: it.svg });
    if (it.kind !== "graph" || !it.graphId) continue;
    const graph = project.sheets.find((s) => s.id === it.graphId) as GraphSheet | undefined;
    const host = plotOf(pageEl, it.id);
    const gd = host ? await waitForPlot(host) : null;
    if (!gd || !graph) continue;
    const fig = exportFigure(gd, { transparent: true, paper: dark && o.paper,
      scheme: graph.settings.scheme });
    if (it.hideLegend) fig.layout = { ...fig.layout, showlegend: false };
    panels.push({ item: it, svg: await figureToSvg(fig, mmPx(it.w), mmPx(it.h)) });
  }

  const page = composePage({
    page: layout.page, items: layout.items, panels,
    letters: layout.letters, letterMap: panelLetters(layout.items, layout.letters),
    legend: dark && o.paper ? toPaperColours(legend) : legend,
    ink: chrome.ink, outline: chrome.surface, background,
  });

  if (o.format === "svg") return new Blob([page.svg], { type: MIME.svg });
  if (o.format === "pdf") return svgPagesToPdf([{ svg: page.svg, width: page.width, height: page.height }]);
  const canvas = await svgToCanvas(page.svg, page.width, page.height, o.dpi / CSS_DPI,
    flat ? background ?? "#ffffff" : null);
  if (o.format === "tiff") {
    const ctx = canvas.getContext("2d")!;
    return encodeTiff(ctx.getImageData(0, 0, canvas.width, canvas.height), o.dpi);
  }
  const blob = await canvasToBlob(canvas, MIME[o.format], o.format === "png" ? undefined : 0.95);
  if (o.format !== "png") return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new Blob([withPngDpi(bytes, o.dpi)], { type: MIME.png });
}
