// Labelled controls of the power tool on ui/Field (forms.md): the label
// beside the control in this dense two-column tool (power.css), the note
// under it.
import { useId, type ReactNode } from "react";
import { Field, Input } from "../components/ui";

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}

/** A value typed as text: numbers keep what was typed ("1e-3", "0,05"). */
export function TextNum({ label, value, onChange, placeholder, note, text, wide }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; note?: ReactNode;
  /** Words, not a number (no number pad on phones). */
  text?: boolean;
  /** Spans the whole column (a list of values, a sentence). */
  wide?: boolean;
}) {
  return (
    <Field label={label} description={note} className={wide ? "power-wide" : undefined}>
      <Input inputMode={text ? undefined : "decimal"} autoComplete="off" spellCheck={false}
        placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
