// Comparisons after repeated-measures one-way ANOVA (rmPosthoc.ts): the
// method, Dunnett's baseline, the family (comparisons picker), the error
// term, and the mixed-effects model for subjects with missing values.
import type { ColumnOptionsState, ComparisonsMethod } from "../../types";
import ComparisonsPicker from "./comparisonsPicker";
import { RM_POSTHOC_SOURCES } from "./logScaleSources";
import {
  mixedLimitations, RM_METHOD_LABELS, RM_METHODS, rmBaseline, rmError, rmMethod,
} from "./rmPosthoc";

export default function RmPosthocControls({ options, datasetNames, onChange, incomplete = 0 }: {
  options: ColumnOptionsState;
  datasetNames: string[];
  onChange: (o: ColumnOptionsState) => void;
  /** Subjects (rows) missing some treatment. */
  incomplete?: number;
}) {
  const set = (patch: Partial<ColumnOptionsState>) => onChange({ ...options, ...patch });
  const k = datasetNames.length;
  const method = rmMethod(options);
  const name = (i: number) => datasetNames[i] || `Dataset ${i + 1}`;
  const mixed = !!options.rmMixed && incomplete > 0;
  const limits = mixed ? mixedLimitations(options, k) : "";
  return (
    <div className="rm-posthoc">
      <label className="check-row">
        <span>Multiple comparisons</span>
        <select aria-label="Multiple comparisons" value={method ?? "none"}
          onChange={(e) => set({ comparisons: e.target.value as ComparisonsMethod })}>
          {(["none", ...RM_METHODS] as const).map((m) => (
            <option key={m} value={m}>{RM_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </label>
      {method === "dunnett" && (
        <label className="check-row">
          <span>Baseline</span>
          <select aria-label="Baseline (control)" value={rmBaseline(options, k)}
            onChange={(e) => set({ controlIndex: Number(e.target.value) })}>
            {datasetNames.map((_, i) => <option key={i} value={i}>{name(i)}</option>)}
          </select>
        </label>
      )}
      {method && !mixed && (
        <ComparisonsPicker options={options} datasetNames={datasetNames} onChange={onChange} />
      )}
      {method && !mixed && (
        <label className="check-row">
          <span>Error term</span>
          <select aria-label="Error term for the comparisons" value={rmError(options)}
            onChange={(e) => set({ rmComparisonsError: e.target.value as "per_pair" | "pooled" })}>
            <option value="per_pair">Each pair&apos;s own differences (sphericity not assumed)</option>
            <option value="pooled">Pooled RM ANOVA residual (assumes sphericity)</option>
          </select>
        </label>
      )}
      {method && !mixed && (
        <p className="hint-block">
          Every comparison keeps the matching. With the Geisser-Greenhouse correction
          (sphericity not assumed) each comparison uses only the paired differences of its
          two treatments, essentially a paired t test with the chosen correction; the pooled
          error assumes the same scatter at every treatment.
          {rmError(options) === "per_pair" && (method === "tukey" || method === "dunnett")
            && " With each pair's own SE, Tukey and Dunnett P values are approximations "
              + "(Maxwell & Delaney 2004 recommend Šídák or Bonferroni with separate error terms)."}{" "}
          <span className="source-line">Sources: {RM_POSTHOC_SOURCES.map((s, i) => (
            <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
          ))}.</span>
        </p>
      )}
      {incomplete > 0 && (
        <label className="check-row">
          <input type="checkbox" checked={!!options.rmMixed}
            onChange={(e) => set({ rmMixed: e.target.checked })} />
          <span>Keep the {incomplete} subject{incomplete === 1 ? "" : "s"} with missing values
            (mixed-effects model)</span>
        </label>
      )}
      {limits && <p className="hint-block">{limits}</p>}
    </div>
  );
}
