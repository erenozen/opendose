// "Equivalence or non-inferiority" in the t test, one-sample t test and
// two-proportion controls (report/equivalence.ts, P-12): the mode and the
// margin, with the reminder that the margin belongs to the plan, not to
// the data. The analysis runs without the TOST until the margin is valid.
import { NumberField } from "../../components/ui";
import {
  EQUIVALENCE_MODE_LABELS, TOST_SOURCES, equivalenceSpec, type EquivalenceMode, type MarginScale,
} from "../../report/equivalence";

export interface EquivalenceValue {
  equivalence?: EquivalenceMode;
  equivalenceMargin?: string;
}

export default function EquivalenceControls({ value, scale, estimate, onChange, max }: {
  value: EquivalenceValue;
  scale: MarginScale;
  /** What the margin is about: "Group A − Group B", "mean − hypothetical". */
  estimate: string;
  onChange: (patch: EquivalenceValue) => void;
  /** Largest margin (proportions: below 1). */
  max?: number;
}) {
  const mode = value.equivalence ?? "off";
  const spec = equivalenceSpec(mode, value.equivalenceMargin, scale);
  const problem = spec && "error" in spec && (value.equivalenceMargin ?? "").trim() !== ""
    ? spec.error : null;
  return (
    <div className="equivalence-controls">
      <label className="check-row">
        <span>Equivalence test</span>
        <select value={mode}
          onChange={(e) => onChange({ equivalence: e.target.value as EquivalenceMode })}>
          {(Object.keys(EQUIVALENCE_MODE_LABELS) as EquivalenceMode[]).map((k) => (
            <option key={k} value={k}>{EQUIVALENCE_MODE_LABELS[k]}</option>
          ))}
        </select>
      </label>
      {mode !== "off" && (
        <>
          <NumberField
            label={scale === "ratio" ? `Margin as a ratio of ${estimate}` : `Margin (± in the units of ${estimate})`}
            description={scale === "ratio" ? "1.25 tests 0.8 to 1.25" : "1 tests −1 to 1"}
            fieldClassName="field-num" min={0} max={max} required
            value={value.equivalenceMargin ?? ""} error={problem}
            onValueChange={(v) => onChange({ equivalenceMargin: v })} />
          <p className="hint-block">
            Choose the margin before looking at the data: the largest difference that would not
            matter scientifically. The two one-sided tests show equivalence when the 90% CI lies
            inside it; a result that does not shows nothing either way, not a difference.{" "}
            <span className="source-line">Sources: {TOST_SOURCES.map((s, i) => (
              <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
            ))}.</span>
          </p>
        </>
      )}
    </div>
  );
}
