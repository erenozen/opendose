// Write or change the formula of a calculated column (project/calculated.ts).
// The formula is checked by the engine as it is typed (unknown names,
// syntax), and the column's values are filled by app/useCalculatedSync.
import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { analyzeAsync } from "../../lib/engine";
import { isCalculated, letterOf } from "../../project/calculated";
import type { DataTableModel } from "../../project/types";

export default function FormulaColumnDialog({ table, dataset, isNew, onSave, onStop, onClose }: {
  table: DataTableModel;
  /** The calculated column (an index into table.datasets). */
  dataset: number;
  isNew: boolean;
  onSave: (formula: string, name: string) => void;
  /** Stop calculating: keep the values as typed values. */
  onStop?: () => void;
  onClose: () => void;
}) {
  const d = table.datasets[dataset];
  const [formula, setFormula] = useState(d?.formula ?? "");
  const [name, setName] = useState(d?.name ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  // what the formula may use: the other columns by letter and name, and X
  const refs = table.datasets.map((c, i) => ({ i, c })).filter(({ i }) => i !== dataset)
    .map(({ i, c }) => ({ letter: letterOf(i), name: c.name.trim(), calc: isCalculated(c) && i < dataset,
      later: isCalculated(c) && i > dataset }));
  const known = [...refs.filter((r) => !r.later).flatMap((r) => [r.letter, r.name].filter(Boolean)),
    ...(table.type === "xy" ? ["X"] : [])];
  useEffect(() => {
    const f = formula.trim();
    if (!f) { setProblem(null); return; }
    let live = true;
    const t = setTimeout(() => {
      analyzeAsync({ analysis: "formula_transform", data: {},
        options: { mode: "validate", formula: f, known_names: known, program: false } })
        .then((r) => {
          if (!live) return;
          const res = r as { ok?: boolean; errors?: { text: string }[]; error?: string };
          setProblem(res.error ? String(res.error)
            : res.ok ? null : (res.errors ?? []).map((e) => e.text).join("; "));
        })
        .catch(() => { /* engine busy or cancelled: check on the next keystroke */ });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula]);
  const braced = (n: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `{${n}}`);
  return (
    <Modal title={isNew ? "New calculated column" : "Calculated column"} onClose={onClose}
      onSubmit={() => { if (formula.trim() && !problem) onSave(formula.trim(), name.trim() || d?.name || ""); }}
      actions={
        <>
          {onStop && <button type="button" onClick={onStop}
            title="The column keeps its current values as ordinary typed values">Stop calculating</button>}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!formula.trim() || !!problem}>
            {isNew ? "Add column" : "Save"}</button>
        </>
      }>
      <label className="field">
        <span>Column name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Calculated column name" />
      </label>
      <label className="field">
        <span>Formula (column {letterOf(dataset)} =)</span>
        <input className="formula-input" value={formula} autoFocus spellCheck={false}
          aria-label="Formula of the calculated column" placeholder="e.g. A + B"
          onChange={(e) => setFormula(e.target.value)} />
      </label>
      {problem && <p className="results-error" role="alert">{problem}</p>}
      <p className="hint-block">
        Use the other columns by letter or by name
        {refs.length > 0 && <>: {refs.filter((r) => !r.later).map((r) => (
          <code key={r.letter}>{r.letter}{r.name && r.name !== r.letter ? ` / ${braced(r.name)}` : ""}</code>
        )).reduce<React.ReactNode[]>((acc, el, k) => (k ? [...acc, ", ", el] : [el]), [])}</>}
        {table.type === "xy" ? <>, and <code>X</code></> : null}. Examples: <code>A + B</code>,{" "}
        <code>100 * B / A</code>, <code>LOG(A)</code>, <code>A - GROUPFIRST(A, Subject)</code>,{" "}
        <code>100 * Y / GROUPSUM(Y, Group)</code>, <code>MEANIF(Y, Group = "Control")</code>.
        The values are recalculated whenever those columns change; names keep working when
        columns are moved, letters follow the position. With replicates, each subcolumn is
        calculated from the same subcolumn of the other columns.
        {refs.some((r) => r.later) && " Calculated columns to the right of this one are not available to it."}
      </p>
    </Modal>
  );
}
