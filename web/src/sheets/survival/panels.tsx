import { useMemo } from "react";
import { SurvivalPlot, SurvivalResults } from "../../components/SurvivalView";
import { riskSetsFromTable } from "../../graph";
import type { ControlsProps, GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import { OptCheck, OptNote, OptSlider } from "../../components/GraphOptionControls";
import { useGraphSetting } from "../grouped/plotting";
import { normalizeSurvivalGraph } from "./graphSettings";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SurvivalControls(_: ControlsProps) {
  void _;
  return (
    <div className="controls">
      <section>
        <h3>How to enter data</h3>
        <p className="hint-block">
          Each dataset is one group; each row is one subject:
          Y1 = time, Y2 = event code (1 = event, 0 = censored).
        </p>
      </section>
    </div>
  );
}

export function SurvivalResultsPanel({ result }: ResultsProps<unknown, any>) {
  return <SurvivalResults result={result} />;
}

export function SurvivalGraph({ graph, result, titles, scheme, table, format, onFormatChange }:
  PlotProps<unknown, any>) {
  const riskSets = useMemo(() => riskSetsFromTable(table.datasets), [table.datasets]);
  const raw = graph.settings.survival;
  const s = useMemo(() => normalizeSurvivalGraph(raw), [raw]);
  return <SurvivalPlot result={result} scheme={scheme}
    xTitle={titles.x} yTitle={titles.y} format={format} onFormatChange={onFormatChange}
    riskSets={riskSets.length ? riskSets : undefined} censorMarks={s.censorMarks}
    nudge={s.nudge} />;
}

/** Survival graph options: censor ticks and nudging overlapping curves. */
export function SurvivalOptions({ graph }: GraphOptionsProps) {
  const [s, set] = useGraphSetting(graph, "survival", normalizeSurvivalGraph);
  if (!set) return null;
  return (
    <>
      <OptCheck label="Mark censored subjects (ticks)" checked={s.censorMarks}
        onChange={(censorMarks) => set({ ...s, censorMarks })} />
      <OptSlider label="Nudge curves apart" value={s.nudge} min={0} max={3} step={0.25}
        format={(v) => (v ? `${v} percentage points` : "Off")}
        onChange={(nudge) => set({ ...s, nudge })} />
      <OptNote>Nudging moves each curve up or down a little so curves that overlap (all
        start at 100%) stay visible; hover shows the true values.</OptNote>
    </>
  );
}
