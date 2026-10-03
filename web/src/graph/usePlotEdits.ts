// React glue for dragging annotations on a Plotly graph. Call `attach(div)`
// after every Plotly.react; pass `rev` into FormatContext.editRevision.
import { useCallback, useEffect, useRef, useState } from "react";
import { relayoutToFormat } from "./edits";
import type { GraphFormat } from "./format";

type PlotDiv = HTMLElement & {
  on?: (ev: string, fn: (e: Record<string, unknown>) => void) => void;
  layout?: { annotations?: Record<string, unknown>[]; shapes?: Record<string, unknown>[] };
  __odEdits?: boolean;
};

export function usePlotEdits(format: GraphFormat,
  onChange: ((f: GraphFormat) => void) | undefined) {
  const [rev, setRev] = useState(0);
  const fmt = useRef(format);
  const cb = useRef(onChange);
  useEffect(() => { fmt.current = format; cb.current = onChange; }, [format, onChange]);

  const attach = useCallback((el: HTMLElement | null) => {
    const div = el as PlotDiv | null;
    if (!div || div.__odEdits || typeof div.on !== "function") return;
    div.__odEdits = true;
    div.on("plotly_relayout", (ev) => {
      if (!cb.current) return;
      const { format: next, foreign } = relayoutToFormat(fmt.current, ev,
        div.layout?.annotations, div.layout?.shapes);
      if (next) cb.current(next);
      // A generated label (bracket, letter, at-risk count) was dragged:
      // redraw with a new edit revision so it returns to its place.
      if (foreign) setRev((r) => r + 1);
    });
  }, []);

  return { rev, attach };
}
