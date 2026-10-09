import { useEffect, useRef, useState } from "react";

// Draggable horizontal gutter between stacked islands: dragging resizes
// the island above it (content below reflows). The sibling above may be
// a .pane wrapper (workbench columns) or the island itself.
export default function HSplitter() {
  const drag = useRef<{ el: HTMLElement; h0: number; y0: number } | null>(
    null);
  const self = useRef<HTMLDivElement>(null);
  // the height of the section above, in px (aria-valuenow)
  const [now, setNow] = useState(0);

  const islandAbove = (splitter: HTMLElement): HTMLElement | null => {
    const prev = splitter.previousElementSibling as HTMLElement | null;
    if (!prev) return null;
    if (!prev.classList.contains("pane")) return prev;
    // Single island: size the card itself (plot cards must shrink/grow).
    // Multi-card panes (per-dataset results) scroll as one section.
    if (prev.childElementCount === 1) {
      return prev.firstElementChild as HTMLElement | null;
    }
    prev.style.overflow = "auto";
    return prev;
  };

  useEffect(() => {
    // measured without islandAbove (which makes a multi-card pane scroll)
    const el = self.current?.previousElementSibling;
    if (el) setNow(Math.round(el.getBoundingClientRect().height));
  }, []);
  const shown = Math.max(40, now);

  return (
    <div className="h-splitter" role="separator" ref={self}
      aria-orientation="horizontal" aria-label="Resize section" tabIndex={0}
      aria-valuemin={40} aria-valuemax={Math.max(shown, 4000)} aria-valuenow={shown}
      aria-valuetext={`section above ${shown} px high`}
      onPointerDown={(e) => {
        const el = islandAbove(e.currentTarget);
        if (!el) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // preventDefault on pointerdown does not reliably stop native
        // text selection while the pointer sweeps over content
        document.body.style.userSelect = "none";
        drag.current = {
          el, h0: el.getBoundingClientRect().height, y0: e.clientY,
        };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const { el, h0, y0 } = drag.current;
        const h = Math.max(40, h0 + e.clientY - y0);
        el.style.height = `${h}px`;
        setNow(Math.round(h));
      }}
      onPointerUp={() => {
        drag.current = null;
        document.body.style.userSelect = "";
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        const el = islandAbove(e.currentTarget);
        if (!el) return;
        e.preventDefault();
        const h = el.getBoundingClientRect().height;
        const next = Math.max(40, h + (e.key === "ArrowDown" ? 24 : -24));
        el.style.height = `${next}px`;
        setNow(Math.round(next));
      }} />
  );
}
