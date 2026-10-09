import { useMemo, useState } from "react";
import Modal from "../../components/Modal";
import {
  checkConversion, columnToGrouped, groupedToColumn, hasStackedRows, longToColumn, longToGrouped,
  stackReplicates, toLong, unstackReplicates, type ConversionCheck,
} from "../../project/convertType";
import { flatColumns } from "../../project/table";
import type { DataTableModel, TableType } from "../../project/types";
import "./dataNotes.css";

interface Choice {
  id: string;
  label: string;
  note: string;
  /** Short tag for the new table's name. */
  tag: string;
}

const TYPE_NAMES: Record<TableType, string> = {
  xy: "XY", column: "Column", grouped: "Grouped", contingency: "Contingency",
  survival: "Survival", partsofwhole: "Parts of whole", multivariable: "Multiple variables",
  nested: "Nested",
};

/** The conversions a table offers (empty: none). */
function convertChoices(t: DataTableModel): Choice[] {
  const reps = t.subcolumnFormat === "replicates";
  const long: Choice = { id: "long", tag: "long", label: "Multiple variables, one value per row (long)",
    note: t.type === "grouped" ? "Columns for the row, the data set, the replicate (subject) and the value."
      : t.type === "xy" ? "Columns for X, the data set, the replicate and the value."
        : "Columns for the group, the row (subject) and the value: pairs stay linked by their row." };
  switch (t.type) {
    case "column": return [
      { id: "grouped-rows", tag: "grouped", label: "Grouped table, same rows",
        note: "Each group becomes a data set and every row stays a row, so paired or matched values stay together." },
      ...(reps ? [
        { id: "grouped-one-row", tag: "grouped, side by side", label: "Grouped table, each group's values side by side in one row",
          note: "Row r becomes subcolumn r of every data set (stacked → side by side): subjects stay matched across data sets." },
        { id: "grouped-groups-as-rows", tag: "grouped, groups as rows", label: "Grouped table, groups as rows",
          note: "Each group becomes a row of one data set, its values side by side (row r → subcolumn r)." },
      ] : []),
      ...(reps ? [long] : []),
    ];
    case "grouped": {
      const single = t.datasets.every((d) => (d.rows[0]?.length ?? 1) === 1);
      return [
        ...(reps ? [
          { id: "column-cells", tag: "column", label: "Column table, one column per row and data set",
            note: "Each cell's replicates run down one column; replicate (subject) s stays in row s." },
          { id: "column-datasets", tag: "column, stacked", label: "Column table, one column per data set (replicates stacked)",
            note: "Side by side → stacked: each row's replicates follow one another down the column; the same position in every data set shares a row." },
        ] : []),
        ...(!reps || single ? [{ id: "column-rows", tag: "column", label: "Column table, same rows",
          note: "Each data set becomes a group and every row stays a row." }] : []),
        ...(reps && hasStackedRows(t) ? [{ id: "unstack", tag: "side by side", label: "Grouped table, replicates side by side",
          note: "Consecutive rows with the same title become one row, their values side by side." }] : []),
        ...(reps ? [long] : []),
      ];
    }
    case "xy": return [
      ...(reps && t.datasets.some((d) => (d.rows[0]?.length ?? 1) > 1) ? [{ id: "stack", tag: "stacked",
        label: "XY table, replicates stacked (one row per value)",
        note: "Each X's replicates become consecutive rows with the same X." }] : []),
      ...(reps && hasStackedRows(t) ? [{ id: "unstack", tag: "side by side", label: "XY table, replicates side by side",
        note: "Consecutive rows with the same X become one row, their values side by side." }] : []),
      ...(reps ? [long] : []),
    ];
    case "multivariable": return [
      { id: "mv-column", tag: "column", label: "Column table (one column per level of a variable)",
        note: "Pick the values, the variable whose levels become the columns and, for paired data, the subject that shares a row." },
      { id: "mv-grouped", tag: "grouped", label: "Grouped table (rows and data sets from two variables)",
        note: "Pick the values, the row factor, the data-set factor and, for repeated measures, the subject (one subcolumn per subject)." },
    ];
    default: return [];
  }
}

