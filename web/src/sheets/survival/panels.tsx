import { useMemo } from "react";
import { SurvivalPlot, SurvivalResults } from "../../components/SurvivalView";
import { riskSetsFromTable } from "../../graph";
import type { ControlsProps, GraphOptionsProps, PlotProps, ResultsProps } from "../types";
import { OptCheck, OptNote, OptSelect, OptSlider } from "../../components/GraphOptionControls";
import { useGraphSetting } from "../grouped/plotting";
import {
  normalizeSurvivalGraph, survivalYTitle, type SurvivalCi, type SurvivalScale, type SurvivalShow,
} from "./graphSettings";
import { CompetingLink, CoxLink } from "../../components/ResultsLinks";
import { causeCodes } from "./competing";
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
          Y1 = time, Y2 = event code (1 = event, 0 = censored; 2, 3, … for other
          kinds of event, analysed by Competing risks).
          Counts of animals alive per day, or start and end dates, can be
          turned into these rows with “Survival data from…” above the table.
        </p>
      </section>
    </div>
  );
}

/** Competing risks (P-90): how the event codes are read. The names of the
 *  kinds of event are set on the results sheet. */
export function CompetingControls(_: ControlsProps<any>) {
  void _;
  return (
    <div className="controls">
      <section>
        <h3>How to enter data</h3>
        <p className="hint-block">
          Each dataset is one group; each row is one subject: Y1 = time, Y2 = event code:
          0 = censored, 1 = the first kind of event, 2, 3, … the other kinds (for example
          1 = death from the tumour, 2 = death from another cause). The first event a subject
          has ends its follow-up. Name the kinds of event above the results.
        </p>
      </section>
    </div>
  );
}

/** Parametric survival (P-91): what the model is; the distribution and
 *  percentiles are chosen above the results. */
export function ParametricControls(_: ControlsProps<any>) {
  void _;
  return (
    <div className="controls">
      <section>
        <h3>Model</h3>
        <p className="hint-block">
          An accelerated failure time model on the time and event code (1 = event, 0 =
          censored) of each subject, with the group as a factor and the first group as the
          reference. Covariate columns are used by Cox regression, not here. Choose the
          distribution and the percentiles above the results.
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
      {result && !result.error && causeCodes(table).some((c) => c >= 2) && <CompetingLink sheet={sheet} />}
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
