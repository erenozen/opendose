// "Leave out of this analysis…" (P-68): one value of the table left out
// of one results sheet's analysis, with a reason, as a sensitivity
// analysis. Opened from the Exclusions block (keyboard and touch: pick the
// data set, row and subcolumn) or by clicking a point on an XY graph
// (the data set and row come from the point). The table is not changed;
// the reason is required (project/leftOut.ts).
import { useId, useMemo, useState } from "react";
import { useProject } from "../app/context";
import Modal from "../components/Modal";
import { Button, Field, Input, NumberField, notify } from "../components/ui";
import { cellWhere, MAX_REASON_LENGTH, PRESET_REASONS } from "../project/exclusions";
import { leftOutProblem, withLeftOut } from "../project/leftOut";
import type { DataTableModel, ResultsSheet } from "../project/types";
import "./integrity.css";

/** The first subcolumn of a row that can be left out (0 when none). */
function firstOpenSub(t: DataTableModel, dataset: number, row: number,
  sheet: ResultsSheet): number {
  const n = t.datasets[dataset]?.rows[row]?.length ?? 1;
  for (let s = 0; s < n; s++) {
    if (!leftOutProblem(t, { dataset, row, sub: s }, sheet.leftOut)) return s;
  }
  return 0;
}

export default function LeaveOutDialog({ sheet, table, initial, onClose }: {
  sheet: ResultsSheet;
  /** The data table as entered. */
  table: DataTableModel;
  /** A data set and row picked on a graph. */
  initial?: { dataset: number; row: number };
  onClose: () => void;
}) {
  const { apply } = useProject();
  const ids = { ds: useId(), sub: useId(), list: useId() };
  const [dataset, setDataset] = useState(String(initial?.dataset ?? 0));
  const [row, setRow] = useState(initial ? String(initial.row + 1) : "");
  const [sub, setSub] = useState(() => String(initial
    ? firstOpenSub(table, initial.dataset, initial.row, sheet) : 0));
  const [reason, setReason] = useState("");
  const [attempts, setAttempts] = useState(0);

  const di = Number(dataset);
  const ds = table.datasets[di];
  const subs = Math.max(1, ...table.datasets.map((d) => d.rows[0]?.length ?? 1));
  const r = /^\d+$/.test(row.trim()) ? Number(row.trim()) - 1 : -1;
  const si = Number(sub);
  const cell = { dataset: di, row: r, sub: si };
  const rowProblem = row.trim() === "" ? `Enter a row from 1 to ${table.x.length}`
    : r < 0 || r >= table.x.length ? `Enter a row from 1 to ${table.x.length}`
      : leftOutProblem(table, cell, sheet.leftOut);
  const reasonProblem = reason.trim() ? null : "Enter why this value is left out";
  const value = !rowProblem ? ds.rows[r][si] : null;
  const where = !rowProblem ? `${ds.name.trim() || `Data set ${di + 1}`}, ${cellWhere(table, di, r, si)}` : "";
  const subName = (s: number) => ds?.subTitles?.[s]?.trim() || `Y${s + 1}`;
  const names = useMemo(() => table.datasets.map((d, i) => d.name.trim() || `Data set ${i + 1}`),
    [table.datasets]);

  const submit = () => {
    if (rowProblem || reasonProblem) { setAttempts((n) => n + 1); return; }
    apply((p) => withLeftOut(p, sheet.id, [cell], reason));
    notify(`Left ${where} (${value}) out of “${sheet.name}” only: ${reason.trim()}.`, { tone: "success" });
    onClose();
  };

  return (
    <Modal title="Leave a value out of this analysis" className="leave-out-dialog"
      onClose={onClose} onSubmit={submit}
      actions={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Leave out</Button>
        </>
      )}>
      <p className="modal-text">
        Only “{sheet.name}” leaves the value out. It stays in the table, in its graphs and in
        every other analysis, and these results list it with your reason next to the results
        with it put back.
      </p>
      <div className="leave-out-cell">
        <Field label="Data set" id={ids.ds}>
          <select id={ids.ds} value={dataset}
            onChange={(e) => { setDataset(e.target.value); setSub("0"); }}>
            {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
          </select>
        </Field>
        <NumberField label="Row" value={row} onValueChange={setRow} integer min={1}
          max={table.x.length} required error={row.trim() ? rowProblem || null : null}
          submitCount={attempts} autoComplete="off" />
        {subs > 1 && (
          <Field label="Subcolumn" id={ids.sub}>
            <select id={ids.sub} value={sub} onChange={(e) => setSub(e.target.value)}>
              {Array.from({ length: ds?.rows[0]?.length ?? 1 }, (_, s) => (
                <option key={s} value={s}>{subName(s)}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <p className="field-note leave-out-value" role="status">
        {value !== null ? <>Value: <strong>{value}</strong> ({where})</>
          : row.trim() ? rowProblem : "Choose the value by its data set and row."}
      </p>
      <Field label="Reason" error={reasonProblem} submitCount={attempts}
        description="Stated with the results and in the methods. Leave a value out for a reason you can report, not because of the result it gives.">
        <Input value={reason} list={ids.list} maxLength={MAX_REASON_LENGTH} autoComplete="off"
          onChange={(e) => setReason(e.target.value)} />
      </Field>
      <datalist id={ids.list}>{PRESET_REASONS.map((x) => <option key={x} value={x} />)}</datalist>
    </Modal>
  );
}
