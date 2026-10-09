// "Analyse on the log scale" in the t test and one-way ANOVA controls
// (logScale.ts). A paired design is routed to the ratio paired t test,
// which already analyses the logarithms of the paired values.
import type { ColumnOptionsState } from "../../types";
import { logScaleApplies } from "./logScale";
import { LOG_SOURCES } from "./logScaleSources";

export default function LogScaleOption({ options, onChange, summaryData = false }: {
  options: ColumnOptionsState;
  onChange: (o: ColumnOptionsState) => void;
  summaryData?: boolean;
}) {
  const set = (patch: Partial<ColumnOptionsState>) => onChange({ ...options, ...patch });
  if (options.analysis === "ttest" && options.ttestKind === "paired" && !summaryData) {
    return (
      <p className="hint-block log-scale-hint">
        Ratios or concentrations of paired samples? The ratio paired t test analyses the
        logarithms of the paired values and reports the geometric mean of the ratios.{" "}
        <button type="button" className="link-button"
          onClick={() => set({ ttestKind: "ratio_paired" })}>Use the ratio paired t test</button>
      </p>
    );
  }
  if (!logScaleApplies(options, summaryData)) return null;
  return (
    <div className="log-scale-option">
      <label className="check-row">
        <input type="checkbox" checked={!!options.logScale}
          onChange={(e) => set({ logScale: e.target.checked })} />
        <span>Analyse on the log scale (geometric means and their ratios)</span>
      </label>
      {options.logScale && (
        <p className="hint-block">
          The test runs on log10 of the values; the results report geometric means and the
          ratio of geometric means (a fold change) with its 95% CI. Values ≤ 0 have no
          logarithm and are left out (the results say how many). Use it for concentrations,
          titres and other positive values whose SD grows with the mean.{" "}
          <span className="source-line">Sources: {LOG_SOURCES.map((s, i) => (
            <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
          ))}.</span>
        </p>
      )}
    </div>
  );
}
