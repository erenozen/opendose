import { useMemo } from "react";
import ControlsPanel from "../../components/ControlsPanel";
import MethodsText from "../../components/MethodsText";
import PlateImportPanel from "../../components/PlateImportPanel";
import PlotPanel from "../../components/PlotPanel";
import ResultsPanel from "../../components/ResultsPanel";
import { normalizeTable } from "../../project/table";
import {
  SUBCOLUMN_FORMAT_HAS_N, SUBCOLUMN_FORMAT_LABELS,
} from "../../project/types";
import { xTickFormatter } from "../../project/xformat";
import type { AnalysisResult, OptionsState } from "../../types";
import LongTableButton from "../common/LongTableButton";
import type { AsideProps, ControlsProps, PlotProps, ResultsProps } from "../types";
import { ANALYSIS_NONLIN } from "../../project/builtin";

export function NonlinControls({ sheet, table, options, onChange, readOnly }: ControlsProps<OptionsState>) {
  const fmt = table.subcolumnFormat;
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
        datasetNames={table.datasets.map((d) => d.name)} />
    </>
  );
}

export function NonlinResults({ table, result }:
  ResultsProps<OptionsState, AnalysisResult>) {
  return <ResultsPanel result={result} xUnit={table.xUnit || "M"} />;
}

export function NonlinMethods({ table, result, options }:
  ResultsProps<OptionsState, AnalysisResult>) {
  return <MethodsText result={result} options={options} xUnit={table.xUnit || "M"} />;
}

export function XYPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<OptionsState, AnalysisResult>) {
  // Dates / elapsed times: X ticks read as dates or h:mm:ss.
  const xTickFormat = useMemo(() => xTickFormatter(table) ?? undefined, [table]);
  return (
    <PlotPanel result={result} scheme={scheme} xTitle={titles.x} yTitle={titles.y}
      xTickFormat={xTickFormat} format={format} onFormatChange={onFormatChange}
      rowTitles={table.rowTitles} />
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
            model: imported.output === "viability"
              ? "log_inhibitor_vs_response_4pl"
              : "log_agonist_vs_response_4pl",
          } satisfies OptionsState;
        },
      },
    })} />
  );
}
