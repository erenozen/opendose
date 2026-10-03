import { useRef } from "react";
import type { EditorProps } from "../types";
import {
  addDataset, addRow, deleteDataset, deleteRow, insertRows, isExcluded,
  parseClipboardGrid, pasteBlock, renameDataset, setCell, setRowTitle,
  setSubTitle, setSubcolumnCount, setVarType, setX, tableShape,
  toggleExcluded, type CellRef,
} from "../../project/table";
import type { DataColumn, TableType, VarType } from "../../project/types";

// Default subcolumn header when the user has not titled it.
function subLabel(type: TableType, di: number, s: number): string {
  if (type === "nested") return `${String.fromCharCode(65 + (di % 26))}${s + 1}`;
  if (type === "survival") return ["Time", "Event"][s] ?? `Y${s + 1}`;
  return `Y${s + 1}`;
}

const HINTS: Partial<Record<TableType, string>> = {
  xy: "Paste directly from Excel; tab-separated blocks expand automatically.",
  column: "Each column is one group; enter values down the rows. Paste from Excel works.",
  grouped: "Rows are levels of one factor (title them on the left); columns are levels of the other, with replicates side by side.",
  contingency: "Enter counts (not percentages).",
  survival: "One row per subject: Time, then Event (1 = event, 0 = censored).",
  partsofwhole: "Each row is one part of the whole; title it on the left.",
  multivariable: "One row per observation, one column per variable. Mark each variable continuous or categorical.",
  nested: "Each column is a group; its subcolumns are subgroups (e.g. one per animal), with replicate values down the rows.",
};

/**
 * Generic editor for every table type. Layout, left to right: row number,
 * row titles (grouped / contingency / parts of whole), X (XY), then each
 * dataset's subcolumns. Keyboard: arrows move between cells (left/right
 * once the caret reaches the edge), Enter / Shift+Enter move down / up,
 * Ctrl/Cmd+E excludes or includes the value, Ctrl/Cmd+Shift+Enter
 * inserts a row below.
 */
