import { useLayoutEffect, useRef, type RefObject } from "react";

const KEY = "opendose-split";
const MIN = 24;
const MAX = 65;
const DEFAULT = 41.7;

function savedSplit(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? "");
    return Number.isFinite(v) ? Math.min(MAX, Math.max(MIN, v)) : DEFAULT;
  } catch { return DEFAULT; }
}

/** Writes a split (in %) to the grid and to the separator's value. */
function writeSplit(main: HTMLElement | null, sep: HTMLElement | null, pct: number) {
  main?.style.setProperty("--split", `${pct.toFixed(2)}%`);
  sep?.setAttribute("aria-valuenow", String(Math.round(pct)));
  sep?.setAttribute("aria-valuetext", `left column ${Math.round(pct)}% of the width`);
}

// The seam between the two workbench columns (DECISIONS 2): a 1px line
// with a ±4px hit area. The drag tracks the pointer 1:1 by writing the
// --split variable from a ref once per frame (no React render per
// move), and is saved on release; arrow keys nudge it.
export default function ColumnSplitter({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  const self = useRef<HTMLDivElement>(null);
  const now = useRef(DEFAULT);
  const drag = useRef<{ frame: number; x: number } | null>(null);

  const apply = (pct: number) => {
    now.current = Math.min(MAX, Math.max(MIN, pct));
    writeSplit(mainRef.current, self.current, now.current);
  };
  const persist = () => {
    try { localStorage.setItem(KEY, `${now.current.toFixed(2)}%`); } catch { /* ignore */ }
  };
  // The saved width is on the grid before the first paint.
  useLayoutEffect(() => {
    now.current = savedSplit();
    writeSplit(mainRef.current, self.current, now.current);
  }, [mainRef]);

  const splitPct = (clientX: number) => {
    const r = mainRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 100;
  };
  const end = (commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.frame);
    drag.current = null;
    document.body.style.userSelect = "";
    self.current?.removeAttribute("data-dragging");
    if (commit) { apply(splitPct(d.x)); persist(); }
  };

  return (
    <div ref={self} className="splitter" role="separator" aria-orientation="vertical"
      aria-label="Resize columns" tabIndex={0}
      aria-valuemin={MIN} aria-valuemax={MAX}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // preventDefault on pointerdown does not reliably stop native
        // text selection while the pointer sweeps over content
        document.body.style.userSelect = "none";
        e.currentTarget.setAttribute("data-dragging", "");
        drag.current = { frame: 0, x: e.clientX };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.x = e.clientX;
        cancelAnimationFrame(d.frame);
        d.frame = requestAnimationFrame(() => apply(splitPct(d.x)));
      }}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      onLostPointerCapture={() => end(true)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        apply(now.current + (e.key === "ArrowRight" ? 2 : -2));
        persist();
      }} />
  );
}
