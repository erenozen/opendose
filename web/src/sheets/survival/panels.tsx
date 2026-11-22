import { useMemo } from "react";
import { SurvivalPlot, SurvivalResults } from "../../components/SurvivalView";
import { riskSetsFromTable } from "../../graph";
import type { ControlsProps, GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import { OptCheck, OptNote, OptSelect, OptSlider } from "../../components/GraphOptionControls";
import { useGraphSetting } from "../grouped/plotting";
import {
  normalizeSurvivalGraph, survivalYTitle, type SurvivalCi, type SurvivalScale, type SurvivalShow,
} from "./graphSettings";
import { CoxLink } from "../../components/ResultsLinks";
import { timeUnitOf } from "./entry";
import { notReachedByGroup } from "./extras";
import { MedianNotes, SurvivalExtrasBlocks } from "./extrasPanels";

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
          Counts of animals alive per day, or start and end dates, can be
          turned into these rows with “Survival data from…” above the table.
        </p>
      </section>
    </div>
  );
}

export function SurvivalResultsPanel(props: ResultsProps<unknown, any>) {
  const { sheet, result, table } = props;
  return (
    <>
      <SurvivalResults result={result} table={table}
        medianNotes={notReachedByGroup(result?.extras?.at_time, timeUnitOf(table))}
        afterMedians={<MedianNotes result={result} table={table} />}
        extras={<SurvivalExtrasBlocks {...props} />} />
      {result && !result.error && <CoxLink sheet={sheet} />}
    </>
  );
}

export function SurvivalGraph({ graph, result, titles, scheme, table, format, onFormatChange }:
  PlotProps<unknown, any>) {
  const riskSets = useMemo(() => riskSetsFromTable(table.datasets), [table.datasets]);
  const raw = graph.settings.survival;
  const s = useMemo(() => normalizeSurvivalGraph(raw), [raw]);
  // the automatic title follows survival / death and percent / fraction;
  // a title the user typed is kept
  const yTitle = titles.y === "Percent survival" ? survivalYTitle(s) : titles.y;
  return <SurvivalPlot result={result} scheme={scheme}
    xTitle={titles.x} yTitle={yTitle} format={format} onFormatChange={onFormatChange}
    riskSets={riskSets.length ? riskSets : undefined} censorMarks={s.censorMarks}
    nudge={s.nudge} ci={s.ci} show={s.show} scale={s.scale} />;
}

/** Survival graph options: survival or death, percent or fraction, the
 *  confidence interval, censor ticks and nudging overlapping curves. */
export function SurvivalOptions({ graph }: GraphOptionsProps) {
  const [s, set] = useGraphSetting(graph, "survival", normalizeSurvivalGraph);
  if (!set) return null;
  return (
    <>
      <OptSelect label="Plot" value={s.show}
        options={[["survival", "Survival"], ["death", "Death (1 − survival)"]] as const}
        onChange={(show) => set({ ...s, show: show as SurvivalShow })} />
      <OptSelect label="Y axis" value={s.scale}
        options={[["percent", "Percent (0 to 100)"], ["fraction", "Fraction (0 to 1)"]] as const}
        onChange={(scale) => set({ ...s, scale: scale as SurvivalScale })} />
      <OptSelect label="95% confidence interval" value={s.ci}
        options={[["none", "Not shown"], ["band", "Shaded band"], ["lines", "Dotted lines"]] as const}
        onChange={(ci) => set({ ...s, ci: ci as SurvivalCi })} />
      <OptNote>The interval is each curve's pointwise CI from the Kaplan-Meier table (log-log
        transform, as Prism). For death it is 1 − the survival limits.</OptNote>
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
