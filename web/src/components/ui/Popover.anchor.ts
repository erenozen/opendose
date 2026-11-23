import { useLayoutEffect, useRef, type RefObject } from "react";
import { inset, intersect, place, type Align, type Box, type Padding, type Side } from "./Popover.place.ts";

export interface AnchorOptions {
  side?: Side;
  align?: Align;
  /** Gap between the anchor and the layer, px. */
  sideOffset?: number;
  /** Room to keep clear at the viewport edges (8px by default), e.g. a
   *  sticky header's height at the top. A function is read on each placement. */
  collisionPadding?: Padding | (() => Padding);
  /** A clipping ancestor the layer must also stay inside. */
  collisionBoundary?: Element | null;
}

const EDGE = 8;

type Insets = { top: number; right: number; bottom: number; left: number };
let safe: { key: string; insets: Insets } | null = null;
/** The safe-area insets (notch, home indicator) from the --safe-* tokens,
 *  read from a hidden probe once per viewport size (they change with the
 *  orientation); all 0 where the device has none. */
function safeAreas(): Insets {
  const key = `${window.innerWidth}x${window.innerHeight}`;
  if (safe?.key === key) return safe.insets;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;"
    + "padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)";
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => Number.parseFloat(v) || 0;
  const insets = { top: px(cs.paddingTop), right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  safe = { key, insets };
  return insets;
}

/**
 * Places a top-layer element next to its anchor (an element's box or a
 * point) and keeps it there on scroll, resize and content changes. Writes
 * left/top (and max-height/max-width when room is short) straight to the
 * element, plus `--ui-origin` and `data-side` for the CSS. A new
 * `anchorKey` (a moved point anchor) places it again.
 */
export function useAnchoredPosition(ref: RefObject<HTMLElement | null>, mounted: boolean,
  anchor: () => Box | null, opts: AnchorOptions, anchorKey?: string) {
  const latest = useRef({ anchor, opts });
  useLayoutEffect(() => { latest.current = { anchor, opts }; });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!mounted || !el) return;
    const update = () => {
      const a = latest.current.anchor();
      if (!a || !el.isConnected) return;
      const { side = "bottom", align = "start", sideOffset = 6, collisionPadding,
        collisionBoundary } = latest.current.opts;
      el.style.maxHeight = "";
      el.style.maxWidth = "";
      const pad = typeof collisionPadding === "function" ? collisionPadding() : collisionPadding;
      const sides = typeof pad === "number" ? { top: pad, right: pad, bottom: pad, left: pad } : pad ?? {};
      const viewport = { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: window.innerHeight };
      // Clear of the notch and the home indicator as well as the edge.
      const s = safeAreas();
      let bounds = inset(viewport, {
        top: Math.max(sides.top ?? EDGE, s.top + EDGE), right: Math.max(sides.right ?? EDGE, s.right + EDGE),
        bottom: Math.max(sides.bottom ?? EDGE, s.bottom + EDGE), left: Math.max(sides.left ?? EDGE, s.left + EDGE),
      });
      if (collisionBoundary) bounds = intersect(bounds, collisionBoundary.getBoundingClientRect());
      // Layout size, not the transformed box (the entrance starts at scale 0.97).
      const p = place({
        anchor: a, size: { width: el.offsetWidth, height: el.offsetHeight },
        side, align, offset: sideOffset, bounds,
      });
      el.style.left = `${Math.round(p.x)}px`;
      el.style.top = `${Math.round(p.y)}px`;
      if (p.maxHeight !== undefined) el.style.maxHeight = `${p.maxHeight}px`;
      if (p.maxWidth !== undefined) el.style.maxWidth = `${p.maxWidth}px`;
      el.style.setProperty("--ui-origin", `${Math.round(p.originX)}px ${Math.round(p.originY)}px`);
      el.dataset.side = p.side;
    };
    update();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [mounted, ref, anchorKey]);
}

/** The box of an element, as an anchor. */
export const boxOf = (el: Element | null | undefined): Box | null => {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/** A zero-size anchor at a point (a right click). */
export const pointBox = (p: { x: number; y: number }): Box =>
  ({ left: p.x, top: p.y, right: p.x, bottom: p.y });

/** collisionPadding that keeps a layer 8px clear of the app's sticky header. */
export const belowStickyHeader = () => ({
  top: Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0) + 8,
});
