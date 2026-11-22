// The "Degrees of freedom" setting of the mixed-effects models (ddf.ts).
import { DDF_HINT, DDF_LABELS, DDF_METHODS, ddfOf, type DdfMethod } from "./ddf";

export default function DdfSelect({ value, onChange, disabled }: {
  value: unknown; onChange: (m: DdfMethod) => void; disabled?: boolean;
}) {
  return (
    <>
      <label className="check-row">
        <span>Degrees of freedom</span>
        <select aria-label="Degrees of freedom (mixed model)" value={ddfOf(value)} disabled={disabled}
          onChange={(e) => onChange(ddfOf(e.target.value))}>
          {DDF_METHODS.map((m) => <option key={m} value={m}>{DDF_LABELS[m]}</option>)}
        </select>
      </label>
      <p className="hint-block">{DDF_HINT}</p>
    </>
  );
}
