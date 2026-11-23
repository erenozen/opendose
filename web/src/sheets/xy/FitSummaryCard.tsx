// The fit summary above the per-curve cards (P-17): one typeset row per
// data set, sortable, with each fit's caveats and their reasons, and the
// linked table of parameters. Cells are the cards' own words
// (fitCells.ts through fitSummary.ts).
import { useId, useState } from "react";
import { useProject } from "../../app/context";
import { useLinkedTable } from "../../app/linkedTable";
import { findSheet } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import { Button, NumText } from "../../components/ui";
import { RangeValueCell } from "./rangeFlags";
import {
  PARAMETERS_OUTPUT, fitSummary, parametersTable, parseSort, sortChoices, sortRows,
  type SummaryRow,
} from "./fitSummary";

/** The flags cell: the caveats' names; their reasons follow the table. */
function flagsText(row: SummaryRow): string {
  if (row.error) return "Could not fit";
  return row.caveats.length ? row.caveats.map((c) => c.label).join(", ") : "None";
}

/** Under the table: each flagged data set with the reason for each flag. */
function Reasons({ rows }: { rows: SummaryRow[] }) {
  const flagged = rows.filter((r) => r.error || r.caveats.length);
  if (!flagged.length) return null;
  return (
    <div className="fit-summary-reasons">
      {flagged.flatMap((r) => (r.error
        ? [<p key={`${r.index}-error`} className="caveat-note"><strong>{r.name}</strong>:{" "}
          <NumText text={`${r.error}.`} /></p>]
        : r.caveats.map((c) => (
          <p key={`${r.index}-${c.kind}`} className={`caveat-note caveat-${c.kind}`}>
            <strong>{r.name}, {c.label.toLowerCase()}</strong>: <NumText text={c.reason} />
          </p>
        ))))}
    </div>
  );
}

function LinkedTableRow({ result, sheet, xUnit }: { result: unknown; sheet: ResultsSheet; xUnit: string }) {
  const { project, select } = useProject();
  const linked = useLinkedTable(sheet.id, PARAMETERS_OUTPUT);
  const parentName = findSheet(project, sheet.parentId)?.name ?? "table";
  const table = parametersTable(result, xUnit);
  if (!table) return null;
  return (
    <div className="copy-table-row">
      {linked.outputs.map((d) => (
        <Button key={d.id} onClick={() => select(d.id)}>Open “{d.name}”</Button>
      ))}
      {!linked.outputs.length && (
        <Button onClick={() => linked.create(table, `Parameters of ${parentName}`)}>
          Make a table of parameters
        </Button>
      )}
      <span className="hint-block">
        A column table with one row per data set and one column per best-fit value, for CSV,
        graphs and tests. It follows the data and these settings. Values the results do not
        report (an IC50 beyond the doses tested, an ambiguous fit) are empty cells.
      </span>
    </div>
  );
}

export function FitSummaryCard({ sheet, result, xUnit }: {
  sheet: ResultsSheet; result: unknown; xUnit: string;
}) {
  const id = useId();
  const [sortValue, setSortValue] = useState("order");
  const s = fitSummary(result, xUnit);
  if (!s) return null;
  const choices = sortChoices(s);
  const value = choices.some((c) => c.value === sortValue) ? sortValue : "order";
  const sort = parseSort(value);
  const rows = sortRows(s.rows, sort);
  const sortedCol = "dir" in sort ? sort.by : null;
  const ariaSort = (colId: string) => (colId === sortedCol && "dir" in sort
    ? (sort.dir === "asc" ? "ascending" : "descending") : undefined);
  return (
    <div className="result-card fit-summary">
      <h3 id={`${id}-title`}>Summary of the fits</h3>
      <label className="check-row fit-summary-sort">
        <span>Sort rows by</span>
        <select value={value} onChange={(e) => setSortValue(e.target.value)}>
          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <div className="fit-summary-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-title`}>
        <table className="results-table fit-summary-table" aria-labelledby={`${id}-title`}>
          <thead>
            <tr>
              <th scope="col">Data set</th>
              {s.columns.map((c) => <th key={c.id} scope="col" aria-sort={ariaSort(c.id)}>{c.label}</th>)}
              <th scope="col">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index}>
                <th scope="row">{r.name}</th>
                {s.columns.map((c) => {
                  const e = c.param ? r.fit?.params[c.param] : undefined;
                  const text = r.cells[c.id]?.text ?? "—";
                  return c.kind === "value" && e && c.param
                    ? <RangeValueCell key={c.id} name={c.param} e={e} fit={r.fit}
                      fallback={<td>{text}</td>} />
                    : <td key={c.id}>{text}</td>;
                })}
                <td className={r.error || r.caveats.length ? "fit-summary-flagged" : undefined}>
                  {flagsText(r)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Reasons rows={rows} />
      <LinkedTableRow result={result} sheet={sheet} xUnit={xUnit} />
    </div>
  );
}
