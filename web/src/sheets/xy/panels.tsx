import { useMemo } from "react";
import { useProject } from "../../app/context";
import ControlsPanel from "../../components/ControlsPanel";
import MethodsText from "../../components/MethodsText";
import PlateImportPanel from "../../components/PlateImportPanel";
import PlotPanel from "../../components/PlotPanel";
import ResultsPanel from "../../components/ResultsPanel";
import { updateResultsOptions } from "../../project/ops";
import { normalizeTable } from "../../project/table";
import {
  SUBCOLUMN_FORMAT_HAS_N, SUBCOLUMN_FORMAT_LABELS,
} from "../../project/types";
import { xTickFormatter } from "../../project/xformat";
import type { AnalysisResult, OptionsState } from "../../types";
import LongTableButton from "../common/LongTableButton";
import type { AsideProps, ControlsProps, PlotProps, ResultsProps } from "../types";
import { ANALYSIS_NONLIN, GRAPH_XY } from "../../project/builtin";
import { autoFitGate, chooseReasonText } from "./autofit";
import { ANALYSIS_LINREG, DEFAULT_LINREG, GRAPH_LINREG } from "./linreg";
import { chooseModelOf } from "./run";
import { switchResultsAnalysis } from "./switchAnalysis";
import { RangeFlagsBar } from "./rangeFlags";
import { ZeroDoseBar } from "./ZeroDoseBar";
import { ExperimentsResults } from "./ExperimentsCard";
import { FitSummaryCard } from "./FitSummaryCard";
import { InterpolationCard } from "./InterpolationCard";
import { SchildResults } from "./SchildCard";
import { dropPoints, normalizeXYGraph } from "./fitGraph";
import { fitCaption } from "./fitLegend";
import { concentrationUnit, displayOf } from "./rangeReport";
import { CompareFitsLinks } from "../../components/ResultsLinks";
import "./xy.css";
import { Button } from "../../components/ui";

/** Open the model picker of the controls pane (after "Fit a curve"). */
function openModelPicker() {
  requestAnimationFrame(() => {
    const btn = document.querySelector<HTMLButtonElement>(".pane-controls .mp-button");
    if (!btn) return;
    btn.scrollIntoView({ block: "nearest" });
    if (btn.getAttribute("aria-expanded") !== "true") btn.click();
    else btn.focus();
  });
}

export function NonlinControls({ sheet, table, options, onChange, readOnly }: ControlsProps<OptionsState>) {
  const fmt = table.subcolumnFormat;
  const waiting = !autoFitGate(table, options).fit;
  return (
    <>
      {fmt !== "replicates" && (
        <div className="controls summary-fit">
          <section>
            <h3>Data entered as {SUBCOLUMN_FORMAT_LABELS[fmt]}</h3>
            {SUBCOLUMN_FORMAT_HAS_N[fmt] ? (
              <fieldset className="field-radios">
                <legend className="sr-only">How to fit summary data</legend>
                <label>
                  <input type="radio" name={`summary-fit-${table.datasets.length}`}
                    checked={(options.summaryReplicates ?? "account") === "account"}
                    onChange={() => onChange({ ...options, summaryReplicates: "account" })} />
                  Account for the error and N (same fit as the raw replicates)
                </label>
                <label>
                  <input type="radio" name={`summary-fit-${table.datasets.length}`}
                    checked={options.summaryReplicates === "means_only"}
                    onChange={() => onChange({ ...options, summaryReplicates: "means_only" })} />
                  Fit the means only (one point per row)
                </label>
              </fieldset>
            ) : (
              <p className="hint-block">
                Without N the error values cannot be used: the fit uses the
                means, one point per row. Error bars show what was entered.
              </p>
            )}
          </section>
        </div>
      )}
      {!readOnly && (
        <div className="controls long-table-controls">
          <section>
            <LongTableButton target="xy" sheet={sheet} />
          </section>
        </div>
      )}
      <ControlsPanel options={options} onChange={onChange} readOnly={readOnly}
        datasetNames={table.datasets.map((d) => d.name)}
        summaryData={fmt !== "replicates"}
        notice={waiting && (
          <div className="fit-waiting">
            <p className="hint-block">
              These data do not look like a dose-response, so the fit waits until you
              choose a model or click Fit.
            </p>
            <Button size="sm" disabled={readOnly}
              onClick={() => onChange({ ...options, autoFit: "requested" })}>
              Fit
            </Button>
          </div>
        )} />
    </>
  );
}

