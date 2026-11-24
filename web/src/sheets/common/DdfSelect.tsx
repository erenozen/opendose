// The "Degrees of freedom" setting of the mixed-effects models (ddf.ts).
import { DDF_HINT, DDF_LABELS, DDF_METHODS, ddfOf, type DdfMethod } from "./ddf";

/** `methods` limits the choice (the general mixed model has no
 *  containment df); a stored value outside it shows as the first one. */
export default function DdfSelect({ value, onChange, disabled, methods = DDF_METHODS, hint = DDF_HINT }: {
  value: unknown; onChange: (m: DdfMethod) => void; disabled?: boolean;
  methods?: DdfMethod[]; hint?: string;
}) {
  const v = ddfOf(value);
  return (
    <>
      <label className="check-row">
        <span>Degrees of freedom</span>
        <select aria-label="Degrees of freedom (mixed model)" value={methods.includes(v) ? v : methods[0]}
          disabled={disabled} onChange={(e) => onChange(ddfOf(e.target.value))}>
          {methods.map((m) => <option key={m} value={m}>{DDF_LABELS[m]}</option>)}
        </select>
      </label>
      <p className="hint-block">{hint}</p>
    </>
  );
}
