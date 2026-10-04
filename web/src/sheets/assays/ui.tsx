// Small building blocks shared by the assay panels: result cards, key /
// value and grid tables, labelled controls, notes and the linked-table
// row. Plot plumbing is in ./plotkit.ts. Styles in ./assays.css (tokens only).
import { useCallback, type ReactNode } from "react";
import { useProject } from "../../app/context";
import { addLinkedTable } from "../../app/factory";
import { derivedOutputs } from "../../project/derived";
import { newId } from "../../project/ids";
import { updateResultsOptions } from "../../project/ops";
import type { DataTableModel } from "../../project/types";
import "./assays.css";

export function Card({ title, children, className }: {
  title: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`result-card assay-card${className ? ` ${className}` : ""}`}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function KV({ rows, caption }: { rows: [ReactNode, ReactNode][]; caption?: string }) {
  return (
    <table className="results-table goodness assay-kv">
      {caption && <caption className="sr-only">{caption}</caption>}
      <tbody>
        {rows.map(([k, v], i) => <tr key={i}><th scope="row">{k}</th><td>{v}</td></tr>)}
      </tbody>
    </table>
  );
}

export function Grid({ head, rows, caption, className }: {
  head: ReactNode[]; rows: ReactNode[][]; caption?: string; className?: string;
}) {
  return (
    <div className="results-scroll">
      <table className={`results-table assay-grid${className ? ` ${className}` : ""}`}>
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

export function Problem({ result }: { result: { error?: unknown } | null }) {
  if (!result || !result.error) return null;
  return <div className="results-error" role="alert">{String(result.error)}</div>;
}

export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return <p className={`result-note${warn ? " result-note-warn" : ""}`}>{children}</p>;
}

export function Warnings({ list }: { list: unknown }) {
  if (!Array.isArray(list) || !list.length) return null;
  return <>{list.map((w, i) => <Note key={i} warn>{String(w)}</Note>)}</>;
}

/** A labelled control in a controls panel. */
export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <>
      <label className="check-row"><span>{label}</span>{children}</label>
      {hint && <p className="hint-block">{hint}</p>}
    </>
  );
}

export function Check({ label, checked, onChange, disabled }: {
  label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="check-row assay-check">
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange, hint, disabled }: {
  label: string; value: T; options: readonly (readonly [T, string])[];
  onChange: (v: T) => void; hint?: ReactNode; disabled?: boolean;
}) {
  return (
    <Row label={label} hint={hint}>
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Row>
  );
}

export function TextIn({ label, value, onChange, hint, inputMode = "decimal", width }: {
  label: string; value: string; onChange: (v: string) => void; hint?: ReactNode;
  inputMode?: "decimal" | "numeric" | "text"; width?: number;
}) {
  return (
    <Row label={label} hint={hint}>
      <input aria-label={label} value={value} inputMode={inputMode} style={width ? { width } : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </Row>
  );
}

/** Linked table outputs of a results sheet, with a create button. The new
 *  table's first analysis can be pre-configured (`options`). */
export function LinkedTable({ resultsId, make, name, label, note, options }: {
  resultsId: string;
  make: () => DataTableModel | null;
  name: string;
  label: string;
  note?: ReactNode;
  options?: (table: DataTableModel) => Record<string, unknown> | null;
}) {
  const { project, apply, select, readOnly } = useProject();
  const outputs = derivedOutputs(project, resultsId);
  const create = useCallback(() => {
    const table = make();
    if (!table) return;
    let dataId = "";
    apply((p) => {
      const res = addLinkedTable(p, resultsId, table, name, newId);
      if (!res) return p;
      dataId = res.dataId;
      let next = res.project;
      const patch = options?.(table);
      if (patch) {
        const rs = next.sheets.find((s) => s.kind === "results" && s.parentId === dataId);
        if (rs) {
          next = updateResultsOptions(next, rs.id, (o) => ({
            ...(o && typeof o === "object" ? o : {}), ...patch,
          }));
        }
      }
      return next;
    });
    if (dataId) select(dataId);
  }, [apply, select, resultsId, make, name, options]);
  return (
    <div className="assay-linked">
      <div className="inline-actions">
        {outputs.map((d) => (
          <button key={d.id} type="button" onClick={() => select(d.id)}>Open “{d.name}”</button>
        ))}
        {!readOnly && (
          <button type="button" className={outputs.length ? undefined : "btn-primary"}
            onClick={create}>{label}</button>
        )}
      </div>
      <p className="hint-block">
        {note ?? "The new table is linked: it follows edits to this table and to these "
          + "settings. Unlink it (from its note) to keep its values as ordinary data."}
      </p>
    </div>
  );
}

