// Colour gradient across data sets: n colours evenly spaced from a start
// to an end colour, mixed channel by channel in sRGB (the usual straight
// blend of spreadsheet and graphing programs). Pure.
const hex = (s: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export const GRADIENT_START = "#c6dbef";
export const GRADIENT_END = "#08519c";

/** n colours from `start` to `end` (both included); one colour: `start`. */
export function gradientColors(start: string, end: string, n: number): string[] {
  const a = hex(start), b = hex(end);
  if (!a || !b || n < 1) return [];
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return toHex(a.map((v, k) => v + (b[k] - v) * t));
  });
}
