// The incomplete-curve report in the XY fit results (rangeReport.ts): the
// IC50 cell as "> 30 µM (not reached in the range tested)" or as the
// fitted number with a flag, a secondary line with the fitted number and
// the reasons, and the per-results-sheet choice between the two.
import type { ReactNode } from "react";
import { useProject } from "../../app/context";
import { updateResultsOptions } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import type { AnalysisResult, OptionsState, ParamEntry } from "../../types";
import { formatSig } from "../../types";
import {
  NOT_REACHED, displayOf, isLogMidpoint, isMidpoint, isRatioParam, ratioText,
  type ExtrapolatedReport, type RangeDisplay,
} from "./rangeReport";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GP_INCOMPLETE = "https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_50_of_what__relative_vs_absolu.htm";
const SEBAUGH = "https://doi.org/10.1002/pst.426";

/** The best-fit cell of a parameter row: "> 30 (not reached in the range
 *  tested)" or the fitted number with a flag when the fit is flagged, else
 *  `fallback` (the panel's usual cell). */
export function RangeValueCell({ name, e, fit, fallback }: {
  name: string; e: ParamEntry; fit: unknown; fallback: ReactNode;
}) {
  const d = displayOf(fit);
  if (!d || e.constrained) return <>{fallback}</>;
  const why = `Fitted value ${formatSig(e.value)}: ${d.reasons.join("; ")}.`;
  if (isMidpoint(name, d) || isLogMidpoint(name, d)) {
    if (d.mode === "bound") {
      const shown = isLogMidpoint(name, d) ? d.logBound ?? d.bound : d.bound;
      return (
        <td className="range-bound" title={why}>
          {shown} <span className="range-note">({NOT_REACHED})</span>
        </td>
      );
    }
    return (
      <td className="range-flagged" title={why}>
        {formatSig(e.value)}{" "}
        <span className="range-flag">⚑ extrapolated ({d.relation === ">" ? "above" : "below"} the range tested)</span>
      </td>
    );
  }
  if (d.mode === "bound" && isRatioParam(name)) {
    return <td className="range-bound" title={why}>{ratioText(d)}</td>;
  }
  return <>{fallback}</>;
}

/** The line under the parameter table: what was reported and why. */
export function RangeNote({ fit }: { fit: any }) {
  const d: RangeDisplay | null = displayOf(fit);
  if (!d) return null;
  const e = fit?.params?.[d.label] as ParamEntry | undefined;
  const ci = e?.ci95 && e.ci95[0] !== null && e.ci95[1] !== null
    ? `, 95% CI ${formatSig(e.ci95[0] as number)} to ${formatSig(e.ci95[1] as number)}` : "";
  const fitted = e && typeof e.value === "number"
    ? `${formatSig(e.value)}${d.unit ? ` ${d.unit}` : ""}${ci}` : null;
  return (
    <p className="model-line range-line">
      {d.mode === "bound"
        ? <>Reported as {d.text}{fitted ? `; the fitted value ${fitted} is an extrapolation` : ""}: </>
        : <>{d.label} shown as the fitted number, flagged as extrapolated (report it as {d.label} {d.boundWithUnit}): </>}
      {d.reasons.join("; ")}.
    </p>
  );
}

/** The chip and the report choice above the fit results. */
export function RangeFlagsBar({ sheet, result, options }: {
  sheet: ResultsSheet; result: AnalysisResult | null; options: OptionsState;
}) {
  const api = useProject();
  const flagged = (result?.datasets ?? []).filter((ds) => displayOf(ds.fit));
  if (!flagged.length) return null;
  const d = displayOf(flagged[0].fit)!;
  const locked = !!sheet.frozen || api.readOnly;
  const mode: ExtrapolatedReport = options.extrapolatedReport === "fitted" ? "fitted" : "bound";
  const setMode = (m: ExtrapolatedReport) => api.apply((p) => updateResultsOptions(p, sheet.id,
    (o) => ({ ...(o as OptionsState), extrapolatedReport: m })));
  const half = d.label === "IC50" || d.label === "EC50" ? "50%" : "its midpoint";
  return (
    <div className="result-card range-flags" role="note" aria-label="Incomplete curve">
      <p className="range-chip">
        <strong>The curve never reaches {half} in the tested range</strong>
        {" "}({flagged.map((ds) => ds.name).join(", ")}): the {d.label} is reported as
        {" "}{d.boundWithUnit} rather than as the extrapolated number.
      </p>
      <label className="check-row range-mode">
        <span>Report extrapolated {d.label} as</span>
        <select aria-label={`Report extrapolated ${d.label} as`} value={mode} disabled={locked}
          onChange={(e) => setMode(e.target.value as ExtrapolatedReport)}>
          <option value="bound">&gt; highest dose (&lt; lowest), not reached</option>
          <option value="fitted">The fitted number (flagged as extrapolated)</option>
        </select>
      </label>
      <p className="hint-block">
        An {d.label} beyond the concentrations tested is read off the model&apos;s tail, so its
        value depends on the assumed plateaus. Widen the dose range, or constrain a plateau
        known from controls. Sources: GraphPad curve fitting guide,{" "}
        <a href={GP_INCOMPLETE} target="_blank" rel="noreferrer">50% of what? Relative vs.
          absolute IC50</a> and &quot;Incomplete dose-response curves&quot;;{" "}
        <a href={SEBAUGH} target="_blank" rel="noreferrer">Sebaugh (2011), Guidelines for
          accurate EC50/IC50 estimation, Pharm Stat 10:128</a>.
      </p>
    </div>
  );
}