export default function DataGrid({ sheet, table, readOnly, onChange }: EditorProps) {
  const t = table;
  const shape = tableShape(t.type);
  const nRows = t.x.length;
  const wrap = useRef<HTMLDivElement>(null);
  const subCount = (d: DataColumn) => d.rows[0]?.length ?? 1;
  const numeric = t.type !== "multivariable";
  const showSubhead = shape.hasSubcolumns || t.type === "survival"
    || t.type === "multivariable";

  // flat column index for each visible editable column
  let flat = 0;
  const rowTitleCol = shape.hasRowTitles ? flat++ : -1;
  const xCol = shape.hasX ? flat++ : -1;
  const dsBase = t.datasets.map((d) => {
    const base = flat;
    flat += subCount(d);
    return base;
  });

  const refAt = (r: number, c: number): CellRef | null => {
    if (c === xCol) return { kind: "x", row: r };
    for (let d = 0; d < t.datasets.length; d++) {
      const w = subCount(t.datasets[d]);
      if (c >= dsBase[d] && c < dsBase[d] + w) {
        return { kind: "y", dataset: d, row: r, sub: c - dsBase[d] };
      }
    }
    return null;
  };

  const focusCell = (r: number, c: number) => {
    const el = wrap.current?.querySelector<HTMLInputElement>(
      `input[data-r="${r}"][data-c="${c}"]`);
    if (el) { el.focus(); el.select(); }
  };

  const key = (what: string) => `${sheet.id}:${what}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    const mod = e.ctrlKey || e.metaKey;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length
      && el.selectionEnd === el.value.length;
    if (mod && e.key.toLowerCase() === "e") {
      e.preventDefault();
      const ref = refAt(r, c);
      if (ref && !readOnly) onChange((x) => toggleExcluded(x, ref));
      return;
    }
    if (mod && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      if (!readOnly) {
        onChange((x) => insertRows(x, r + 1, 1));
        requestAnimationFrame(() => focusCell(r + 1, c));
      }
      return;
    }
    let target: [number, number] | null = null;
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) target = [r + 1, c];
    else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) target = [r - 1, c];
    else if (e.key === "ArrowLeft" && (atStart || el.readOnly)) target = [r, c - 1];
    else if (e.key === "ArrowRight" && (atEnd || el.readOnly)) target = [r, c + 1];
    if (!target) return;
    const [tr, tc] = target;
    if (tr < 0 || tr >= nRows || tc < 0 || tc >= flat) return;
    e.preventDefault();
    focusCell(tr, tc);
  };

  const onPaste = (e: React.ClipboardEvent, r: number, c: number) => {
    if (readOnly) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // single value
    e.preventDefault();
    const block = parseClipboardGrid(text);
    onChange((x) => pasteBlock(x, r, c, block));
  };

  const cellInput = (r: number, c: number, value: string,
    set: (v: string) => void, opts: { excluded?: boolean; text?: boolean; label: string }) => (
      <input
        data-r={r} data-c={c}
        inputMode={opts.text ? "text" : "decimal"}
        className={opts.text ? "text-cell" : undefined}
        value={value}
        readOnly={readOnly}
        aria-label={opts.label}
        title={opts.excluded ? "Excluded from analyses and graphs (Ctrl+E to include)" : undefined}
        onChange={(e) => set(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={(e) => onPaste(e, r, c)}
      />
  );

  const datasetHint = HINTS[t.type];

  return (
    <div className={`data-table${readOnly ? " is-readonly" : ""}`} ref={wrap}>
      <table>
        <thead>
          <tr>
            <th className="rownum" />
            {shape.hasRowTitles && (
              <th className="row-label-head" rowSpan={showSubhead ? 2 : 1}>
                {t.type === "contingency" ? "" : "Row title"}
              </th>
            )}
            {shape.hasX && (
              <th className="xhead" rowSpan={showSubhead ? 2 : 1}>
                <input className="ds-name" value={t.xTitle} readOnly={readOnly}
                  aria-label="X column title" placeholder="X"
                  onChange={(e) => onChange((x) => ({ ...x, xTitle: e.target.value }),
                    key("xtitle"))} />
                {t.xFormat !== "numbers" && (
                  <span className="x-format-tag">
                    {t.xFormat === "dates" ? "dates" : "elapsed time"}
                  </span>
                )}
              </th>
            )}
            {t.datasets.map((d, di) => (
              <th key={di} colSpan={subCount(d)} className="group-head">
                <input
                  className="ds-name"
                  value={d.name}
                  readOnly={readOnly}
                  aria-label={`${shape.datasetNoun} ${di + 1} title`}
                  onChange={(e) => onChange((x) => renameDataset(x, di, e.target.value),
                    key(`ds:${di}`))}
                />
                {!readOnly && (
                  <span className="ds-tools">
                    {shape.hasSubcolumns && t.subcolumnFormat === "replicates" && (
                      <>
                        <button title="Remove a subcolumn"
                          aria-label={`Remove a subcolumn from ${d.name}`}
                          onClick={() => onChange((x) => setSubcolumnCount(x, di, subCount(d) - 1))}>−</button>
                        <button title="Add a subcolumn"
                          aria-label={`Add a subcolumn to ${d.name}`}
                          onClick={() => onChange((x) => setSubcolumnCount(x, di, subCount(d) + 1))}>+</button>
                      </>
                    )}
                    {t.datasets.length > 1 && (
                      <button title={`Delete ${shape.datasetNoun.toLowerCase()}`}
                        aria-label={`Delete ${d.name}`}
                        onClick={() => onChange((x) => deleteDataset(x, di))}>✕</button>
                    )}
                  </span>
                )}
              </th>
            ))}
            <th className="rowtools" />
          </tr>
          {showSubhead && (
            <tr className="subhead">
              <th className="rownum" />
              {t.datasets.map((d, di) => t.type === "multivariable" ? (
                <th key={di}>
                  <select className="var-type" value={d.varType ?? "continuous"}
                    disabled={readOnly}
                    aria-label={`${d.name} variable type`}
                    onChange={(e) => onChange((x) => setVarType(x, di, e.target.value as VarType))}>
                    <option value="continuous">Continuous</option>
                    <option value="categorical">Categorical</option>
                  </select>
                </th>
              ) : (
                Array.from({ length: subCount(d) }, (_, s) => (
                  <th key={`${di}-${s}`}>
                    <input className="sub-title" value={d.subTitles?.[s] ?? ""}
                      placeholder={subLabel(t.type, di, s)}
                      readOnly={readOnly || t.type === "survival"
                        || t.subcolumnFormat !== "replicates"}
                      aria-label={`${d.name} subcolumn ${s + 1} title`}
                      onChange={(e) => onChange((x) => setSubTitle(x, di, s, e.target.value),
                        key(`sub:${di}:${s}`))} />
                  </th>
                ))
              ))}
              <th className="rowtools" />
            </tr>
          )}
        </thead>
        <tbody>
          {Array.from({ length: nRows }, (_, r) => (
            <tr key={r}>
              <td className="rownum">{r + 1}</td>
              {shape.hasRowTitles && (
                <th className="row-label">
                  <input className="ds-name" value={t.rowTitles[r] ?? ""}
                    data-r={r} data-c={rowTitleCol}
                    readOnly={readOnly}
                    aria-label={`Row ${r + 1} title`}
                    onChange={(e) => onChange((x) => setRowTitle(x, r, e.target.value),
                      key(`rt:${r}`))}
                    onKeyDown={onKeyDown}
                    onPaste={(e) => onPaste(e, r, rowTitleCol)} />
                </th>
              )}
              {shape.hasX && (() => {
                const ex = isExcluded(t, { kind: "x", row: r });
                return (
                  <td className={ex ? "excluded" : undefined}>
                    {cellInput(r, xCol, t.x[r], (v) => onChange((x) => setX(x, r, v),
                      key(`x:${r}`)), {
                      excluded: ex, text: t.xFormat !== "numbers", label: `X, row ${r + 1}`,
                    })}
                  </td>
                );
              })()}
              {t.datasets.map((d, di) =>
                d.rows[r]?.map((v, s) => {
                  const ex = isExcluded(t, { kind: "y", dataset: di, row: r, sub: s });
                  return (
                    <td key={`${di}-${s}`} className={ex ? "excluded" : undefined}>
                      {cellInput(r, dsBase[di] + s, v,
                        (nv) => onChange((x) => setCell(x, di, r, s, nv),
                          key(`c:${di}:${r}:${s}`)),
                        {
                          excluded: ex,
                          text: !numeric && d.varType === "categorical",
                          label: `${d.name}, ${subCount(d) > 1
                            ? `${d.subTitles?.[s] || subLabel(t.type, di, s)}, ` : ""}row ${r + 1}`,
                        })}
                    </td>
                  );
                }),
              )}
              <td className="rowtools">
                {!readOnly && nRows > 1 && (
                  <button title="Delete row" aria-label={`Delete row ${r + 1}`}
                    onClick={() => onChange((x) => deleteRow(x, r))}>✕</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-actions">
        {!readOnly && (
          <>
            <button onClick={() => onChange(addRow)}>+ Row</button>
            <button onClick={() => onChange((x) => addDataset(x))}>
              + {shape.datasetNoun}
            </button>
          </>
        )}
        {datasetHint && <span className="hint">{datasetHint}</span>}
      </div>
    </div>
  );
}
