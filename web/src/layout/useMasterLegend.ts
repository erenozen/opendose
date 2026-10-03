import { useEffect, useState, type RefObject } from "react";
import {
  masterLegend, readingOrder, seriesFromTraces, type LegendEntry, type TraceLike,
} from "../project/layout";
import type { LayoutItem } from "../project/types";

/**
 * The master legend's entries: the series of every graph placed on the
 * page (page reading order), read from the drawn plots so names, colours
 * and symbols are exactly what the graphs show, with repeats removed.
 * Plots redraw on their own schedule, so this re-reads them periodically
 * and only updates when something actually changed.
 */
export function useMasterLegend(pageRef: RefObject<HTMLElement | null>, items: LayoutItem[],
  enabled: boolean): LegendEntry[] {
  const [entries, setEntries] = useState<LegendEntry[]>([]);
  const order = readingOrder(items.filter((i) => i.kind === "graph" && i.graphId))
    .map((i) => i.id).join("|");

  useEffect(() => {
    if (!enabled) return;
    let last = "";
    const read = () => {
      const page = pageRef.current;
      if (!page) return;
      const lists = order.split("|").filter(Boolean).map((id) => {
        const gd = page.querySelector(`[data-item-id="${CSS.escape(id)}"] .plot`) as
          (HTMLElement & { data?: TraceLike[] }) | null;
        return gd?.data ? seriesFromTraces(gd.data) : [];
      });
      const next = masterLegend(lists);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setEntries(next);
      }
    };
    read();
    const t = setInterval(read, 700);
    return () => clearInterval(t);
  }, [pageRef, order, enabled]);

  return enabled ? entries : [];
}
