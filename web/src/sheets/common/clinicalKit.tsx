// Small building blocks shared by the clinical-statistics panels (Cox
// regression, ROC, Bland-Altman, quantal dose-response) and the power
// tool: control rows, key-value and grid result tables, notes.
import type { ReactNode } from "react";
import "./clinical.css";
import "./sheetKit.css";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3>{title}</h3>{children}</section>;
}

export function Field({ label, children, note }: {
  label: string; children: ReactNode; note?: ReactNode;
}) {
  return (
    <label className="check-row clin-field">
      <span>{label}</span>
      {children}
      {note && <span className="field-note">{note}</span>}
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: readonly (readonly [T, string])[];
  onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select aria-label={label} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}

export function TextNum({ label, value, onChange, placeholder, width, note, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; width?: number; note?: ReactNode; disabled?: boolean;
}) {
  return (
    <Field label={label} note={note}>
      <input className="constraint-value" inputMode="decimal" aria-label={label}
        style={width ? { width } : undefined} placeholder={placeholder} disabled={disabled}
        value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Check({ label, checked, onChange, disabled }: {
  label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Card({ title, children, className }: {
  title: string; children: ReactNode; className?: string;
}) {
  return <div className={`result-card clin-results${className ? ` ${className}` : ""}`}>
    <h3>{title}</h3>{children}</div>;
}

export function KV({ title, rows, className }: {
  title?: string; rows: [string, ReactNode][]; className?: string;
}) {
  return (
    <div className={`clin-kv${className ? ` ${className}` : ""}`}>
      {title && <h4>{title}</h4>}
      <table className="results-table goodness">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Grid({ head, rows, caption, className }: {
  head: ReactNode[]; rows: ReactNode[][]; caption?: string; className?: string;
}) {
  return (
    // focusable so a table wider than the pane scrolls from the keyboard
    <div className="clin-scroll" tabIndex={0} role="group" aria-label={caption ?? "Table"}>
      <table className={`results-table clin-grid${className ? ` ${className}` : ""}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (j === 0
                ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Problem({ error }: { error?: string }) {
  return error ? <div className="results-error" role="alert">{error}</div> : null;
}

export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <div className={`result-note${warn ? " result-note-warn" : ""}`}>{children}</div>;
}

export const SOFTWARE = "OpenDose (open-source, built on SciPy)";
