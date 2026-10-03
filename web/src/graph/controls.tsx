// Small labeled form controls shared by the graph-format dialogs. Every
// control is a real <label>ed input, so screen readers announce it and
// clicking the text focuses it. "Automatic" is always an explicit choice
// (an empty number field, an "Auto" colour), never a hidden default.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { contrastWarning } from "./color";

export function NumField({ label, value, onChange, placeholder = "Auto", note, width }: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  note?: string;
  width?: number;
}) {
  // Keep the typed text (e.g. "1." or "-") while it is not yet a number.
  const [text, setText] = useState(value == null ? "" : String(value));
  const last = useRef(value);
  const id = useId();
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value == null ? "" : String(value));
    }
  }, [value]);
  return (
    <div className="field field-num fmt-num">
      <label htmlFor={id}>{label}</label>
      <input id={id} inputMode="decimal" value={text} placeholder={placeholder}
        style={width ? { width } : undefined}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const n = Number(t.trim().replace(",", "."));
          const next = t.trim() === "" ? undefined : Number.isFinite(n) ? n : null;
          if (next === null) return;
          last.current = next;
          onChange(next);
        }} />
      {note && <span className="field-note">{note}</span>}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, multiline }: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <div className="field fmt-text">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} rows={3} value={value ?? ""} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
      ) : (
        <input id={id} value={value ?? ""} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
      )}
    </div>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export function CheckField({ label, checked, onChange, note }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  note?: string;
}) {
  return (
    <label className="check-row fmt-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {note && <span className="field-note">{note}</span>}
    </label>
  );
}

/** Colour picker with an explicit "Auto" state and a contrast warning. */
export function ColorField({ label, value, auto, surface, onChange, mark = true }: {
  label: string;
  value: string | undefined;
  /** The colour shown while automatic (scheme or chrome colour). */
  auto: string;
  /** Plot background, for the contrast check. */
  surface: string;
  onChange: (v: string | undefined) => void;
  /** A data mark or text (checked for contrast); false for backgrounds. */
  mark?: boolean;
}) {
  const warn = mark ? contrastWarning(value, surface) : "";
  const id = useId();
  return (
    <div className="field fmt-color">
      <label htmlFor={id}>{label}</label>
      <span className="fmt-color-row">
        <input id={id} type="color" value={value ?? auto}
          onChange={(e) => onChange(e.target.value.toLowerCase())} />
        {value ? (
          <button type="button" className="fmt-mini" onClick={() => onChange(undefined)}
            aria-label={`${label}: back to automatic`}>Auto</button>
        ) : <span className="fmt-auto">Automatic</span>}
      </span>
      {warn && <span className="fmt-warn" role="status">{warn}</span>}
    </div>
  );
}

/** Section with a small uppercase heading. */
export function Section({ title, children, wide }: {
  title: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <fieldset className={`fmt-section${wide ? " wide" : ""}`}>
      <legend>{title}</legend>
      <div className="fmt-grid">{children}</div>
    </fieldset>
  );
}

/** Accessible tabs (arrow keys move between tabs). */
export function Tabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + tabs.length) % tabs.length;
    onChange(tabs[j][0]);
    refs.current[j]?.focus();
  };
  return (
    <div className="fmt-tabs" role="tablist" aria-label={label}>
      {tabs.map(([v, l], i) => (
        <button key={v} type="button" role="tab" ref={(b) => { refs.current[i] = b; }}
          aria-selected={v === value} tabIndex={v === value ? 0 : -1}
          className={v === value ? "active" : ""}
          onKeyDown={(e) => onKey(e, i)} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/** Cancel / Apply / OK row for the format dialogs. */
export function DialogActions({ onCancel, onApply, dirty }: {
  onCancel: () => void; onApply: () => void; dirty: boolean;
}) {
  return (
    <>
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="button" onClick={onApply} disabled={!dirty}>Apply</button>
      <button type="submit" className="btn-primary">OK</button>
    </>
  );
}
