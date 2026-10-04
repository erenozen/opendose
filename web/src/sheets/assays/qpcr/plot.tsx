// qPCR fold-change graph: each biological sample's fold change vs the
// calibrator, the geometric mean with its asymmetric CI (back-transformed
// from ΔCq), a line at 1 and a log2 axis; one cluster per target.
import { useMemo } from "react";
import { OptSelect } from "../../../components/GraphOptionControls";
import { asRecord, useGraphOptions } from "../../common/graphOptions";
import type { GraphOptionsProps, PlotProps } from "../../types";
import FoldPlot, { type FoldCluster } from "../kit/FoldPlot";
import type { QpcrOptions, QpcrResult } from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

function sanitize(raw: unknown): { target: string } {
  const o = asRecord(raw);
  return { target: typeof o.target === "string" ? o.target : "" };
}

export function QpcrFoldPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<QpcrOptions, QpcrResult>) {
  const opts = sanitize(graph.settings.assayQpcr);
  const data = useMemo(() => {
    if (!result || result.error) return { groups: [] as string[], clusters: [] as FoldCluster[] };
    const groups: string[] = result.groups ?? [];
    const per = (result.per_target ?? []).filter((pt: any) => !opts.target || pt.target === opts.target);
    const clusters: FoldCluster[] = per.map((pt: any) => ({
      name: pt.target,
      groups: groups.filter((g) => pt.groups.some((x: any) => x.group === g)).map((g) => {
        const gr = pt.groups.find((x: any) => x.group === g);
        return {
          group: g,
          points: (pt.graph?.points ?? []).filter((p: any) => p.group === g && p.fold_change > 0)
            .map((p: any) => ({ y: p.fold_change, label: `${pt.target}, ${p.sample}: ${Number(p.fold_change.toPrecision(4))}` })),
          center: gr?.fold_change ?? null,
          ci: gr?.fold_change_ci ?? null,
        };
      }),
    }));
    return { groups, clusters };
  }, [result, opts.target]);
  return (
    <FoldPlot groups={data.groups} clusters={data.clusters} yTitle={titles.y} scheme={scheme}
      format={format} onFormatChange={onFormatChange} filename="qpcr-fold-change"
      label="Fold change graph" empty={result?.error ?? "Set up the qPCR analysis to draw fold changes"} />
  );
}

export function QpcrFoldOptions({ graph, result }: GraphOptionsProps<QpcrOptions, QpcrResult>) {
  const [opts, setOpts] = useGraphOptions(graph, "assayQpcr", sanitize);
  const targets: string[] = result?.targets ?? [];
  if (targets.length < 2) return null;
  return (
    <OptSelect label="Target" value={opts.target} none="All targets"
      options={targets.map((t) => [t, t] as const)} onChange={(target) => setOpts({ target })} />
  );
}
