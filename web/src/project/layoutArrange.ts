// Arranging layout items: stacking order (items draw in list order, the
// last on top), aligning edges or centres, and distributing with equal
// gaps (the outer two stay put, as in presentation and drawing programs).
// With one item, alignment is to the page margins. Pure.
import type { LayoutItem, LayoutRect } from "./types.ts";

export type ZOp = "front" | "forward" | "backward" | "back";
export type AlignEdge = "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom";

/** The items in a new stacking order; selected items keep their order
 *  among themselves. */
export function reorderItems(items: LayoutItem[], ids: string[], op: ZOp): LayoutItem[] {
  const sel = new Set(ids);
  if (!items.some((i) => sel.has(i.id))) return items;
  if (op === "front") return [...items.filter((i) => !sel.has(i.id)), ...items.filter((i) => sel.has(i.id))];
  if (op === "back") return [...items.filter((i) => sel.has(i.id)), ...items.filter((i) => !sel.has(i.id))];
  const out = [...items];
  if (op === "forward") {
    for (let k = out.length - 2; k >= 0; k--) {
      if (sel.has(out[k].id) && !sel.has(out[k + 1].id)) [out[k], out[k + 1]] = [out[k + 1], out[k]];
    }
  } else {
    for (let k = 1; k < out.length; k++) {
      if (sel.has(out[k].id) && !sel.has(out[k - 1].id)) [out[k], out[k - 1]] = [out[k - 1], out[k]];
    }
  }
  return out;
}

const bounds = (rs: LayoutRect[]): LayoutRect => {
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** Align the selected items to the edges / centre of the selection (2+
 *  items) or of `page` (the page's content area; one item). */
export function alignItems(items: LayoutItem[], ids: string[], edge: AlignEdge, page: LayoutRect): LayoutItem[] {
  const sel = items.filter((i) => ids.includes(i.id));
  if (!sel.length) return items;
  const b = sel.length > 1 ? bounds(sel) : page;
  return items.map((it) => {
    if (!ids.includes(it.id)) return it;
    switch (edge) {
      case "left": return { ...it, x: b.x };
      case "right": return { ...it, x: b.x + b.w - it.w };
      case "hcenter": return { ...it, x: b.x + (b.w - it.w) / 2 };
      case "top": return { ...it, y: b.y };
      case "bottom": return { ...it, y: b.y + b.h - it.h };
      default: return { ...it, y: b.y + (b.h - it.h) / 2 };
    }
  });
}

/** Equal gaps between 3+ selected items across ("h") or down ("v"); the
 *  first and last (by position) stay where they are. */
export function distributeItems(items: LayoutItem[], ids: string[], axis: "h" | "v"): LayoutItem[] {
  const sel = items.filter((i) => ids.includes(i.id));
  if (sel.length < 3) return items;
  const pos = (r: LayoutRect) => (axis === "h" ? r.x : r.y);
  const size = (r: LayoutRect) => (axis === "h" ? r.w : r.h);
  const sorted = [...sel].sort((a, b) => pos(a) - pos(b) || a.id.localeCompare(b.id));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - sorted.reduce((a, r) => a + size(r), 0)) / (sorted.length - 1);
  const at = new Map<string, number>();
  let p = pos(first);
  for (const r of sorted) { at.set(r.id, p); p += size(r) + gap; }
  return items.map((it) => (at.has(it.id) ? { ...it, [axis === "h" ? "x" : "y"]: at.get(it.id)! } : it));
}
