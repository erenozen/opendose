// A Plotly graph drawn through the format layer, for plot panels that
// build their traces and layout declaratively (useMemo) instead of
// driving Plotly from their own effect: it follows the container's size,
// applies the graph's format (applyFormat), enables annotation dragging
// (usePlotEdits) and purges Plotly on unmount.
import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import { applyFormat, type FormatContext } from "./apply";
import { plotConfig } from "./edits";
import { EMPTY_FORMAT, type GraphFormat } from "./format";
import { usePlotEdits } from "./usePlotEdits";

export interface FormattedPlotProps {
  traces: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
  /** The graph sheet's format (PlotProps.format). */
  format?: GraphFormat;
  /** Saves annotation drags (PlotProps.onFormatChange); absent = frozen. */
  onFormatChange?: (f: GraphFormat) => void;
  /** Everything applyFormat needs but the edit revision. Memoize it. */
  ctx: Omit<FormatContext, "editRevision">;
  /** Base name of Plotly's own "download plot" button. */
  filename: string;
  /** Accessible name of the graph. */
  label?: string;
  /** Wheel zoom (off for pie charts and heat maps). */
  scrollZoom?: boolean;
}

export default function FormattedPlot({
  traces, layout, format = EMPTY_FORMAT, onFormatChange, ctx, filename, label,
  scrollZoom = true,
}: FormattedPlotProps) {
  const el = useRef<HTMLDivElement>(null);
  const { rev, attach } = usePlotEdits(format, onFormatChange);

  // Redraw when the card or column is resized (splitter drag, the card's
  // resize handle); Plotly's own listener only covers the window.
  useEffect(() => {
    const div = el.current;
    if (!div) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if ((div as unknown as { _fullLayout?: unknown })._fullLayout) {
          Plotly.Plots.resize(div);
        }
      });
    });
    ro.observe(div);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    const div = el.current;
    return () => { if (div) Plotly.purge(div); };
  }, []);

  useEffect(() => {
    const div = el.current;
    if (!div) return;
    const out = applyFormat(traces as never, layout, format, { ...ctx, editRevision: rev });
    void Plotly.react(div, out.traces as Plotly.Data[], out.layout, plotConfig({
      responsive: true, scrollZoom, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename },
    }, format, !!onFormatChange)).then(() => attach(div));
  }, [traces, layout, format, ctx, rev, filename, scrollZoom, onFormatChange, attach]);

  return <div className="plot" ref={el} role={label ? "img" : undefined} aria-label={label} />;
}
