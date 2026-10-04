// The size and axis ranges of a drawn Plotly plot area, for layouts that
// need pixels (beeswarm and symmetric point spreading). `measure(div)` is
// called after each draw; the state only changes when the area changes by
// more than a pixel or two, so a redraw triggered by it settles at once.
import { useCallback, useState } from "react";
import type { SpreadScale } from "./swarm";

export interface PlotArea {
  /** Plot area in px (inside the margins). */
  w: number;
  h: number;
  /** Axis ranges shown (axis units). */
  xr: [number, number];
  yr: [number, number];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function readPlotArea(div: HTMLElement | null): PlotArea | null {
  const fl = (div as any)?._fullLayout;
  const size = fl?._size;
  const xr = fl?.xaxis?.range, yr = fl?.yaxis?.range;
  if (!size || !Array.isArray(xr) || !Array.isArray(yr)) return null;
  if (fl.yaxis?.type === "log" || fl.yaxis?.type === "date") return null;
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const out: PlotArea = { w: size.w, h: size.h, xr: [n(xr[0]), n(xr[1])], yr: [n(yr[0]), n(yr[1])] };
  return [out.w, out.h, ...out.xr, ...out.yr].every(Number.isFinite) ? out : null;
}

const close = (a: PlotArea, b: PlotArea) =>
  Math.abs(a.w - b.w) < 2 && Math.abs(a.h - b.h) < 2
  && Math.abs(a.yr[1] - a.yr[0] - (b.yr[1] - b.yr[0])) <= Math.abs(a.yr[1] - a.yr[0]) * 0.02
  && Math.abs(a.xr[1] - a.xr[0] - (b.xr[1] - b.xr[0])) < 1e-6;

export function usePlotArea(): [PlotArea | null, (div: HTMLElement | null) => void] {
  const [area, setArea] = useState<PlotArea | null>(null);
  const measure = useCallback((div: HTMLElement | null) => {
    const a = readPlotArea(div);
    if (!a) return;
    setArea((prev) => (prev && close(prev, a) ? prev : a));
  }, []);
  return [area, measure];
}

/** Pixel scale for spreading points on a drawn plot (null until drawn). */
export function areaScale(area: PlotArea | null, markerPx: number, maxHalf?: number):
  SpreadScale | null {
  if (!area) return null;
  const ys = Math.abs(area.yr[1] - area.yr[0]);
  const xs = Math.abs(area.xr[1] - area.xr[0]);
  if (!(ys > 0) || !(xs > 0)) return null;
  return { pxPerY: area.h / ys, pxPerX: area.w / xs, marker: markerPx, maxHalf };
}

/** A first estimate before the plot is drawn: the container's size (or a
 *  typical card's) less the margins, the data range padded as Plotly pads
 *  it. The drawn area replaces it after the first draw. */
export function estimateArea(div: HTMLElement | null, yMin: number, yMax: number,
  xr: [number, number], margin = { l: 60, r: 16, t: 12, b: 48 }): PlotArea | null {
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return null;
  // Without a container yet: a typical card's plot area.
  const w = (div?.clientWidth || 560) - margin.l - margin.r;
  const h = (div?.clientHeight || 400) - margin.t - margin.b;
  if (!(w > 0) || !(h > 0)) return null;
  const pad = (yMax - yMin || Math.abs(yMax) || 1) * 0.07;
  return { w, h, xr, yr: [yMin - pad, yMax + pad] };
}
