// Image-export settings: formats, sizes, journal presets, the font-size
// floor and file naming. Pure (no DOM), unit-tested.
//
// Sizes are kept in CSS pixels, 96 to the inch, because that is the unit
// Plotly lays a graph out in: a graph exported at 340 px wide is 90 mm
// wide on paper, and a 13 px font in it prints at 9.75 pt. Raster
// resolution (DPI) only decides how many pixels the file holds.
import type { ExportFormat, ExportPrefs } from "../project/types.ts";

export const CSS_DPI = 96;
export const MM_PER_IN = 25.4;
/** Below this, text is hard to read in print; most journals ask for 6-8 pt. */
export const FONT_FLOOR_PT = 6;
/** Beyond roughly this, browsers refuse to allocate the canvas. */
export const MAX_PIXELS = 60e6;
export const MAX_SIDE = 16000;

export const FORMATS: { id: ExportFormat; label: string; vector: boolean }[] = [
  { id: "png", label: "PNG", vector: false },
  { id: "svg", label: "SVG (vector)", vector: true },
  { id: "pdf", label: "PDF (vector)", vector: true },
  { id: "tiff", label: "TIFF (print)", vector: false },
  { id: "jpeg", label: "JPEG", vector: false },
  { id: "webp", label: "WebP", vector: false },
];

export const EXTENSIONS: Record<ExportFormat, string> = {
  png: "png", svg: "svg", pdf: "pdf", tiff: "tif", jpeg: "jpg", webp: "webp",
};

export const MIME: Record<ExportFormat, string> = {
  png: "image/png", svg: "image/svg+xml", pdf: "application/pdf",
  tiff: "image/tiff", jpeg: "image/jpeg", webp: "image/webp",
};

export const isVector = (f: ExportFormat) => f === "svg" || f === "pdf";
/** JPEG has no alpha and baseline TIFF is written as RGB. */
export const supportsTransparency = (f: ExportFormat) => f !== "jpeg" && f !== "tiff";

export const DEFAULT_EXPORT: ExportPrefs = {
  format: "png", width: 800, height: 600, dpi: 300, unit: "px",
  transparent: false, paper: true, scaleText: false,
};

export const DPI_CHOICES = [150, 300, 600, 1200];

export interface JournalPreset {
  id: string;
  label: string;
  /** Figure width in mm. Journals differ by a few mm; these are typical. */
  widthMm: number;
  note: string;
}

export const JOURNAL_PRESETS: JournalPreset[] = [
  { id: "single", label: "Single column", widthMm: 85, note: "85–90 mm" },
  { id: "onehalf", label: "1.5 column", widthMm: 114, note: "110–140 mm" },
  { id: "double", label: "Double column", widthMm: 174, note: "170–180 mm" },
];

const round2 = (v: number) => Math.round(v * 100) / 100;

export function mmToPx(mm: number): number { return mm / MM_PER_IN * CSS_DPI; }
export function pxToMm(px: number): number { return px / CSS_DPI * MM_PER_IN; }

/** A CSS-px length shown in the chosen unit (rounded for display). */
export function toUnit(px: number, unit: ExportPrefs["unit"]): number {
  if (unit === "mm") return Math.round(pxToMm(px) * 10) / 10;
  if (unit === "in") return Math.round(px / CSS_DPI * 100) / 100;
  return Math.round(px);
}

export function fromUnit(v: number, unit: ExportPrefs["unit"]): number {
  if (unit === "mm") return mmToPx(v);
  if (unit === "in") return v * CSS_DPI;
  return v;
}

/** Apply a journal preset: the width is fixed, the height keeps the
 *  current aspect ratio, and the resolution is the one asked for. */
export function applyPreset(s: ExportPrefs, preset: JournalPreset, dpi: number): ExportPrefs {
  const width = round2(mmToPx(preset.widthMm));
  const height = round2(width * (s.height / Math.max(s.width, 1)));
  return { ...s, width, height, dpi, unit: "mm" };
}

/** Pixel dimensions of a raster export (floored, as Plotly floors). */
export function rasterSize(widthPx: number, heightPx: number, dpi: number):
  { w: number; h: number } {
  return { w: Math.floor(widthPx * dpi / CSS_DPI), h: Math.floor(heightPx * dpi / CSS_DPI) };
}

export function tooLarge(w: number, h: number): boolean {
  return w * h > MAX_PIXELS || w > MAX_SIDE || h > MAX_SIDE;
}

/** Physical size of a CSS-px box, for hints: "90 × 68 mm". */
export function physicalLabel(widthPx: number, heightPx: number): string {
  const f = (v: number) => (Math.round(pxToMm(v) * 10) / 10).toString();
  return `${f(widthPx)} × ${f(heightPx)} mm`;
}

/**
 * The smallest font in a figure, in points at the exported size. `fontsPx`
 * are the laid-out font sizes (CSS px); `scale` is exported size over
 * laid-out size (1 when the figure is exported at the size it is drawn).
 */
export function smallestFontPt(fontsPx: number[], scale = 1): number | null {
  const sizes = fontsPx.filter((v) => Number.isFinite(v) && v > 0);
  if (!sizes.length) return null;
  return Math.round(Math.min(...sizes) * scale * 72 / CSS_DPI * 10) / 10;
}

export function belowFontFloor(pt: number | null): boolean {
  return pt !== null && pt < FONT_FLOOR_PT;
}

/** A file name from a sheet name: letters and digits kept (any script),
 *  everything else collapsed to single hyphens. */
export function fileStem(name: string, fallback = "opendose-graph"): string {
  const s = name.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return s || fallback;
}

/** Make stems unique within one archive: "a", "a-2", "a-3". */
export function uniqueStems(stems: string[]): string[] {
  const used = new Set<string>();
  return stems.map((s) => {
    let n = s;
    for (let i = 2; used.has(n); i++) n = `${s}-${i}`;
    used.add(n);
    return n;
  });
}

const FORMAT_IDS = FORMATS.map((f) => f.id);
const num = (v: unknown, lo: number, hi: number, d: number) =>
  (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d);

export function sanitizeExport(raw: unknown): ExportPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_EXPORT;
  return {
    format: FORMAT_IDS.includes(r.format as ExportFormat) ? r.format as ExportFormat : d.format,
    width: round2(num(r.width, 100, 20000, d.width)),
    height: round2(num(r.height, 100, 20000, d.height)),
    dpi: Math.round(num(r.dpi, 36, 2400, d.dpi)),
    unit: r.unit === "mm" || r.unit === "in" || r.unit === "px" ? r.unit : d.unit,
    transparent: r.transparent === true,
    paper: r.paper !== false,
    scaleText: r.scaleText === true,
  };
}
