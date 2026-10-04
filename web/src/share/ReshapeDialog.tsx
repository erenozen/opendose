import { lazy, Suspense, useMemo, useState } from "react";
import { useProject } from "../app/context";
// factory -> registry -> sheets -> this dialog is a module cycle; addFamily
// is only called from an event handler, never while modules evaluate.
import { addFamily } from "../app/factory";
import Modal from "../components/Modal";
import { newId } from "../project/ids";
import type { DataSheet } from "../project/types";
import { recipeById, type Staged } from "./recipes/presets";
import { longMatrix, longToMultivariable, tableToLong } from "./tidy";
import "./share.css";

const RecipeDialog = lazy(() => import("./RecipeDialog"));

/**
 * Reshape any table. A wide table (one column per group, replicates side
 * by side) becomes a long table in one click: a multiple-variables table
 * with one observation per row and its group, replicate, X or row title
 * written out. A long table (multiple variables) becomes a wide one: pick
 * the value, group and replicate columns and the table type, with the
 * same aggregation step the import recipes have.
 */
export default function ReshapeDialog({ sheet, onClose }: { sheet: DataSheet; onClose: () => void }) {
  const { apply, select } = useProject();
  const t = sheet.table;
  const long = useMemo(() => (t.type === "multivariable" ? null : tableToLong(t)), [t]);
  const [name, setName] = useState(`${sheet.name} (long)`);

  const staged = useMemo((): Staged | null => {
    if (t.type !== "multivariable") return null;
    const l = tableToLong(t);
    // The long table's own columns, roles guessed from their names.
    const headers = l.headers.slice(1);
    const rows = l.rows.map((r) => r.slice(1));
    const s = recipeById("tidy").stage([headers, ...rows]);
    return { ...s, name: `${sheet.name} (wide)`, notes: [] };
  }, [t, sheet.name]);

  if (staged) {
    return (
      <Suspense fallback={null}>
        <RecipeDialog staged={staged} title={`Reshape “${sheet.name}” to a wide table`} onClose={onClose} />
      </Suspense>
    );
  }

  const create = () => {
    if (!long) return;
    let id = "";
    apply((p) => {
      const r = addFamily(p, longToMultivariable(long), name.trim() || `${sheet.name} (long)`, newId);
      id = r.dataId;
      return r.project;
    });
    if (id) select(id);
    onClose();
  };
  const m = long ? longMatrix(long) : [];

  return (
    <Modal title={`Reshape “${sheet.name}” to a long table`} className="modal-wide" onClose={onClose}
      onSubmit={create}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!long?.rows.length}>
            Create long table
          </button>
        </>
      }>
      <p className="modal-text">
        One row per observation, with its keys written out as columns. The
        new table is a multiple-variables table, ready for regression or for
        export to R or Python; reshape it again to make any wide table.
        This table stays as it is.
      </p>
      <label className="field">
        <span>New table name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {m.length > 1 ? (
        <div className="import-preview" tabIndex={0} aria-label="The long table to be created">
          <table>
            <thead><tr>{m[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {m.slice(1, 11).map((r, ri) => (
                <tr key={ri}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="field-note">This table has no values to reshape yet.</p>}
      <p className="import-summary" role="status">
        {long ? `${long.rows.length} observation${long.rows.length === 1 ? "" : "s"}, `
          + `${long.headers.length} columns` : ""}
      </p>
    </Modal>
  );
}
