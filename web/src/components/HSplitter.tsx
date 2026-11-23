import { useLayoutEffect, useRef } from "react";

const MIN = 40;

/** Writes the separator's value: the height of the section above, in px. */
function writeValue(sep: HTMLElement | null, h: number) {
  const shown = Math.max(MIN, Math.round(h));
  sep?.setAttribute("aria-valuenow", String(shown));
  sep?.setAttribute("aria-valuemax", String(Math.max(shown, 4000)));
  sep?.setAttribute("aria-valuetext", `section above ${shown} px high`);
}

// The seam between two stacked panes (DECISIONS 2): a 1px line with a
// ±4px hit area. Dragging resizes the pane above it 1:1 with the pointer,
// written to its style once per frame (no React render per move);
// content below reflows. The sibling above may be a .pane wrapper
// (workbench columns) or the block itself. Arrow keys nudge it.
export default function HSplitter() {
  const self = useRef<HTMLDivElement>(null);
  const drag = useRef<{ el: HTMLElement; h0: number; y0: number; y: number; frame: number } | null>(null);

  const islandAbove = (splitter: HTMLElement): HTMLElement | null => {
    const prev = splitter.previousElementSibling as HTMLElement | null;
    if (!prev) return null;
    if (!prev.classList.contains("pane")) return prev;
    // Single block: size the block itself (plot cards must shrink/grow).
    // Multi-block panes (per-dataset results) scroll as one section.
    if (prev.childElementCount === 1) {
      return prev.firstElementChild as HTMLElement | null;
    }
    prev.style.overflow = "auto";
    return prev;
  };
  const resize = (el: HTMLElement, h: number) => {
    const next = Math.max(MIN, h);
    el.style.height = `${next}px`;
    writeValue(self.current, next);
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.frame);
    resize(d.el, d.h0 + d.y - d.y0);
    drag.current = null;
    document.body.style.userSelect = "";
    self.current?.removeAttribute("data-dragging");
  };

  // Measured without islandAbove (which makes a multi-block pane scroll).
  useLayoutEffect(() => {
    const el = self.current?.previousElementSibling;
    if (el) writeValue(self.current, el.getBoundingClientRect().height);
  }, []);

  return (
    <div className="h-splitter" role="separator" ref={self}
      aria-orientation="horizontal" aria-label="Resize section" tabIndex={0}
      aria-valuemin={MIN}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const el = islandAbove(e.currentTarget);
        if (!el) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // preventDefault on pointerdown does not reliably stop native
        // text selection while the pointer sweeps over content
        document.body.style.userSelect = "none";
        e.currentTarget.setAttribute("data-dragging", "");
        drag.current = { el, h0: el.getBoundingClientRect().height, y0: e.clientY, y: e.clientY, frame: 0 };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.y = e.clientY;
        cancelAnimationFrame(d.frame);
        d.frame = requestAnimationFrame(() => resize(d.el, d.h0 + d.y - d.y0));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        const el = islandAbove(e.currentTarget);
        if (!el) return;
        e.preventDefault();
        resize(el, el.getBoundingClientRect().height + (e.key === "ArrowDown" ? 24 : -24));
      }} />
  );
}
