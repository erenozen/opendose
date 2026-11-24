// Controls and results of the nested table's precision analysis (P-94).
// The report is the standard curve's (assays/stdcurve/precisionPanel).
import { NumberField } from "../../components/ui";
import { PRECISION_SOURCES, PrecisionReport } from "../assays/stdcurve/precisionPanel";
import CopyableMethods from "../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../types";
import { precisionLayout, type NestedPrecisionOptions } from "./precision";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function NestedPrecisionControls({ table, options: o, onChange, readOnly }:
  ControlsProps<NestedPrecisionOptions>) {
  const set = (patch: Partial<NestedPrecisionOptions>) => onChange({ ...o, ...patch });
  const pos = (v: string, key: "recoveryLimit" | "cvLimit") => {
    const x = Number(v.replace(",", "."));
    if (v.trim() && Number.isFinite(x) && x > 0) set({ [key]: x });
  };
  const layout = precisionLayout(table);
  return (
    <div className="controls">
      <section>
        <h3>Precision study</h3>
        <p className="hint-block">
          {layout === "days"
            ? "Each column is a day, its subcolumns the runs of that day, replicates down the rows "
              + "(CLSI EP05: 20 days × 2 runs × 2 replicates)."
            : "Each column is a run, replicates down the rows. Give a column subcolumns to add days "
              + "(columns = days, subcolumns = runs)."}
        </p>
        <NumberField label="Nominal concentration (for recovery)" value={o.nominal} min={0}
          readOnly={readOnly} placeholder="none" onValueChange={(v) => set({ nominal: v })} />
        <NumberField label="Recovery within" unit="±%" min={0} defaultValue={String(o.recoveryLimit)}
          readOnly={readOnly} onValueChange={(v) => pos(v, "recoveryLimit")} />
        <NumberField label="CV at most" unit="%" min={0} defaultValue={String(o.cvLimit)}
          readOnly={readOnly} onValueChange={(v) => pos(v, "cvLimit")} />
        <p className="hint-block">ICH M10 accepts a QC within ±15% of nominal with CV at most 15%
          (±20% and 20% at the LLOQ). Negative variance components are reported as 0 and said so.</p>
      </section>
    </div>
  );
}

export function NestedPrecisionResults({ table, result: r }: ResultsProps<NestedPrecisionOptions, any>) {
  if (!r) return null;
  if (r.error) return <div className="results-error" role="alert">{String(r.error)}</div>;
  return (
    <div className="result-card precision-results">
      <h3>Precision (variance components)</h3>
      <PrecisionReport p={r} unit={table.yTitle?.trim() || "units"}
        intro={r.layout === "runs" ? "Each column is a run, its replicates down the rows."
          : "Each column is a day, its subcolumns the runs of that day."} />
    </div>
  );
}

export function NestedPrecisionMethods({ result: r }: ResultsProps<NestedPrecisionOptions, any>) {
  const s = r?.samples?.[0];
  if (!s || s.error) return null;
  const text = `Precision was estimated from ${s.n} replicate values in ${s.n_runs} runs`
    + `${s.n_days ? ` on ${s.n_days} days` : ""} by the ANOVA estimators of the nested random model `
    + "(CLSI EP05-A3), negative variance components set to zero; repeatability and total variances "
    + "have chi-square confidence intervals (Satterthwaite's df for the total), the between-run and "
    + "between-day variances Wald intervals (as the VCA package)"
    + `${s.recovery && !s.recovery.error ? `; recovery is the mean over the nominal ${s.recovery.nominal}, `
      + `accepted within ±${r.recovery_limit_percent}% with CV at most ${r.cv_limit_percent}% (ICH M10)` : ""}. `
    + `Sources: ${PRECISION_SOURCES}. Analysed in OpenDose.`;
  return <CopyableMethods text={text} />;
}
