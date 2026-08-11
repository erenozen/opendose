import { useRef } from "react";

// Draggable horizontal gutter between stacked islands: dragging resizes
// the island above it (content below reflows). The sibling above may be
// a .pane wrapper (App columns) or the island itself (ContingencyPanel).
export default function HSplitter() {
  const drag = useRef<{ el: HTMLElement; h0: number; y0: number } | null>(
    null);

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

  return (
    <div className="h-splitter" role="separator"
      aria-orientation="horizontal" aria-label="Resize section" tabIndex={0}
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
        el.style.height = `${Math.max(40, h0 + e.clientY - y0)}px`;
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
        el.style.height =
          `${Math.max(40, h + (e.key === "ArrowDown" ? 24 : -24))}px`;
      }} />
  );
}