/** Shown instead of a fit when a new table's data do not look like a
 *  dose-response: linear regression (this sheet becomes one) or a curve
 *  fit (the model picker opens and the fit starts). */
function ChooseModel({ sheet, reason }: { sheet: ResultsProps["sheet"]; reason: string }) {
  const api = useProject();
  const locked = !!sheet.frozen || api.readOnly;
  const toLinreg = () => api.apply((p) => switchResultsAnalysis(p, sheet.id, {
    analysis: ANALYSIS_LINREG,
    options: { ...DEFAULT_LINREG },
    sheetName: (t) => `Linear regression of ${t}`,
    graphFrom: GRAPH_XY,
    graphTo: GRAPH_LINREG,
  }));
  const fitCurve = () => {
    api.apply((p) => updateResultsOptions(p, sheet.id,
      (o) => ({ ...(o as OptionsState), autoFit: "requested" })));
    openModelPicker();
  };
  return (
    <div className="results">
      <div className="result-card choose-model">
        <h3>Choose a model</h3>
        <p className="hint-block">{reason} How should these data be analysed?</p>
        <div className="choose-model-options">
          <div>
            <Button variant="primary" disabled={locked} onClick={toLinreg}>
              Linear regression
            </Button>
            <p className="hint-block">
              A straight line: slope and intercept with CIs, R², the regression ANOVA
              and a runs test.
            </p>
          </div>
          <div>
            <Button disabled={locked} onClick={fitCurve}>Fit a curve</Button>
            <p className="hint-block">
              Choose a model from the library (dose-response, kinetics, binding,
              exponential, polynomial, …) and fit it by nonlinear regression.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NonlinResults({ sheet, table, result, options }:
  ResultsProps<OptionsState, AnalysisResult>) {
  const choose = chooseModelOf(result);
  if (choose) return <ChooseModel sheet={sheet} reason={chooseReasonText(choose.reason)} />;
  return (
    <>
      <RangeFlagsBar sheet={sheet} result={result} options={options} />
      <ZeroDoseBar sheet={sheet} result={result} options={options} />
      <FitSummaryCard sheet={sheet} result={result} xUnit={concentrationUnit(table) || "M"} />
      <InterpolationCard result={result} table={table} xUnit={concentrationUnit(table) || "M"} />
      <ResultsPanel result={result} xUnit={concentrationUnit(table) || "M"} options={options} />
      <ExperimentsResults sheet={sheet} result={result} xUnit={concentrationUnit(table) || "M"} />
      <SchildResults sheet={sheet} result={result} />
      {result && !(result as { error?: unknown }).error && (
        <CompareFitsLinks sheet={sheet} table={table} model={options.model}
          xIsLog={!!options.xIsLog} weighting={options.weighting} weightK={options.weightK} />
      )}
    </>
  );
}

export function NonlinMethods({ table, result, options }:
  ResultsProps<OptionsState, AnalysisResult>) {
  const flagged = (result?.datasets ?? []).some((ds) => displayOf(ds.fit));
  return (
    <>
      <MethodsText result={result} options={options} xUnit={concentrationUnit(table) || "M"} />
      {flagged && (
        <p className="hint-block range-methods">
          {options.extrapolatedReport === "fitted"
            ? "IC50/EC50 values beyond the concentrations tested are reported as the fitted values, flagged as extrapolations."
            : "IC50/EC50 values beyond the concentrations tested are reported as greater than the highest (or less than the lowest) concentration tested, not as extrapolated values."}
        </p>
      )}
    </>
  );
}

export function XYPlot({ graph, table, result, options, titles, scheme, format, onFormatChange,
  onPointPick }: PlotProps<OptionsState, AnalysisResult>) {
  // Dates / elapsed times: X ticks read as dates or h:mm:ss.
  const xTickFormat = useMemo(() => xTickFormatter(table) ?? undefined, [table]);
  // Waiting for a model: draw the points alone.
  const shown = useMemo(() => {
    const choose = chooseModelOf(result);
    return choose ? { ...(result as AnalysisResult), datasets: choose.preview } : result;
  }, [result]);
  // The curve-fit graph's own options (sheets/xy/fitGraph.ts); the Deming,
  // linear-regression and compare-fits graphs share this panel without them.
  const raw = graph.graphType === GRAPH_XY ? graph.settings.xy : undefined;
  const xs = useMemo(() => normalizeXYGraph(raw), [raw]);
  const unit = concentrationUnit(table) || "M";
  const drop = useMemo(() => (xs.dropLines
    ? { points: dropPoints(shown), label: xs.dropLabel, unit } : undefined),
  [xs.dropLines, xs.dropLabel, shown, unit]);
  // "In the figure": the legend sentence drawn into the figure (exports
  // carry it); "Under the graph" opens the legend card instead.
  const yGap = format?.y?.gap ?? null;
  const caption = useMemo(() => (xs.caption === "figure"
    ? fitCaption(table, shown, options, xs, yGap) || undefined : undefined), [xs, table, shown, options, yGap]);
  // A clicked point: the result's data set i is the table's data set of
  // the same index when every one was analysed, else the one of its name.
  const pick = useMemo(() => {
    if (!onPointPick || !shown || !("datasets" in (shown as object))) return undefined;
    const sets = (shown as AnalysisResult).datasets;
    return (i: number, row: number) => {
      const name = sets[i]?.name;
      const byName = table.datasets.map((d, k) => (d.name === name ? k : -1)).filter((k) => k >= 0);
      const dataset = sets.length === table.datasets.length ? i : byName.length === 1 ? byName[0] : -1;
      if (dataset >= 0 && row >= 0 && row < table.x.length) onPointPick({ dataset, row });
    };
  }, [onPointPick, shown, table]);
  return (
    <PlotPanel result={shown} scheme={scheme} xTitle={titles.x} yTitle={titles.y}
      xTickFormat={xTickFormat} format={format} onFormatChange={onFormatChange}
      rowTitles={table.rowTitles} drop={drop} caption={caption} onPointClick={pick} />
  );
}

/** SRB / MTT plate import: replaces the table and sets the fit up the way
 *  normalized percent data should be fitted, as one undo step. */
export function PlateAside({ readOnly, editFamily }: AsideProps) {
  if (readOnly) return null;
  return (
    <PlateImportPanel onImport={(imported) => editFamily({
      table: (t) => normalizeTable({
        ...t,
        x: imported.x,
        datasets: imported.datasets,
        xUnit: "µM",
        yTitle: imported.output === "viability" ? "Cell viability (%)" : "Inhibition (%)",
        xExcluded: [],
      }),
      options: {
        // Percent data normalized to a 0-dose control: constrain both
        // plateaus (the user can untick).
        [ANALYSIS_NONLIN]: (o) => {
          const prev = o as OptionsState;
          return {
            ...prev,
            xIsLog: false,
            normalize: { ...prev.normalize, enabled: false },
            top: { enabled: true, value: "100" },
            bottom: { enabled: true, value: "0" },
            autoFit: "requested",
            model: imported.output === "viability"
              ? "log_inhibitor_vs_response_4pl"
              : "log_agonist_vs_response_4pl",
          } satisfies OptionsState;
        },
      },
    })} />
  );
}
