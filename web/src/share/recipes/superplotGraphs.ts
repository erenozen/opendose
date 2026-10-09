// A table made with its replicate map: its family's column and grouped
// graphs open as SuperPlots (values coloured by experiment, experiment
// means drawn), the way "Assign replicates…" leaves them. Pure.
import { updateSheet } from "../../project/ops.ts";
import type { Project, Sheet } from "../../project/types.ts";
import { normalizeSuperPlot } from "../../sheets/common/superplot.ts";

const SUPERPLOT_GRAPHS = ["scatter", "bar", "box", "violin", "grouped_interleaved",
  "grouped_separated", "grouped_scatter"];

export function superplotFamily(p: Project, dataId: string): Project {
  let q = p;
  for (const g of p.sheets) {
    if (g.kind !== "graph" || g.parentId !== dataId || !SUPERPLOT_GRAPHS.includes(g.graphType)) continue;
    const key = g.graphType.startsWith("grouped_") ? "grouped" : "column";
    q = updateSheet<Sheet>(q, g.id, (s) => {
      if (s.kind !== "graph") return s;
      const own = (s.settings[key] ?? {}) as Record<string, unknown>;
      return { ...s, settings: { ...s.settings,
        [key]: { ...own, superplot: { ...normalizeSuperPlot(own.superplot), on: true } } } };
    });
  }
  return q;
}
