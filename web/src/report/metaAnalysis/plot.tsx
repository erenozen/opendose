// The forest plot graph of "Combine experiments" (forest.ts builds it)
// and its settings.
import { useMemo } from "react";
import { OptCheck, OptSelect } from "../../components/GraphOptionControls";
import { PLOT_FONT, seriesStyle } from "../../lib/palette";
import { chromeOf, useDark, useGraphSettings } from "../../sheets/assays/plotkit";
import { PlotMessage, PlotlyChart } from "../../sheets/multivariable/plotkit";
import type { GraphOptionsProps, PlotProps } from "../../sheets/types";
import { FOREST_DEFAULTS, forestFigure, type ForestSettings, type PooledShown } from "./forest";
import { pctLevel, scaleIsRatio } from "./format";
import type { MetaOptions } from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEY = "forest";

export function ForestPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<MetaOptions, Record<string, any>>) {
  const dark = useDark();
  const [s] = useGraphSettings<ForestSettings>(graph, KEY, FOREST_DEFAULTS);
  const ok = !!result && !result.error && Array.isArray(result.studies);
  const fig = useMemo(() => {
    if (!ok) return null;
    const ratio = scaleIsRatio(result!.scale);
    const level = pctLevel(result!.ci_level);
    return forestFigure({
      result: result!, settings: s, chrome: chromeOf(dark), font: PLOT_FONT,
      accent: seriesStyle(0, dark, scheme).color,
      xTitle: titles.x || (ratio ? `Ratio (${level} CI, log scale)` : `Estimate (${level} CI)`),
    });
  }, [ok, result, s, dark, scheme, titles.x]);
  if (!result) return <PlotMessage>Combining the experiments…</PlotMessage>;
  if (!fig) return <PlotMessage>No forest plot: the analysis failed (see the results).</PlotMessage>;
  return (
    <PlotlyChart data={fig.traces} layout={fig.layout} filename="forest-plot"
      label={`Forest plot of ${result.k} experiments with the pooled estimates`}
      format={format} onFormatChange={onFormatChange} dark={dark} scheme={scheme} />
  );
}

const POOLED: readonly (readonly [PooledShown, string])[] = [
  ["both", "Common and random effects"], ["random", "Random effects"],
  ["fixed", "Common effect"], ["none", "None (the experiments only)"],
];

export function ForestOptions({ graph }: GraphOptionsProps) {
  const [s, set] = useGraphSettings<ForestSettings>(graph, KEY, FOREST_DEFAULTS);
  if (!set) return null;
  return (
    <>
      <OptSelect label="Pooled rows" value={s.pooled} options={POOLED}
        onChange={(pooled) => set({ pooled })} />
      <OptCheck label="Prediction interval" checked={s.prediction}
        disabled={s.pooled === "none" || s.pooled === "fixed"}
        onChange={(prediction) => set({ prediction })} />
    </>
  );
}
