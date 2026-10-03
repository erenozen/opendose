// The Plotly div shared by the multiple-variables graphs.
import { useEffect, useRef, type ReactNode } from "react";
import Plotly from "plotly.js-dist-min";

/** The Plotly div the export panel looks for. Redraws on data, layout and
 *  container size changes. */
export function PlotlyChart({ data, layout, filename, label }: {
  data: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
  filename: string;
  label: string;
}) {
  const el = useRef<HTMLDivElement>(null);

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
    if (!el.current) return;
    Plotly.react(el.current, data, layout, {
      responsive: true, scrollZoom: true, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename },
    });
  }, [data, layout, filename]);

  useEffect(() => {
    const div = el.current;
    return () => { if (div) Plotly.purge(div); };
  }, []);

  return <div className="plot" ref={el} role="img" aria-label={label} />;
}

/** Shown instead of a graph when the result cannot be drawn. */
export function PlotMessage({ children }: { children: ReactNode }) {
  return <div className="plot mv-plot-message"><p className="empty-hint">{children}</p></div>;
}