/**
 * "Convert table to…": a new table in another type or layout with every
 * value, exclusion and pairing kept (project/convertType.ts). The dialog
 * says how many values and exclusions were carried over, checked against
 * the original, and the original table never changes.
 */
export default function ConvertTypeDialog({ table, name, onCreate, onClose }: {
  table: DataTableModel;
  name: string;
  onCreate: (t: DataTableModel, name: string) => void;
  onClose: () => void;
}) {
  const choices = useMemo(() => convertChoices(table), [table]);
  const [choice, setChoice] = useState(choices[0]?.id ?? "");
  const current = choices.find((c) => c.id === choice) ?? choices[0];
  const vars = table.type === "multivariable" ? table.datasets.map((d, i) => ({ i, name: d.name, cat: d.varType === "categorical" })) : [];
  const firstCont = vars.find((v) => !v.cat)?.i ?? 0;
  const cats = vars.filter((v) => v.cat);
  const [valueVar, setValueVar] = useState(firstCont);
  const [groupVar, setGroupVar] = useState(cats[0]?.i ?? 0);
  const [rowVar, setRowVar] = useState<number | null>(cats[1]?.i ?? null);
  const [subjectVar, setSubjectVar] = useState<number | null>(null);
  const [newName, setNewName] = useState("");

  const built = useMemo((): { table: DataTableModel; check: ConversionCheck; skipped: number[] } | null => {
    if (!current) return null;
    let out: DataTableModel;
    let skipped: number[] = [];
    let opts: { beforeVars?: number[]; afterVars?: number[] } = {};
    switch (current.id) {
      case "grouped-rows": out = columnToGrouped(table, "rows"); break;
      case "grouped-one-row": out = columnToGrouped(table, "one-row"); break;
      case "grouped-groups-as-rows": out = columnToGrouped(table, "groups-as-rows"); break;
      case "column-cells": out = groupedToColumn(table, "cells"); break;
      case "column-datasets": out = groupedToColumn(table, "datasets"); break;
      case "column-rows": out = groupedToColumn(table, "rows"); break;
      case "stack": out = stackReplicates(table); break;
      case "unstack": out = unstackReplicates(table); break;
      case "long": {
        out = toLong(table);
        opts = { afterVars: out.datasets.map((d, i) => (d.varType === "continuous" && !(table.type === "xy" && i === 0)
          ? i : -1)).filter((i) => i >= 0) };
        break;
      }
      case "mv-column": {
        const r = longToColumn(table, { value: valueVar, group: groupVar, rows: rowVar });
        out = r.table; skipped = r.skipped; opts = { beforeVars: [valueVar] };
        break;
      }
      case "mv-grouped": {
        const r = longToGrouped(table, { value: valueVar, group: groupVar, rows: rowVar, subject: subjectVar });
        out = r.table; skipped = r.skipped; opts = { beforeVars: [valueVar] };
        break;
      }
      default: return null;
    }
    return { table: out, check: checkConversion(table, out, opts), skipped };
  }, [current, table, valueVar, groupVar, rowVar, subjectVar]);

  if (!current) {
    return (
      <Modal title="Convert table to…" onClose={onClose}
        actions={<button type="button" onClick={onClose}>Close</button>}>
        <p className="modal-text">This table type has no other layout to convert to.</p>
      </Modal>
    );
  }
  const target = built?.table;
  const defaultName = `${name} (${current.tag})`;
  const varSelect = (label: string, value: number | null, set: (v: number | null) => void,
    opts: { optional?: boolean; categorical?: boolean } = {}) => (
      <label className="field">
        <span>{label}</span>
        <select aria-label={label} value={value === null ? "" : String(value)}
          onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}>
          {opts.optional && <option value="">None</option>}
          {vars.filter((v) => (opts.categorical === undefined ? true : v.cat === opts.categorical))
            .map((v) => <option key={v.i} value={v.i}>{v.name}</option>)}
        </select>
      </label>
  );
  const check = built?.check;
  const pairing = current.id === "grouped-rows" || current.id === "column-rows"
    ? "Every row stays a row." : current.id === "grouped-one-row"
      ? "Row r of every group is subcolumn r of every data set." : current.id === "column-cells"
        ? "Replicate s of every cell is row s." : current.id === "column-datasets"
          ? "The same position in every data set shares a row." : "";
  const preview = target ? previewRows(target) : null;

  return (
    <Modal title="Convert table to…" className="modal-wide convert-type-dialog" onClose={onClose}
      onSubmit={() => { if (target) onCreate(target, newName.trim() || defaultName); }}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!target}>Create new table</button>
        </>
      }>
      <p className="modal-text">
        A new {TYPE_NAMES[target?.type ?? table.type].toLowerCase()} table with the same values;
        this table stays as it is, with its analyses and graphs.
      </p>
      <fieldset className="field-radios">
        <legend>New table</legend>
        {choices.map((c) => (
          <label key={c.id}>
            <input type="radio" name="convert-type" checked={c.id === current.id}
              onChange={() => setChoice(c.id)} />
            <span>{c.label}<span className="option-note">{c.note}</span></span>
          </label>
        ))}
      </fieldset>
      {(current.id === "mv-column" || current.id === "mv-grouped") && (
        <div className="field-row">
          {varSelect("Values", valueVar, (v) => setValueVar(v ?? firstCont))}
          {varSelect(current.id === "mv-column" ? "Columns from" : "Data sets from", groupVar,
            (v) => setGroupVar(v ?? 0), { categorical: true })}
          {varSelect(current.id === "mv-column" ? "Rows (subject) from" : "Rows from", rowVar, setRowVar,
            { optional: true, categorical: true })}
          {current.id === "mv-grouped" && varSelect("Subcolumns (subject) from", subjectVar, setSubjectVar,
            { optional: true, categorical: true })}
        </div>
      )}
      <label className="field">
        <span>New table name</span>
        <input value={newName} placeholder={defaultName} aria-label="New table name"
          onChange={(e) => setNewName(e.target.value)} />
      </label>
      {check && (
        <p className={`convert-check${check.ok ? "" : " bad"}`} role="status">
          {check.ok
            ? `All ${check.values} value${check.values === 1 ? "" : "s"}${check.excluded
              ? ` and ${check.excluded} exclusion${check.excluded === 1 ? "" : "s"}` : ""} carried over.`
            : `${check.lost.length} of ${check.values} values could not be placed`
              + `${built?.skipped.length ? ` (row${built.skipped.length === 1 ? "" : "s"} `
                + `${built.skipped.slice(0, 8).map((r) => r + 1).join(", ")} have a blank key)` : ""}.`}
          {pairing && ` ${pairing}`}
        </p>
      )}
      {preview && (
        <div className="convert-preview" tabIndex={0} aria-label="Preview of the new table">
          <table>
            <thead>
              <tr>{preview.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i}>{r.map((v, k) => <td key={k}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** The first rows and columns of a table, as the grid lays them out. */
function previewRows(t: DataTableModel): { head: string[]; rows: string[][] } {
  const cols = flatColumns(t).slice(0, 10);
  const head = cols.map((c) => c.kind === "x" ? t.xTitle || "X" : c.kind === "rowTitle" ? "Row title"
    : `${t.datasets[c.dataset].name}${(t.datasets[c.dataset].rows[0]?.length ?? 1) > 1
      ? ` · ${t.datasets[c.dataset].subTitles?.[c.sub] || `Y${c.sub + 1}`}` : ""}`);
  const rows = t.x.slice(0, 8).map((_, r) => cols.map((c) => {
    if (c.kind === "x") return t.x[r];
    if (c.kind === "rowTitle") return t.rowTitles[r];
    const d = t.datasets[c.dataset];
    const v = d.rows[r]?.[c.sub] ?? "";
    return v && d.excluded?.includes(`${r}:${c.sub}`) ? `${v}*` : v;
  }));
  return { head, rows };
}
