/*
 * Where an anchored layer goes: the preferred side of its anchor, flipped
 * to the opposite side when it does not fit there and the opposite side
 * has more room, then clamped inside the bounds (the viewport, narrowed
 * by any clipping boundary and padding). The transform origin is the point
 * of the layer nearest its anchor, so it scales out of its trigger even
 * after a flip or a clamp (emil-animations: origin-aware).
 */

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

export interface Box { left: number; top: number; right: number; bottom: number }
export type Padding = number | Partial<Record<Side, number>>;

export interface PlaceInput {
  anchor: Box;
  /** The layer's natural size. */
  size: { width: number; height: number };
  side: Side;
  align: Align;
  /** Gap between anchor and layer. */
  offset: number;
  bounds: Box;
}

export interface Placement {
  x: number;
  y: number;
  side: Side;
  /** Set when the layer is taller (or wider) than the room on its side. */
  maxHeight?: number;
  maxWidth?: number;
  /** transform-origin, in px from the layer's top-left corner. */
  originX: number;
  originY: number;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/** `bounds` narrowed by padding on each side. */
export function inset(bounds: Box, pad: Padding = 0): Box {
  const p = typeof pad === "number" ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
  return {
    left: bounds.left + (p.left ?? 0), top: bounds.top + (p.top ?? 0),
    right: bounds.right - (p.right ?? 0), bottom: bounds.bottom - (p.bottom ?? 0),
  };
}

/** The overlap of two boxes (the viewport and a clipping ancestor). */
export function intersect(a: Box, b: Box): Box {
  return {
    left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom),
  };
}

export function place({ anchor, size, side, align, offset, bounds }: PlaceInput): Placement {
  const vertical = side === "top" || side === "bottom";
  // Work on the main axis (away from the anchor) and the cross axis.
  const room = (s: Side) => ({
    top: anchor.top - bounds.top, bottom: bounds.bottom - anchor.bottom,
    left: anchor.left - bounds.left, right: bounds.right - anchor.right,
  }[s] - offset);
  const length = vertical ? size.height : size.width;
  let chosen = side;
  if (length > room(side) && room(OPPOSITE[side]) > room(side)) chosen = OPPOSITE[side];
  const space = Math.max(0, room(chosen));
  const main = Math.min(length, space);

  const cross = vertical ? size.width : size.height;
  const [aStart, aEnd] = vertical ? [anchor.left, anchor.right] : [anchor.top, anchor.bottom];
  const [bStart, bEnd] = vertical ? [bounds.left, bounds.right] : [bounds.top, bounds.bottom];
  const wanted = align === "start" ? aStart
    : align === "end" ? aEnd - cross
      : (aStart + aEnd) / 2 - cross / 2;
  const c = clamp(wanted, bStart, bEnd - cross);
  const fit = Math.min(cross, bEnd - bStart);

  const m = chosen === "bottom" ? anchor.bottom + offset
    : chosen === "right" ? anchor.right + offset
      : chosen === "top" ? anchor.top - offset - main
        : anchor.left - offset - main;

  // Origin: on the edge facing the anchor, across from the anchor's middle.
  const crossOrigin = clamp((aStart + aEnd) / 2 - c, 0, fit);
  const mainOrigin = chosen === "bottom" || chosen === "right" ? 0 : main;

  const out: Placement = vertical
    ? { x: c, y: m, side: chosen, originX: crossOrigin, originY: mainOrigin }
    : { x: m, y: c, side: chosen, originX: mainOrigin, originY: crossOrigin };
  if (main < length) out[vertical ? "maxHeight" : "maxWidth"] = Math.floor(main);
  if (fit < cross) out[vertical ? "maxWidth" : "maxHeight"] = Math.floor(fit);
  return out;
}
