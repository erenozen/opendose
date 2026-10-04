// Form controls for a graph kind's own options (GraphKindDef.OptionsPanel),
// laid out as label / control rows in the graph's Settings panel. One set
// for every table type, so the options of a pie chart, a grouped bar graph
// and a PCA biplot look and behave alike.
import { useId, type ReactNode } from "react";

export function OptSelect<T extends string>({ label, value, options, onChange, none,
  disabled, title }: {
  label: string;
  value: T | "";
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  /** Label of an empty first choice ("None", "Choose…"). */
  none?: string;
  disabled?: boolean;
  title?: string;
}) {
  const id = useId();
  return (
    <div className="gopt-row" title={title}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export function OptCheck({ label, checked, onChange, title, disabled }: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <label className="gopt-check" title={title} aria-disabled={disabled || undefined}>
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** A free text or number field (kept as typed; the plot parses it). */
export function OptInput({ label, value, onChange, placeholder, inputMode, type = "text",
  min, max, step, ariaLabel, suffix }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  type?: "text" | "number" | "color";
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="gopt-row">
      <label htmlFor={id}>{label}</label>
      <span className="gopt-input">
        <input id={id} type={type} value={value} placeholder={placeholder}
          inputMode={inputMode} min={min} max={max} step={step} aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)} />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </span>
    </div>
  );
}

export function OptSlider({ label, value, min, max, step, onChange, format }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="gopt-row gopt-slider">
      <label htmlFor={id}>{label}</label>
      <span className="gopt-input">
        <input id={id} type="range" min={min} max={max} step={step} value={value}
          aria-valuetext={format(value)} onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={id}>{format(value)}</output>
      </span>
    </div>
  );
}

export function OptNote({ children }: { children: ReactNode }) {
  return <p className="gopt-note">{children}</p>;
}
