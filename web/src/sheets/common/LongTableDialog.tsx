import { useMemo, useState } from "react";
import { useProject } from "../../app/context";
import Modal from "../../components/Modal";
import { findSheet, sheetsOfKind, updateResultsOptions, updateTable } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import {
  fillFromLong, guessPositive, guessRoles, levelsOf, parseLongText, previewMatrix,
  sourceFromVariables, TARGET_ROLES, type LongSource, type LongTarget, type Roles,
} from "./longTable";
import "./grid.css";

const TITLES: Record<LongTarget, string> = {
  cmh: "Stratified tables from a long table",
  roc: "ROC data from a long table",
  quantal: "Quantal dose-response data from a long table",
  xy: "Curves from a long table",
  nested2: "Nested two-factor data from a long table",
};

const INTROS: Record<LongTarget, string> = {
  cmh: "One record per combination of stratum, row level and column level with its count, or one "
    + "record per subject (leave Count empty). Each stratum becomes a block of rows titled "
    + "“Stratum: level”.",
  roc: "One record per subject with the marker value and the status. Subjects with the chosen "
    + "status fill the first column (condition present), all others the second (controls).",
  quantal: "One record per dose group: the dose, how many subjects were treated and how many "
    + "responded, and optionally the group (one curve per group). Dose 0 rows are kept as the "
    + "control.",
  xy: "One record per point: which data set (curve) it belongs to, X and Y. Each data set "
    + "becomes one Y column; points that share an X sit side by side as replicates.",
  nested2: "One record per value (a cell, a well, a read): the value, its level of the row factor and "
    + "of the data-set factor, and the unit it comes from (animal, litter, culture). Each level of "
    + "the row factor becomes a block of rows and each unit a subcolumn, its values down the block.",
};

type SrcKind = "paste" | "file" | "table";

/** Map the columns of a long table to the roles an analysis needs, preview
 *  the table that results and fill the analysed data table with it (one
 *  undo step, the analysis' options adjusted to the new layout). */
