// Luciferase fold-change graph: each experiment's (or well's) fold change
// vs the control, the geometric mean with its CI, a log2 axis, and lines
// joining the groups of one experiment.
import { useMemo } from "react";
import { OptCheck } from "../../../components/GraphOptionControls";
import { asRecord, useGraphOptions } from "../../common/graphOptions";
import type { GraphOptionsProps, PlotProps } from "../../types";
import FoldPlot, { type FoldCluster } from "../kit/FoldPlot";
import type { LucOptions, LucResult } from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

function sanitize(raw: unknown): { lines: boolean } {
  return { lines: asRecord(raw).lines !== false };
}

export function LucFoldPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<LucOptions, LucResult>) {
  const opts = sanitize(graph.settings.assayLuc);
  const byExp = result?.unit === "experiment";
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
            points: pts.filter((p) => p.group === g && p.fold_change > 0).map((p) => {
              const who = byExp ? p.experiment : `well ${p.well}`;
              return { y: p.fold_change, key: byExp ? p.experiment : undefined,
                label: `${who}, ${g}: ${Number(p.fold_change.toPrecision(4))}` };
            }),
            center: s?.geometric_mean ?? null,
            ci: byExp && g === result.control_group ? null : s?.ci ?? null,
          };
        }),
      }],
    };
  }, [result, byExp]);
  return (
    <FoldPlot groups={data.groups} clusters={data.clusters} pairedLines={byExp && opts.lines} yTitle={titles.y}
      scheme={scheme} format={format} onFormatChange={onFormatChange} filename="luciferase"
      label="Relative luciferase activity" empty={result?.error ?? "Enter Firefly and Renilla readings to draw fold changes"} />
  );
}

export function LucFoldOptions({ graph, result }: GraphOptionsProps<LucOptions, LucResult>) {
  const [opts, setOpts] = useGraphOptions(graph, "assayLuc", sanitize);
  if (result?.unit !== "experiment") return null;
  return <OptCheck label="Join each experiment's groups (paired lines)" checked={opts.lines}
    onChange={(lines) => setOpts({ lines })} />;
}
