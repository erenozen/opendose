// Small pieces the assay panels share: pass/fail chips, key-value tables,
// notes, the column-role picker and the list of linked output tables.
import type { ReactNode } from "react";
import { useProject } from "../../../app/context";
import type { DataSheet, DataTableModel } from "../../../project/types";
import { columnNames, type ColumnChoice, type ColumnIndex, type RoleSpec } from "./columns";
import "./assays.css";

export function Pass({ ok, yes = "Pass", no = "Fail" }: {
  ok: boolean | null | undefined; yes?: string; no?: string;
}) {
  if (ok === null || ok === undefined) return <span className="qc-chip qc-na">n/a</span>;
  return ok
    ? <span className="qc-chip qc-pass">{yes}</span>
    : <span className="qc-chip qc-fail">{no}</span>;
}

export function Chip({ tone, children, title }: {
  tone: "pass" | "fail" | "warn" | "info"; children: ReactNode; title?: string;
}) {
  return <span className={`qc-chip qc-${tone}`} title={title}>{children}</span>;
}

export type KVRow = [string, ReactNode];

export function KV({ rows }: { rows: KVRow[] }) {
  return (
    <table className="results-table kv-wide">
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
      </tbody>
    </table>
  );
}

export function Note({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return <div className={`result-note${warn ? " result-note-warn" : ""}`}>{children}</div>;
}

export function Warnings({ items }: { items: unknown }) {
  const list = Array.isArray(items) ? items.filter((w) => typeof w === "string") as string[] : [];
  if (!list.length) return null;
  return (
    <div className="result-note result-note-warn assay-warnings">
      <ul>{list.map((w) => <li key={w}>{w}</li>)}</ul>
    </div>
  );
}

/** One select per role, listing the table's columns. */
export function ColumnPicker<K extends string>({ table, specs, choice, resolved, onChange, readOnly }: {
  table: DataTableModel;
  specs: RoleSpec<K>[];
  choice: ColumnChoice<K>;
  resolved: ColumnIndex<K>;
  onChange: (c: ColumnChoice<K>) => void;
  readOnly?: boolean;
}) {
  const names = columnNames(table);
  return (
    <div className="column-picker">
      {specs.map((s) => {
        const i = resolved[s.key];
        const value = i >= 0 ? names[i] : "";
        return (
          <label key={s.key} className="field">
            <span>{s.label}{s.required ? "" : " (optional)"}</span>
            <select value={value} disabled={readOnly}
              aria-invalid={s.required && i < 0 ? true : undefined}
              onChange={(e) => onChange({ ...choice, [s.key]: e.target.value })}>
              <option value="">{s.required ? "Choose a column" : "None"}</option>
              {names.map((n, j) => <option key={`${n}-${j}`} value={n}>{n}</option>)}
            </select>
            {s.hint && <span className="field-note">{s.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** Buttons that open the linked tables an assay already feeds. */
export function LinkedOutputs({ outputs, onMake, makeLabel = "Make the linked tables", hint }: {
  outputs: DataSheet[];
  onMake?: () => void;
  makeLabel?: string;
  hint?: ReactNode;
}) {
  const { select } = useProject();
  return (
    <div className="assay-outputs">
      {outputs.map((d) => (
        <button key={d.id} type="button" className="assay-link-btn" onClick={() => select(d.id)}>
          Open “{d.name}”
        </button>
      ))}
      {onMake && (
        <button type="button" className="assay-link-btn" onClick={onMake}>{makeLabel}</button>
      )}
      {hint && <span className="hint-block">{hint}</span>}
    </div>
  );
}

/** Steps of a module rendered one under another (the controls panel uses
 *  the wizard's step forms this way). */
export function StepStack({ sections }: { sections: { title: string; body: ReactNode }[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          {s.body}
        </section>
      ))}
    </>
  );
}

