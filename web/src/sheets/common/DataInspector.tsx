import { useMemo } from "react";
import { selectionStats } from "../../project/inspector";
import type { CellRect } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import { formatSig } from "../../types";

/** Under the grid while cells are selected: descriptive numbers for the
 *  selected cells (or, with one cell selected, for its whole column), and
 *  that cell's exclusion with its reason. */
export default function DataInspector({ table, rect, scope, cellNote }: {
  table: DataTableModel;
  rect: CellRect;
  scope: string;           // what the numbers describe, e.g. "Drug A: Y1"
  /** The selected cell's exclusion ("This value is excluded: …"). */
  cellNote?: string;
}) {
  const s = useMemo(() => selectionStats(table, rect), [table, rect]);
  const f = (v: number | null) => (v === null ? "–" : formatSig(v));
  const items: [string, string][] = [
    ["N", String(s.n)],
    ["Mean", f(s.mean)],
    ["SD", f(s.sd)],
    ["SEM", f(s.sem)],
    ["Minimum", f(s.min)],
    ["Maximum", f(s.max)],
    ["Missing", String(s.missing)],
    ["Excluded", String(s.excluded)],
  ];
  if (s.text) items.push(["Not numbers", String(s.text)]);
  return (
    <section className="data-inspector" aria-label="Data inspector">
      <h3>Data inspector <span className="inspector-scope">{scope}</span></h3>
      <dl className="inspector-stats">
        {items.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd data-stat={k}>{v}</dd></div>
        ))}
      </dl>
      {cellNote && <p className="inspector-note">{cellNote}</p>}
    </section>
  );
}
