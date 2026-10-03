// The data colours a drawn Plotly graph uses, for the colour-vision check
// (FigurePanel): one entry per distinct colour, labelled by the trace that
// uses it first, with whether any fill is see-through.
import type { SeriesColor } from "./cvd";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Drawn {
  series: (SeriesColor & { label: string; symbol?: string })[];
  background: string;
  transparent: boolean;
  symbols: boolean;
}

/** Parse a Plotly colour ("#rrggbb", "#rrggbbaa", "rgb()", "rgba()"). */
function parseColor(c: unknown): { hex: string; alpha: number } | null {
  if (typeof c !== "string") return null;
  const s = c.trim();
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) return { hex: `#${m[1].toLowerCase()}`, alpha: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) {
    const h = (v: string) => Math.min(255, Number(v)).toString(16).padStart(2, "0");
    return { hex: `#${h(m[1])}${h(m[2])}${h(m[3])}`, alpha: m[4] !== undefined ? Number(m[4]) : 1 };
  }
  return null;
}

const ROLES_SKIPPED = new Set(["decor", "band"]);

export function drawnColors(gd: any): Drawn | null {
  const data: any[] = gd?.data;
  if (!Array.isArray(data)) return null;
  const bg = parseColor(gd.layout?.plot_bgcolor)?.hex ?? "#ffffff";
  const ink = new Set(["#000000", "#1d1d1f", "#f5f5f7", "#424245", "#aeaeb5", "#6e6e73",
    "#98989f", bg]);
  const seen = new Map<string, SeriesColor & { label: string; symbol?: string }>();
  let transparent = false;
  const symbols = new Set<string>();
  for (const t of data) {
    const role = t?.meta?.odTag?.role;
    if (ROLES_SKIPPED.has(role) || t.visible === false) continue;
    if (t.type === "heatmap") continue;
    const fill = t.type === "pie" ? t.marker?.colors : t.marker?.color ?? t.line?.color;
    const edge = t.marker?.line?.color ?? t.line?.color;
    const list = Array.isArray(fill) ? fill : [fill];
    for (const raw of list) {
      let c = parseColor(raw);
      // A see-through fill with an opaque border in its own colour: the
      // border carries the identity, the fill the transparency.
      if (c && c.alpha < 1) {
        transparent = true;
        const e = parseColor(Array.isArray(edge) ? edge[0] : edge);
        if (e && e.alpha === 1 && !ink.has(e.hex)) c = e;
      }
      if (!c || ink.has(c.hex)) continue;
      const key = `${c.hex}/${c.alpha.toFixed(2)}`;
      if (!seen.has(key)) {
        seen.set(key, { color: c.hex, alpha: c.alpha,
          label: String(t.name || `Series ${seen.size + 1}`), symbol: t.marker?.symbol });
      }
    }
    if (typeof t.marker?.symbol === "string") symbols.add(t.marker.symbol);
  }
  return { series: [...seen.values()], background: bg, transparent, symbols: symbols.size > 1 };
}

