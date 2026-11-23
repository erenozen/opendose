// Text and line sizes in points (P-54). The graph format stores every size
// in CSS px, the unit Plotly lays a graph out in (96 to the inch), so a
// graph saved before draws exactly as it did. The Format graph and Format
// axes dialogs can show and take those sizes in points instead:
// 1 pt = 1/72 in = 96/72 px. An export laid out at its own size (Scale the
// graph as shown off, export/graph.ts geometry k = 1) prints a size of
// p pt at p pt: 7 pt text is 9.333 px in the SVG and Tf 7 in the PDF
// (export/pdf.ts maps 1 px to 0.75 pt). Which unit the dialogs show is a
// per-browser view choice, never part of the project. Pure, apart from
// the guarded storage helpers.

export type SizeUnit = "px" | "pt";

export const PX_PER_PT = 96 / 72;

/** A stored px size as the dialogs show it: px unchanged; pt to 4
 *  decimals (13 px is 9.75 pt, 9.333… px is 7 pt). */
export function shownSize(px: number | null | undefined, unit: SizeUnit): number | undefined {
  if (px == null || !Number.isFinite(px)) return undefined;
  return unit === "px" ? px : Number((px * 72 / 96).toFixed(4));
}

/** A size typed in the dialogs' unit, as stored (CSS px). */
export function storedSize(v: number | undefined, unit: SizeUnit): number | undefined {
  if (v === undefined || !Number.isFinite(v)) return undefined;
  // v × 96 / 72 rounds to the nearest double of the exact value (7 pt is
  // 28/3 px); v × (4/3) can miss it by one unit in the last place
  return unit === "px" ? v : v * 96 / 72;
}

const KEY = "opendose-size-unit";

export function readSizeUnit(): SizeUnit {
  try { return globalThis.localStorage?.getItem(KEY) === "pt" ? "pt" : "px"; } catch { return "px"; }
}

export function writeSizeUnit(u: SizeUnit): void {
  try { globalThis.localStorage?.setItem(KEY, u); } catch { /* private mode */ }
}