export default function LongTableDialog({ target, sheet, onClose }: {
  target: LongTarget; sheet: ResultsSheet; onClose: () => void;
}) {
  const { project, apply } = useProject();
  const parent = findSheet(project, sheet.parentId);
  const base = parent?.kind === "data" ? parent.table : null;
  const variables = useMemo(() => sheetsOfKind(project, "data")
    .filter((s) => s.table.type === "multivariable" && s.id !== sheet.parentId), [project, sheet.parentId]);
  const [kind, setKind] = useState<SrcKind>("paste");
  const [text, setText] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [tableId, setTableId] = useState(variables[0]?.id ?? "");
  const [override, setOverride] = useState<Roles>({});
  const [positive, setPositive] = useState<string | null>(null);

  const src = useMemo((): LongSource | { error: string } => {
    if (kind === "table") {
      const s = variables.find((v) => v.id === tableId);
      return s ? sourceFromVariables(s.table) : { error: "Choose a multiple-variables table." };
    }
    return parseLongText(kind === "file" ? fileText : text);
  }, [kind, text, fileText, tableId, variables]);

  const ready = !("error" in src);
  const guessed = useMemo(() => (ready ? guessRoles(src, target) : {}), [src, ready, target]);
  const roles: Roles = { ...guessed, ...override };
  const levels = ready && target === "roc" ? levelsOf(src, roles.status ?? -1) : [];
  const pos = positive !== null && levels.includes(positive) ? positive : guessPositive(levels);
  const fill = ready && base ? fillFromLong(target, src, roles, pos, base) : null;
  const preview = fill && "table" in fill ? previewMatrix(fill.table) : [];

  const reset = () => { setOverride({}); setPositive(null); };
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setFileText(await f.text());
    reset();
  };
  const readClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
      reset();
    } catch {
      /* clipboard refused: the user pastes by hand */
    }
  };

  const submit = () => {
    if (!fill || !("table" in fill)) return;
    const table = fill.table;
    const patch = fill.options;
    apply((p) => {
      let q = updateTable(p, sheet.parentId, () => table);
      if (patch) {
        q = updateResultsOptions(q, sheet.id,
          (o) => ({ ...(o && typeof o === "object" ? o : {}), ...patch }));
      }
      return q;
    });
    onClose();
  };

  const headers = ready ? src.headers : [];
  const columnSelect = (key: string, label: string, optional?: boolean) => (
    <label className="field" key={key}>
      <span>{label}{optional ? " (optional)" : ""}</span>
      <select value={roles[key] ?? -1} aria-label={label}
        onChange={(e) => { setOverride({ ...override, [key]: Number(e.target.value) }); }}>
        {optional || !(roles[key] >= 0) ? (
          <option value={-1}>{optional
            ? (key === "count" ? "None: one record per subject" : "None") : "Choose a column"}</option>
        ) : null}
        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
      </select>
    </label>
  );

  return (
    <Modal title={TITLES[target]} className="modal-wide long-table-dialog" onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!fill || !("table" in fill)}>
            Fill the table
          </button>
        </>
      }>
      <p className="modal-text">{INTROS[target]}</p>
      <fieldset className="field-radios">
        <legend>Read from</legend>
        <label><input type="radio" name="long-src" checked={kind === "paste"}
          onChange={() => { setKind("paste"); reset(); }} /> Pasted text</label>
        <label><input type="radio" name="long-src" checked={kind === "file"}
          onChange={() => { setKind("file"); reset(); }} /> A file (CSV, TSV or text)</label>
        {variables.length > 0 && (
          <label><input type="radio" name="long-src" checked={kind === "table"}
            onChange={() => { setKind("table"); reset(); }} /> A multiple-variables table in this project</label>
        )}
      </fieldset>
      {kind === "paste" && (
        <label className="field">
          <span>Long table (first row: column titles)</span>
          <textarea rows={6} value={text} spellCheck={false} aria-label="Long table text"
            placeholder={"stratum,exposure,outcome,count\nA,yes,case,12\n…"}
            onChange={(e) => { setText(e.target.value); reset(); }} />
          <span className="field-note">
            Paste here, or <button type="button" className="linkish"
              onClick={() => { void readClipboard(); }}>read the clipboard</button>.
          </span>
        </label>
      )}
      {kind === "file" && (
        <label className="field">
          <span>File{fileName ? `: ${fileName}` : ""}</span>
          <input type="file" aria-label="Long table file"
            accept=".csv,.tsv,.txt,.tab,.dat,text/csv,text/plain"
            onChange={(e) => { void pickFile(e.target.files?.[0]); }} />
        </label>
      )}
      {kind === "table" && (
        <label className="field">
          <span>Table</span>
          <select value={tableId} aria-label="Multiple-variables table"
            onChange={(e) => { setTableId(e.target.value); reset(); }}>
            {variables.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}
      {ready && (
        <div className="field-row">
          {TARGET_ROLES[target].map((r) => columnSelect(r.key, r.label, r.optional))}
          {target === "roc" && levels.length > 0 && (
            <label className="field">
              <span>Condition present when the status is</span>
              <select value={pos} aria-label="Condition present when the status is"
                onChange={(e) => setPositive(e.target.value)}>
                {levels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {"error" in src && (kind !== "paste" || text.trim()) && (kind !== "file" || fileText)
        ? <p className="field-note">{src.error}</p> : null}
      {fill && "error" in fill && <p className="field-note long-table-error" role="alert">{fill.error}</p>}
      {preview.length > 1 && (
        <div className="import-preview" tabIndex={0} aria-label="Preview of the filled table">
          <table>
            <thead><tr>{preview[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {preview.slice(1).map((r, ri) => (
                <tr key={ri}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {fill && "table" in fill && (
        <>
          <p className="import-summary" role="status">{fill.summary}</p>
          {fill.notes.map((n) => <p key={n} className="field-note">{n}</p>)}
          <p className="field-note">
            This replaces the values in “{parent?.name}”; Undo restores them.
          </p>
        </>
      )}
    </Modal>
  );
}
