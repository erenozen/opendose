// Densitometry fold-change graph: each blot's group fold change vs its own
// control (control = 1), lines joining the groups of one blot, the
// geometric mean with its CI and a log2 axis.
import { useMemo } from "react";
import { OptCheck } from "../../../components/GraphOptionControls";
import { asRecord, useGraphOptions } from "../../common/graphOptions";
import type { GraphOptionsProps, PlotProps } from "../../types";
import FoldPlot, { type FoldCluster } from "../kit/FoldPlot";
import type { DensOptions, DensResult } from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

function sanitize(raw: unknown): { lines: boolean } {
  return { lines: asRecord(raw).lines !== false };
}

export function DensFoldPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<DensOptions, DensResult>) {
  const opts = sanitize(graph.settings.assayDens);
  const data = useMemo(() => {
    if (!result || result.error) return { groups: [] as string[], clusters: [] as FoldCluster[] };
    const groups: string[] = result.groups ?? [];
    const pts: any[] = result.graph?.points ?? [];
    const sums: any[] = result.graph?.summary ?? [];
    return {
      groups,
      clusters: [{
        name: "",
        groups: groups.map((g) => {
          const s = sums.find((x) => x.group === g);
          return {
            group: g,
            points: pts.filter((p) => p.group === g && p.fold_change > 0)
              .map((p) => ({ y: p.fold_change, key: p.blot, label: `${p.blot}, ${g}: ${Number(p.fold_change.toPrecision(4))}` })),
            center: s?.geometric_mean ?? null,
            ci: g === result.control_group ? null : s?.ci ?? null,
          };
        }),
      }],
    };
  }, [result]);
  return (
    <FoldPlot groups={data.groups} clusters={data.clusters} pairedLines={opts.lines} yTitle={titles.y}
      scheme={scheme} format={format} onFormatChange={onFormatChange} filename="densitometry"
      label="Fold change by blot" empty={result?.error ?? "Enter lane intensities to draw fold changes"} />
  );
}

export function DensFoldOptions({ graph }: GraphOptionsProps<DensOptions, DensResult>) {
  const [opts, setOpts] = useGraphOptions(graph, "assayDens", sanitize);
  return <OptCheck label="Join each blot's groups (paired lines)" checked={opts.lines}
    onChange={(lines) => setOpts({ lines })} />;
}
