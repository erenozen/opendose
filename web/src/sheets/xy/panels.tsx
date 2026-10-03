import ControlsPanel from "../../components/ControlsPanel";
import MethodsText from "../../components/MethodsText";
import PlateImportPanel from "../../components/PlateImportPanel";
import PlotPanel from "../../components/PlotPanel";
import ResultsPanel from "../../components/ResultsPanel";
import { normalizeTable } from "../../project/table";
import type { AnalysisResult, OptionsState } from "../../types";
import type { AsideProps, ControlsProps, PlotProps, ResultsProps } from "../types";
import { ANALYSIS_NONLIN } from "../../project/builtin";

export function NonlinControls({ options, onChange }: ControlsProps<OptionsState>) {
  return <ControlsPanel options={options} onChange={onChange} />;
}

export function NonlinResults({ table, result }:
  ResultsProps<OptionsState, AnalysisResult>) {
  return <ResultsPanel result={result} xUnit={table.xUnit || "M"} />;
}

export function NonlinMethods({ table, result, options }:
  ResultsProps<OptionsState, AnalysisResult>) {
  return <MethodsText result={result} options={options} xUnit={table.xUnit || "M"} />;
}

export function XYPlot({ result, titles, scheme }:
  PlotProps<OptionsState, AnalysisResult>) {
  return <PlotPanel result={result} scheme={scheme} xTitle={titles.x} yTitle={titles.y} />;
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
