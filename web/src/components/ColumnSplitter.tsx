import { useEffect, useRef, useState, type RefObject } from "react";

// Draggable divider between the two workbench columns: 1:1 pointer
// tracking on a CSS variable, clamped, persisted on release. Arrow keys
// nudge it.
export default function ColumnSplitter({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  const dragging = useRef(false);
  // the left column's width in % (aria-valuenow of the separator)
  const [now, setNow] = useState(41.7);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("opendose-split");
      if (saved) {
        mainRef.current?.style.setProperty("--split", saved);
        if (Number.isFinite(parseFloat(saved))) setNow(parseFloat(saved));
      }
    } catch { /* ignore */ }
  }, [mainRef]);
  const setSplit = (pct: number, persist = false) => {
    const clamped = Math.min(65, Math.max(24, pct));
    const v = `${clamped.toFixed(2)}%`;
    mainRef.current?.style.setProperty("--split", v);
    setNow(clamped);
    if (persist) {
      try { localStorage.setItem("opendose-split", v); } catch { /* ignore */ }
    }
  };
  const splitPct = (clientX: number) => {
    const r = mainRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 100;
  };
  return (
    <div className="splitter" role="separator" aria-orientation="vertical"
      aria-label="Resize columns" tabIndex={0}
      aria-valuemin={24} aria-valuemax={65} aria-valuenow={Math.round(now)}
      aria-valuetext={`left column ${Math.round(now)}% of the width`}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (dragging.current) setSplit(splitPct(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        document.body.style.userSelect = "";
        setSplit(splitPct(e.clientX), true);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const cur = parseFloat(mainRef.current?.style
          .getPropertyValue("--split") || "41.7");
        setSplit(cur + (e.key === "ArrowRight" ? 2 : -2), true);
      }} />
  );
}
