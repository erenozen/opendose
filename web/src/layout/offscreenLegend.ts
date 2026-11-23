// The master legend of a page layout drawn off screen (OffscreenLayout.tsx)
// for an export (PowerPoint, the export bundle), read from its drawn plots
// once every placed graph has drawn.
import { waitForPlot } from "../export/figure";
import {
  masterLegend, readingOrder, seriesFromTraces, type LegendEntry, type ResolvedLayout, type TraceLike,
} from "../project/layout";
import type { LayoutItem } from "../project/types";

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export type PlacedGraph = Extract<LayoutItem, { kind: "graph" }>;

/** The graphs placed on the page, in reading order. */
export function placedGraphs(layout: ResolvedLayout): PlacedGraph[] {
  return readingOrder(layout.items.filter(
    (i): i is PlacedGraph => i.kind === "graph" && !!i.graphId));
}

/** Waits for every placed graph to draw (up to 30 s each) and returns the
 *  page's master legend; null once `live()` turns false. */
export async function drawnLayoutLegend(host: HTMLElement, layout: ResolvedLayout,
  live: () => boolean): Promise<LegendEntry[] | null> {
  const placed = placedGraphs(layout);
  for (const it of placed) {
    const el = host.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(it.id)}"]`);
    if (el) await waitForPlot(el, 30000);
    if (!live()) return null;
  }
  await frames();
  return masterLegend(placed.map((it) => {
    const gd = host.querySelector(`[data-item-id="${CSS.escape(it.id)}"] .plot`) as
      (HTMLElement & { data?: TraceLike[] }) | null;
    return gd?.data ? seriesFromTraces(gd.data) : [];
  }));
}
