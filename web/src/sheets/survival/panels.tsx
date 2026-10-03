import { SurvivalPlot, SurvivalResults } from "../../components/SurvivalView";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";

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

export function SurvivalGraph({ result, titles, scheme }: PlotProps<unknown, any>) {
  return <SurvivalPlot result={result} scheme={scheme}
    xTitle={titles.x} yTitle={titles.y} />;
}
